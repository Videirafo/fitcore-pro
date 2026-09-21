-- FITCORE PRO — #90 Execution Remediation
-- Governed retry/dead-letter routing without payload persistence or alternate mutation authority.
BEGIN;

CREATE TABLE IF NOT EXISTS fitcore_execution_remediations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_run_id uuid NOT NULL,
  remediation_id text NOT NULL,
  status text NOT NULL,
  severity text NOT NULL,
  route text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  backoff_seconds integer NOT NULL,
  next_retry_at timestamptz NULL,
  last_retry_at timestamptz NULL,
  resolved_at timestamptz NULL,
  resolution_code text NULL,
  created_by_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, remediation_id),
  UNIQUE (tenant_id, execution_run_id),
  FOREIGN KEY (tenant_id, execution_run_id)
    REFERENCES fitcore_execution_runs(tenant_id, id) ON DELETE CASCADE,
  CHECK (remediation_id ~ '^rem_[0-9a-f]{32}$'),
  CHECK (status IN ('scheduled','ready','processing','resolved','dead_letter','dismissed')),
  CHECK (severity IN ('critical','high','medium')),
  CHECK (route IN ('ops_critical','ops_retry','ops_standard')),
  CHECK (retry_count BETWEEN 0 AND 1000),
  CHECK (max_attempts BETWEEN 1 AND 10),
  CHECK (backoff_seconds BETWEEN 5 AND 3600),
  CHECK (resolution_code IS NULL OR resolution_code ~ '^[a-z0-9_.:-]{3,120}$')
);

CREATE INDEX IF NOT EXISTS idx_fitcore_execution_remediations_queue
  ON fitcore_execution_remediations (tenant_id,status,next_retry_at,atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fitcore_execution_remediations_route
  ON fitcore_execution_remediations (tenant_id,route,severity,atualizado_em DESC);

CREATE TABLE IF NOT EXISTS fitcore_execution_remediation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  remediation_id uuid NOT NULL,
  version integer NOT NULL,
  actor_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NOT NULL,
  reason_code text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (remediation_id,version),
  FOREIGN KEY (tenant_id, remediation_id)
    REFERENCES fitcore_execution_remediations(tenant_id,id) ON DELETE CASCADE,
  CHECK (version BETWEEN 1 AND 1000000),
  CHECK (event_type ~ '^remediation\.[a-z0-9_.:-]{3,80}$'),
  CHECK (from_status IS NULL OR from_status IN ('scheduled','ready','processing','resolved','dead_letter','dismissed')),
  CHECK (to_status IN ('scheduled','ready','processing','resolved','dead_letter','dismissed')),
  CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9_.:-]{3,120}$'),
  CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=2048)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_execution_remediation_events
  ON fitcore_execution_remediation_events (tenant_id,remediation_id,version DESC);

ALTER TABLE fitcore_execution_remediations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_execution_remediation_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'fitcore_execution_remediations','fitcore_execution_remediation_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',v_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id::text=current_setting(''app.tenant_id'',true))',
      v_table
    );
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fitcore_execution_remediation_policy(
  p_action_id text,
  p_state text,
  p_retry_count integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
SELECT jsonb_build_object(
  'severity',CASE WHEN p_state='dead_letter' THEN 'critical' ELSE 'high' END,
  'route',CASE WHEN p_state='dead_letter' THEN 'ops_critical' ELSE 'ops_retry' END,
  'max_attempts',CASE WHEN p_action_id='fitcore.workout.exercise.complete' THEN 5 ELSE 3 END,
  'backoff_seconds',LEAST(30 * (2 ^ LEAST(GREATEST(COALESCE(p_retry_count,0),0),5))::integer,900),
  'retry_allowed',p_state='retry_wait'
);
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_remediation_event_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_version integer;
  v_reason text;
  v_actor uuid;
  v_from text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_from:=NULL;
    v_reason:='detected';
    v_actor:=NEW.created_by_user_id;
  ELSE
    IF OLD.status=NEW.status
       AND OLD.retry_count=NEW.retry_count
       AND OLD.next_retry_at IS NOT DISTINCT FROM NEW.next_retry_at
       AND OLD.resolution_code IS NOT DISTINCT FROM NEW.resolution_code THEN
      RETURN NEW;
    END IF;
    v_from:=OLD.status;
    v_reason:=COALESCE(NEW.resolution_code,'state_changed');
    v_actor:=NEW.created_by_user_id;
  END IF;
  SELECT COALESCE(max(version),0)+1 INTO v_version
  FROM fitcore_execution_remediation_events WHERE remediation_id=NEW.id;
  INSERT INTO fitcore_execution_remediation_events(
    tenant_id,remediation_id,version,actor_user_id,event_type,
    from_status,to_status,reason_code,metadata
  ) VALUES (
    NEW.tenant_id,NEW.id,v_version,v_actor,'remediation.'||NEW.status,
    v_from,NEW.status,v_reason,
    jsonb_build_object(
      'retry_count',NEW.retry_count,
      'max_attempts',NEW.max_attempts,
      'route',NEW.route,
      'severity',NEW.severity
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fitcore_execution_remediation_event_audit ON fitcore_execution_remediations;
CREATE TRIGGER fitcore_execution_remediation_event_audit
AFTER INSERT OR UPDATE ON fitcore_execution_remediations
FOR EACH ROW EXECUTE FUNCTION fitcore_execution_remediation_event_trigger();

CREATE OR REPLACE FUNCTION fitcore_execution_remediation_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_policy jsonb;
  v_retry_count integer;
  v_remediation_id text;
  v_status text;
  v_resolution text;
BEGIN
  IF NEW.state NOT IN ('retry_wait','dead_letter','succeeded','failed','cancelled','expired') THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(count(*)::integer-1,0) INTO v_retry_count
  FROM fitcore_execution_attempts a
  WHERE a.tenant_id=NEW.tenant_id AND a.execution_run_id=NEW.id;

  v_remediation_id := 'rem_'||md5(NEW.tenant_id::text||':'||NEW.execution_id);

  IF NEW.state IN ('retry_wait','dead_letter') THEN
    v_policy:=fitcore_execution_remediation_policy(NEW.action_id,NEW.state,v_retry_count);
    v_status:=CASE WHEN NEW.state='dead_letter' THEN 'dead_letter' ELSE 'scheduled' END;
    INSERT INTO fitcore_execution_remediations(
      tenant_id,execution_run_id,remediation_id,status,severity,route,
      retry_count,max_attempts,backoff_seconds,next_retry_at,resolved_at,resolution_code
    ) VALUES (
      NEW.tenant_id,NEW.id,v_remediation_id,v_status,
      v_policy->>'severity',v_policy->>'route',v_retry_count,
      (v_policy->>'max_attempts')::integer,(v_policy->>'backoff_seconds')::integer,
      CASE WHEN NEW.state='retry_wait'
        THEN now()+make_interval(secs=>(v_policy->>'backoff_seconds')::integer)
        ELSE NULL END,
      NULL,NULL
    )
    ON CONFLICT (tenant_id,execution_run_id) DO UPDATE SET
      status=EXCLUDED.status,
      severity=EXCLUDED.severity,
      route=EXCLUDED.route,
      retry_count=EXCLUDED.retry_count,
      max_attempts=EXCLUDED.max_attempts,
      backoff_seconds=EXCLUDED.backoff_seconds,
      next_retry_at=EXCLUDED.next_retry_at,
      resolved_at=NULL,
      resolution_code=NULL,
      atualizado_em=now();
    RETURN NEW;
  END IF;

  v_resolution:='execution_'||NEW.state;
  UPDATE fitcore_execution_remediations SET
    status=CASE WHEN NEW.state IN ('cancelled','expired') THEN 'dismissed' ELSE 'resolved' END,
    next_retry_at=NULL,
    resolved_at=COALESCE(resolved_at,now()),
    resolution_code=v_resolution,
    atualizado_em=now()
  WHERE tenant_id=NEW.tenant_id AND execution_run_id=NEW.id
    AND status NOT IN ('resolved','dismissed');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fitcore_execution_remediation_sync ON fitcore_execution_runs;
CREATE TRIGGER fitcore_execution_remediation_sync
AFTER INSERT OR UPDATE OF state ON fitcore_execution_runs
FOR EACH ROW EXECUTE FUNCTION fitcore_execution_remediation_sync_trigger();

INSERT INTO fitcore_execution_remediations(
  tenant_id,execution_run_id,remediation_id,status,severity,route,
  retry_count,max_attempts,backoff_seconds,next_retry_at,resolved_at,resolution_code
)
SELECT
  r.tenant_id,r.id,'rem_'||md5(r.tenant_id::text||':'||r.execution_id),
  CASE WHEN r.state='dead_letter' THEN 'dead_letter' ELSE 'scheduled' END,
  p.policy->>'severity',p.policy->>'route',p.retry_count,
  (p.policy->>'max_attempts')::integer,(p.policy->>'backoff_seconds')::integer,
  CASE WHEN r.state='retry_wait' THEN now()+make_interval(secs=>(p.policy->>'backoff_seconds')::integer) ELSE NULL END,
  NULL,NULL
FROM fitcore_execution_runs r
CROSS JOIN LATERAL (
  SELECT
    GREATEST((SELECT count(*)::integer FROM fitcore_execution_attempts a
      WHERE a.tenant_id=r.tenant_id AND a.execution_run_id=r.id)-1,0) retry_count
) c
CROSS JOIN LATERAL (
  SELECT c.retry_count,fitcore_execution_remediation_policy(r.action_id,r.state,c.retry_count) policy
) p
WHERE r.state IN ('retry_wait','dead_letter')
ON CONFLICT (tenant_id,execution_run_id) DO NOTHING;

CREATE OR REPLACE FUNCTION fitcore_execution_remediation_preview(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_remediation_id text,
  p_binding_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_rem fitcore_execution_remediations%rowtype;
  v_run fitcore_execution_runs%rowtype;
  v_allowed boolean;
  v_code text;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NULL OR p_remediation_id !~ '^rem_[0-9a-f]{32}$'
     OR p_binding_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'execution_remediation_invalid';
  END IF;
  SELECT * INTO v_rem FROM fitcore_execution_remediations
  WHERE tenant_id=p_tenant_id AND remediation_id=p_remediation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_remediation_not_found'; END IF;
  SELECT * INTO v_run FROM fitcore_execution_runs
  WHERE tenant_id=p_tenant_id AND id=v_rem.execution_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_not_found'; END IF;
  IF v_run.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'execution_remediation_actor_mismatch';
  END IF;
  IF v_run.binding_hash<>p_binding_hash THEN
    RAISE EXCEPTION 'execution_remediation_binding_conflict';
  END IF;

  v_allowed :=
    v_run.state='retry_wait'
    AND v_rem.status IN ('scheduled','ready')
    AND v_rem.retry_count < v_rem.max_attempts
    AND COALESCE(v_rem.next_retry_at,now()) <= now();
  v_code := CASE
    WHEN v_run.state<>'retry_wait' THEN 'execution_remediation_state_forbidden'
    WHEN v_rem.status NOT IN ('scheduled','ready') THEN 'execution_remediation_status_forbidden'
    WHEN v_rem.retry_count>=v_rem.max_attempts THEN 'execution_remediation_retry_exhausted'
    WHEN COALESCE(v_rem.next_retry_at,now())>now() THEN 'execution_remediation_backoff_active'
    ELSE 'ready'
  END;

  RETURN jsonb_build_object(
    'allowed',v_allowed,'code',v_code,
    'remediation_id',v_rem.remediation_id,
    'status',v_rem.status,'severity',v_rem.severity,'route',v_rem.route,
    'retry_count',v_rem.retry_count,'max_attempts',v_rem.max_attempts,
    'backoff_seconds',v_rem.backoff_seconds,'next_retry_at',v_rem.next_retry_at,
    'execution_id',v_run.execution_id,'trace_id',v_run.trace_id,
    'action_id',v_run.action_id,'action_version',v_run.action_version,'source',v_run.source,
    'run_state',v_run.state
  );
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_prepare_remediation_retry(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_remediation_id text,
  p_binding_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_rem fitcore_execution_remediations%rowtype;
  v_run fitcore_execution_runs%rowtype;
  v_occurrence integer;
  v_attempt_id text;
  v_operation_id text;
  v_attempt_row uuid;
  v_operation_row uuid;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NULL OR p_remediation_id !~ '^rem_[0-9a-f]{32}$'
     OR p_binding_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'execution_remediation_invalid';
  END IF;

  SELECT * INTO v_rem FROM fitcore_execution_remediations
  WHERE tenant_id=p_tenant_id AND remediation_id=p_remediation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_remediation_not_found'; END IF;
  SELECT * INTO v_run FROM fitcore_execution_runs
  WHERE tenant_id=p_tenant_id AND id=v_rem.execution_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_not_found'; END IF;
  IF v_run.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'execution_remediation_actor_mismatch';
  END IF;
  IF v_run.binding_hash<>p_binding_hash THEN
    RAISE EXCEPTION 'execution_remediation_binding_conflict';
  END IF;

  IF v_rem.status='processing' AND v_run.state='admitted' THEN
    SELECT a.attempt_id,a.occurrence,o.operation_id
      INTO v_attempt_id,v_occurrence,v_operation_id
    FROM fitcore_execution_attempts a
    JOIN fitcore_execution_operations o
      ON o.tenant_id=a.tenant_id AND o.execution_run_id=a.execution_run_id
      AND o.execution_attempt_id=a.id
    WHERE a.tenant_id=p_tenant_id AND a.execution_run_id=v_run.id
      AND a.state='admitted' AND o.state='admitted'
    ORDER BY a.occurrence DESC LIMIT 1;
    IF v_attempt_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'allowed',true,'replayed',true,'remediation_id',v_rem.remediation_id,
        'run_id',v_run.id,'execution_id',v_run.execution_id,'trace_id',v_run.trace_id,
        'attempt_id',v_attempt_id,'operation_id',v_operation_id,'occurrence',v_occurrence,
        'action_id',v_run.action_id,'action_version',v_run.action_version,'source',v_run.source,
        'retry_count',v_rem.retry_count,'max_attempts',v_rem.max_attempts
      );
    END IF;
  END IF;

  IF v_run.state<>'retry_wait' OR v_rem.status NOT IN ('scheduled','ready') THEN
    RAISE EXCEPTION 'execution_remediation_state_forbidden';
  END IF;
  IF COALESCE(v_rem.next_retry_at,now())>now() THEN
    RETURN jsonb_build_object(
      'allowed',false,'code','execution_remediation_backoff_active',
      'remediation_id',v_rem.remediation_id,'next_retry_at',v_rem.next_retry_at,
      'retry_count',v_rem.retry_count,'max_attempts',v_rem.max_attempts
    );
  END IF;
  IF v_rem.retry_count>=v_rem.max_attempts THEN
    UPDATE fitcore_execution_runs SET state='dead_letter',error_code='retry_exhausted',
      completed_at=COALESCE(completed_at,now()),atualizado_em=now()
      WHERE id=v_run.id;
    UPDATE fitcore_execution_attempts SET state='dead_letter',error_code='retry_exhausted',
      completed_at=COALESCE(completed_at,now()),atualizado_em=now()
      WHERE tenant_id=p_tenant_id AND execution_run_id=v_run.id AND state='retry_wait';
    UPDATE fitcore_execution_operations SET state='dead_letter',error_code='retry_exhausted',
      completed_at=COALESCE(completed_at,now()),atualizado_em=now()
      WHERE tenant_id=p_tenant_id AND execution_run_id=v_run.id AND state='retry_wait';
    UPDATE fitcore_execution_remediations SET status='dead_letter',severity='critical',
      route='ops_critical',next_retry_at=NULL,resolution_code='retry_exhausted',atualizado_em=now()
      WHERE id=v_rem.id;
    INSERT INTO fitcore_execution_events(
      tenant_id,execution_run_id,event_type,from_state,to_state,metadata
    ) VALUES (
      p_tenant_id,v_run.id,'execution.retry_exhausted','retry_wait','dead_letter',
      jsonb_build_object('remediation_id',v_rem.remediation_id,'retry_count',v_rem.retry_count)
    );
    RETURN jsonb_build_object(
      'allowed',false,'code','execution_remediation_retry_exhausted',
      'remediation_id',v_rem.remediation_id,'retry_count',v_rem.retry_count,
      'max_attempts',v_rem.max_attempts
    );
  END IF;

  SELECT COALESCE(max(occurrence),-1)+1 INTO v_occurrence
  FROM fitcore_execution_attempts
  WHERE tenant_id=p_tenant_id AND execution_run_id=v_run.id;
  v_attempt_id:='att_'||md5(v_run.execution_id||':remediation:'||v_occurrence::text);
  v_operation_id:='op_'||md5(v_run.execution_id||':'||v_run.action_id||':remediation:'||v_occurrence::text);

  INSERT INTO fitcore_execution_attempts(
    tenant_id,execution_run_id,attempt_id,occurrence,state
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt_id,v_occurrence,'admitted'
  ) RETURNING id INTO v_attempt_row;

  INSERT INTO fitcore_execution_operations(
    tenant_id,execution_run_id,execution_attempt_id,operation_id,
    action_id,action_version,state
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt_row,v_operation_id,
    v_run.action_id,v_run.action_version,'admitted'
  ) RETURNING id INTO v_operation_row;

  UPDATE fitcore_execution_runs SET
    state='admitted',error_code=NULL,completed_at=NULL,settlement_started_at=NULL,atualizado_em=now()
  WHERE id=v_run.id RETURNING * INTO v_run;

  UPDATE fitcore_execution_remediations SET
    status='processing',retry_count=retry_count+1,last_retry_at=now(),
    next_retry_at=NULL,created_by_user_id=p_actor_user_id,resolution_code=NULL,atualizado_em=now()
  WHERE id=v_rem.id RETURNING * INTO v_rem;

  INSERT INTO fitcore_execution_events(
    tenant_id,execution_run_id,execution_attempt_id,execution_operation_id,
    event_type,from_state,to_state,metadata
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt_row,v_operation_row,
    'execution.remediation_retry_admitted','retry_wait','admitted',
    jsonb_build_object('remediation_id',v_rem.remediation_id,'occurrence',v_occurrence)
  );

  RETURN jsonb_build_object(
    'allowed',true,'replayed',false,'remediation_id',v_rem.remediation_id,
    'run_id',v_run.id,'execution_id',v_run.execution_id,'trace_id',v_run.trace_id,
    'attempt_id',v_attempt_id,'operation_id',v_operation_id,'occurrence',v_occurrence,
    'action_id',v_run.action_id,'action_version',v_run.action_version,'source',v_run.source,
    'retry_count',v_rem.retry_count,'max_attempts',v_rem.max_attempts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_remediation_action(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_remediation_id text,
  p_action text,
  p_reason_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_rem fitcore_execution_remediations%rowtype;
  v_run fitcore_execution_runs%rowtype;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NULL OR p_remediation_id !~ '^rem_[0-9a-f]{32}$'
     OR p_action NOT IN ('dismiss','mark_ready')
     OR (p_reason_code IS NOT NULL AND p_reason_code !~ '^[a-z0-9_.:-]{3,120}$') THEN
    RAISE EXCEPTION 'execution_remediation_action_invalid';
  END IF;
  SELECT * INTO v_rem FROM fitcore_execution_remediations
  WHERE tenant_id=p_tenant_id AND remediation_id=p_remediation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_remediation_not_found'; END IF;
  SELECT * INTO v_run FROM fitcore_execution_runs
  WHERE tenant_id=p_tenant_id AND id=v_rem.execution_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_not_found'; END IF;

  IF p_action='dismiss' THEN
    IF v_rem.status NOT IN ('dead_letter','scheduled','ready') THEN
      RAISE EXCEPTION 'execution_remediation_status_forbidden';
    END IF;
    UPDATE fitcore_execution_remediations SET
      status='dismissed',next_retry_at=NULL,resolved_at=now(),
      resolution_code=COALESCE(p_reason_code,'operator_dismissed'),
      created_by_user_id=p_actor_user_id,atualizado_em=now()
    WHERE id=v_rem.id RETURNING * INTO v_rem;
  ELSE
    IF v_run.state<>'retry_wait' OR v_rem.status<>'scheduled' THEN
      RAISE EXCEPTION 'execution_remediation_status_forbidden';
    END IF;
    UPDATE fitcore_execution_remediations SET
      status='ready',next_retry_at=now(),
      resolution_code=NULL,created_by_user_id=p_actor_user_id,atualizado_em=now()
    WHERE id=v_rem.id RETURNING * INTO v_rem;
  END IF;

  RETURN jsonb_build_object(
    'remediation_id',v_rem.remediation_id,'status',v_rem.status,
    'severity',v_rem.severity,'route',v_rem.route,
    'retry_count',v_rem.retry_count,'max_attempts',v_rem.max_attempts,
    'next_retry_at',v_rem.next_retry_at,'resolution_code',v_rem.resolution_code
  );
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_remediation_dashboard(
  p_tenant_id uuid,
  p_window_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_window_hours NOT BETWEEN 1 AND 8760 THEN
    RAISE EXCEPTION 'execution_remediation_window_invalid';
  END IF;

  WITH scoped AS (
    SELECT m.*,r.execution_id,r.trace_id,r.action_id,r.state run_state,r.error_code
    FROM fitcore_execution_remediations m
    JOIN fitcore_execution_runs r
      ON r.tenant_id=m.tenant_id AND r.id=m.execution_run_id
    WHERE m.tenant_id=p_tenant_id
      AND m.criado_em>=now()-make_interval(hours=>p_window_hours)
  ), summary AS (
    SELECT
      count(*)::bigint total,
      count(*) FILTER (WHERE status IN ('scheduled','ready'))::bigint awaiting_retry,
      count(*) FILTER (WHERE status='processing')::bigint processing,
      count(*) FILTER (WHERE status='dead_letter')::bigint dead_letter,
      count(*) FILTER (WHERE status='resolved')::bigint resolved,
      count(*) FILTER (WHERE status='dismissed')::bigint dismissed,
      COALESCE(sum(retry_count),0)::bigint retries,
      avg(extract(epoch FROM (resolved_at-criado_em))*1000)
        FILTER (WHERE resolved_at IS NOT NULL) avg_mttr_ms
    FROM scoped
  ), routes AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'route',route,'severity',severity,'count',count_value
    ) ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,route),'[]'::jsonb) data
    FROM (
      SELECT route,severity,count(*)::bigint count_value
      FROM scoped
      WHERE status IN ('scheduled','ready','processing','dead_letter')
      GROUP BY route,severity
    ) x
  ), items AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'remediation_id',remediation_id,'execution_id',execution_id,'trace_id',trace_id,
      'action_id',action_id,'run_state',run_state,'status',status,
      'severity',severity,'route',route,'error_code',error_code,
      'retry_count',retry_count,'max_attempts',max_attempts,
      'backoff_seconds',backoff_seconds,'next_retry_at',next_retry_at,
      'last_retry_at',last_retry_at,'resolved_at',resolved_at,
      'resolution_code',resolution_code,
      'age_ms',round(extract(epoch FROM (now()-criado_em))*1000)
    ) ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
      atualizado_em DESC),'[]'::jsonb) data
    FROM (SELECT * FROM scoped ORDER BY atualizado_em DESC LIMIT 100) q
  )
  SELECT jsonb_build_object(
    'version',1,'window_hours',p_window_hours,
    'policy',jsonb_build_object(
      'authority','execution-kernel',
      'payload_persisted',false,
      'manual_retry_requires_original_actor',true,
      'backoff','exponential-capped-900s'
    ),
    'summary',jsonb_build_object(
      'total',s.total,'awaiting_retry',s.awaiting_retry,'processing',s.processing,
      'dead_letter',s.dead_letter,'resolved',s.resolved,'dismissed',s.dismissed,
      'retries',s.retries,'avg_mttr_ms',round(COALESCE(s.avg_mttr_ms,0),2)
    ),
    'routes',r.data,'items',i.data
  ) INTO v_result
  FROM summary s CROSS JOIN routes r CROSS JOIN items i;
  RETURN COALESCE(v_result,'{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_execution_remediation_policy(text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_remediation_preview(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_prepare_remediation_retry(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_remediation_action(uuid,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_remediation_dashboard(uuid,integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT SELECT ON fitcore_execution_remediations,fitcore_execution_remediation_events TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_remediation_policy(text,text,integer) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_remediation_preview(uuid,uuid,text,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_prepare_remediation_retry(uuid,uuid,text,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_remediation_action(uuid,uuid,text,text,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_remediation_dashboard(uuid,integer) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '026-execution-remediation',
  'Execution Remediation: retry/backoff/dead-letter routing, replay-safe retry and MTTR',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET
  descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
