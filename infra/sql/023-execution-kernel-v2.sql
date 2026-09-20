-- FITCORE PRO — #79 Execution Kernel V2
-- Persistence/admission/settlement for governed workout actions. Payload-free by design.

BEGIN;

CREATE TABLE IF NOT EXISTS fitcore_execution_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  submission_id text NOT NULL,
  execution_id text NOT NULL,
  trace_id text NOT NULL,
  action_id text NOT NULL,
  action_version integer NOT NULL,
  source text NOT NULL,
  idempotency_hash text NOT NULL,
  binding_hash text NOT NULL,
  state text NOT NULL DEFAULT 'planned',
  resource_id uuid NULL,
  error_code text NULL,
  started_at timestamptz NULL,
  settlement_started_at timestamptz NULL,
  completed_at timestamptz NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, submission_id),
  UNIQUE (tenant_id, execution_id),
  UNIQUE (tenant_id, source, idempotency_hash),
  CHECK (submission_id ~ '^sub_[0-9a-f]{32}$'),
  CHECK (execution_id ~ '^exe_[0-9a-f]{32}$'),
  CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  CHECK (action_id ~ '^[a-z0-9_.:-]{3,160}$' AND action_version BETWEEN 1 AND 1000),
  CHECK (source IN ('ui','hermes','automation','mcp')),
  CHECK (idempotency_hash ~ '^[0-9a-f]{64}$'),
  CHECK (binding_hash ~ '^[0-9a-f]{64}$'),
  CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,120}$'),
  CHECK (state IN (
    'planned','validated','admitted','queued','executing','settlement_pending','succeeded',
    'rejected','approval_required','retry_wait','failed','dead_letter','cancelled','expired'
  ))
);

CREATE TABLE IF NOT EXISTS fitcore_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_run_id uuid NOT NULL,
  attempt_id text NOT NULL,
  occurrence integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'planned',
  error_code text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, attempt_id),
  UNIQUE (execution_run_id, occurrence),
  FOREIGN KEY (tenant_id, execution_run_id)
    REFERENCES fitcore_execution_runs(tenant_id, id) ON DELETE CASCADE,
  CHECK (attempt_id ~ '^att_[0-9a-f]{32}$'),
  CHECK (occurrence BETWEEN 0 AND 1000),
  CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,120}$'),
  CHECK (state IN (
    'planned','validated','admitted','queued','executing','settlement_pending','succeeded',
    'rejected','approval_required','retry_wait','failed','dead_letter','cancelled','expired'
  ))
);

CREATE TABLE IF NOT EXISTS fitcore_execution_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_run_id uuid NOT NULL,
  execution_attempt_id uuid NOT NULL,
  operation_id text NOT NULL,
  action_id text NOT NULL,
  action_version integer NOT NULL,
  state text NOT NULL DEFAULT 'planned',
  resource_id uuid NULL,
  error_code text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, operation_id),
  FOREIGN KEY (tenant_id, execution_run_id)
    REFERENCES fitcore_execution_runs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, execution_attempt_id)
    REFERENCES fitcore_execution_attempts(tenant_id, id) ON DELETE CASCADE,
  CHECK (operation_id ~ '^op_[0-9a-f]{32}$'),
  CHECK (action_id ~ '^[a-z0-9_.:-]{3,160}$' AND action_version BETWEEN 1 AND 1000),
  CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,120}$'),
  CHECK (state IN (
    'planned','validated','admitted','queued','executing','settlement_pending','succeeded',
    'rejected','approval_required','retry_wait','failed','dead_letter','cancelled','expired'
  ))
);

CREATE TABLE IF NOT EXISTS fitcore_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_run_id uuid NOT NULL,
  execution_attempt_id uuid NULL,
  execution_operation_id uuid NULL,
  event_type text NOT NULL,
  from_state text NULL,
  to_state text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, execution_run_id)
    REFERENCES fitcore_execution_runs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, execution_attempt_id)
    REFERENCES fitcore_execution_attempts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, execution_operation_id)
    REFERENCES fitcore_execution_operations(tenant_id, id) ON DELETE CASCADE,
  CHECK (event_type ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (from_state IS NULL OR from_state IN (
    'planned','validated','admitted','queued','executing','settlement_pending','succeeded',
    'rejected','approval_required','retry_wait','failed','dead_letter','cancelled','expired'
  )),
  CHECK (to_state IN (
    'planned','validated','admitted','queued','executing','settlement_pending','succeeded',
    'rejected','approval_required','retry_wait','failed','dead_letter','cancelled','expired'
  )),
  CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 4096)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_execution_runs_tenant_state
  ON fitcore_execution_runs (tenant_id, state, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fitcore_execution_attempts_run
  ON fitcore_execution_attempts (tenant_id, execution_run_id, occurrence);
CREATE INDEX IF NOT EXISTS idx_fitcore_execution_operations_run
  ON fitcore_execution_operations (tenant_id, execution_run_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_fitcore_execution_events_run
  ON fitcore_execution_events (tenant_id, execution_run_id, ocorrido_em, id);

ALTER TABLE fitcore_execution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_execution_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_execution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_execution_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'fitcore_execution_runs','fitcore_execution_attempts',
    'fitcore_execution_operations','fitcore_execution_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', v_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      v_table
    );
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fitcore_execution_admit(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_submission_id text,
  p_execution_id text,
  p_attempt_id text,
  p_operation_id text,
  p_trace_id text,
  p_action_id text,
  p_action_version integer,
  p_source text,
  p_idempotency_hash text,
  p_binding_hash text
)
RETURNS TABLE(
  run_id uuid,
  run_state text,
  attempt_row_id uuid,
  operation_row_id uuid,
  created boolean,
  replayed boolean,
  resource_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_run fitcore_execution_runs%rowtype;
  v_attempt fitcore_execution_attempts%rowtype;
  v_operation fitcore_execution_operations%rowtype;
  v_created boolean := false;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF p_submission_id !~ '^sub_[0-9a-f]{32}$'
     OR p_execution_id !~ '^exe_[0-9a-f]{32}$'
     OR p_attempt_id !~ '^att_[0-9a-f]{32}$'
     OR p_operation_id !~ '^op_[0-9a-f]{32}$'
     OR p_trace_id !~ '^[0-9a-f]{32}$'
     OR p_idempotency_hash !~ '^[0-9a-f]{64}$'
     OR p_binding_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'execution_identity_invalid';
  END IF;
  IF p_action_id !~ '^[a-z0-9_.:-]{3,160}$' OR p_action_version NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'execution_action_invalid';
  END IF;
  IF p_source NOT IN ('ui','hermes','automation','mcp') THEN
    RAISE EXCEPTION 'execution_source_invalid';
  END IF;
  IF p_source <> 'automation' AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'execution_actor_required';
  END IF;
  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fitcore_users u
    WHERE u.id=p_actor_user_id AND u.tenant_id=p_tenant_id AND u.ativo
  ) THEN
    RAISE EXCEPTION 'execution_actor_forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text||':fitcore-execution:'||p_source||':'||p_idempotency_hash,79
  ));

  SELECT * INTO v_run
  FROM fitcore_execution_runs r
  WHERE r.tenant_id=p_tenant_id AND r.source=p_source AND r.idempotency_hash=p_idempotency_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_run.submission_id<>p_submission_id
       OR v_run.execution_id<>p_execution_id
       OR v_run.trace_id<>p_trace_id
       OR v_run.action_id<>p_action_id
       OR v_run.action_version<>p_action_version
       OR v_run.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_run.binding_hash<>p_binding_hash THEN
      RAISE EXCEPTION 'execution_binding_conflict';
    END IF;

    SELECT * INTO v_attempt
    FROM fitcore_execution_attempts a
    WHERE a.tenant_id=p_tenant_id AND a.execution_run_id=v_run.id AND a.attempt_id=p_attempt_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'execution_attempt_binding_conflict'; END IF;

    SELECT * INTO v_operation
    FROM fitcore_execution_operations o
    WHERE o.tenant_id=p_tenant_id
      AND o.execution_run_id=v_run.id
      AND o.execution_attempt_id=v_attempt.id
      AND o.operation_id=p_operation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'execution_operation_binding_conflict'; END IF;

    IF v_run.state IN ('admitted','executing','settlement_pending','succeeded') THEN
      RETURN QUERY SELECT v_run.id,v_run.state,v_attempt.id,v_operation.id,false,true,v_run.resource_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'execution_state_conflict';
  END IF;

  INSERT INTO fitcore_execution_runs(
    tenant_id,actor_user_id,submission_id,execution_id,trace_id,action_id,action_version,
    source,idempotency_hash,binding_hash,state
  ) VALUES (
    p_tenant_id,p_actor_user_id,p_submission_id,p_execution_id,p_trace_id,p_action_id,p_action_version,
    p_source,p_idempotency_hash,p_binding_hash,'planned'
  ) RETURNING * INTO v_run;
  v_created := true;

  INSERT INTO fitcore_execution_attempts(
    tenant_id,execution_run_id,attempt_id,occurrence,state
  ) VALUES (p_tenant_id,v_run.id,p_attempt_id,0,'planned')
  RETURNING * INTO v_attempt;

  INSERT INTO fitcore_execution_operations(
    tenant_id,execution_run_id,execution_attempt_id,operation_id,action_id,action_version,state
  ) VALUES (p_tenant_id,v_run.id,v_attempt.id,p_operation_id,p_action_id,p_action_version,'planned')
  RETURNING * INTO v_operation;

  INSERT INTO fitcore_execution_events(
    tenant_id,execution_run_id,execution_attempt_id,execution_operation_id,
    event_type,from_state,to_state,metadata
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt.id,v_operation.id,
    'execution.planned',NULL,'planned',
    jsonb_build_object('source',p_source,'action_id',p_action_id,'action_version',p_action_version)
  );

  UPDATE fitcore_execution_runs SET state='validated',atualizado_em=now()
    WHERE id=v_run.id RETURNING * INTO v_run;
  UPDATE fitcore_execution_attempts SET state='validated',atualizado_em=now()
    WHERE id=v_attempt.id RETURNING * INTO v_attempt;
  UPDATE fitcore_execution_operations SET state='validated',atualizado_em=now()
    WHERE id=v_operation.id RETURNING * INTO v_operation;
  INSERT INTO fitcore_execution_events(
    tenant_id,execution_run_id,execution_attempt_id,execution_operation_id,
    event_type,from_state,to_state,metadata
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt.id,v_operation.id,
    'execution.validated','planned','validated','{}'::jsonb
  );

  UPDATE fitcore_execution_runs SET state='admitted',atualizado_em=now()
    WHERE id=v_run.id RETURNING * INTO v_run;
  UPDATE fitcore_execution_attempts SET state='admitted',atualizado_em=now()
    WHERE id=v_attempt.id RETURNING * INTO v_attempt;
  UPDATE fitcore_execution_operations SET state='admitted',atualizado_em=now()
    WHERE id=v_operation.id RETURNING * INTO v_operation;
  INSERT INTO fitcore_execution_events(
    tenant_id,execution_run_id,execution_attempt_id,execution_operation_id,
    event_type,from_state,to_state,metadata
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt.id,v_operation.id,
    'execution.admitted','validated','admitted','{}'::jsonb
  );

  RETURN QUERY SELECT v_run.id,v_run.state,v_attempt.id,v_operation.id,v_created,false,v_run.resource_id;
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_transition(
  p_tenant_id uuid,
  p_execution_id text,
  p_attempt_id text,
  p_operation_id text,
  p_to_state text,
  p_error_code text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  run_id uuid,
  run_state text,
  attempt_state text,
  operation_state text,
  replayed boolean,
  resource_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_run fitcore_execution_runs%rowtype;
  v_attempt fitcore_execution_attempts%rowtype;
  v_operation fitcore_execution_operations%rowtype;
  v_from text;
  v_allowed boolean := false;
  v_now timestamptz := now();
BEGIN
  IF p_tenant_id IS NULL
     OR p_execution_id !~ '^exe_[0-9a-f]{32}$'
     OR p_attempt_id !~ '^att_[0-9a-f]{32}$'
     OR p_operation_id !~ '^op_[0-9a-f]{32}$'
     OR p_to_state NOT IN ('executing','settlement_pending','succeeded','failed','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'execution_transition_invalid';
  END IF;
  IF p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_.:-]{1,120}$' THEN
    RAISE EXCEPTION 'execution_transition_invalid';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata,'{}'::jsonb)) <> 'object'
     OR octet_length(COALESCE(p_metadata,'{}'::jsonb)::text) > 4096 THEN
    RAISE EXCEPTION 'execution_transition_metadata_invalid';
  END IF;
  IF p_to_state='succeeded' AND p_resource_id IS NULL THEN
    RAISE EXCEPTION 'execution_transition_resource_required';
  END IF;

  SELECT * INTO v_run FROM fitcore_execution_runs r
  WHERE r.tenant_id=p_tenant_id AND r.execution_id=p_execution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_not_found'; END IF;

  SELECT * INTO v_attempt FROM fitcore_execution_attempts a
  WHERE a.tenant_id=p_tenant_id AND a.execution_run_id=v_run.id AND a.attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_transition_binding_invalid'; END IF;

  SELECT * INTO v_operation FROM fitcore_execution_operations o
  WHERE o.tenant_id=p_tenant_id AND o.execution_run_id=v_run.id
    AND o.execution_attempt_id=v_attempt.id AND o.operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_transition_binding_invalid'; END IF;

  IF v_run.state=p_to_state AND v_attempt.state=p_to_state AND v_operation.state=p_to_state THEN
    IF p_to_state='succeeded' AND v_run.resource_id IS DISTINCT FROM p_resource_id THEN
      RAISE EXCEPTION 'execution_resource_conflict';
    END IF;
    RETURN QUERY SELECT v_run.id,v_run.state,v_attempt.state,v_operation.state,true,v_run.resource_id;
    RETURN;
  END IF;
  IF v_run.state<>v_attempt.state OR v_attempt.state<>v_operation.state THEN
    RAISE EXCEPTION 'execution_transition_binding_invalid';
  END IF;

  v_from := v_run.state;
  v_allowed := CASE
    WHEN v_from='admitted' AND p_to_state='executing' THEN true
    WHEN v_from='queued' AND p_to_state='executing' THEN true
    WHEN v_from='executing' AND p_to_state IN ('settlement_pending','failed','retry_wait','dead_letter') THEN true
    WHEN v_from='settlement_pending' AND p_to_state IN ('succeeded','failed','retry_wait','dead_letter') THEN true
    ELSE false
  END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'execution_transition_forbidden'; END IF;

  UPDATE fitcore_execution_runs AS r SET
    state=p_to_state,
    started_at=CASE WHEN p_to_state='executing' THEN COALESCE(r.started_at,v_now) ELSE r.started_at END,
    settlement_started_at=CASE WHEN p_to_state='settlement_pending' THEN COALESCE(r.settlement_started_at,v_now) ELSE r.settlement_started_at END,
    completed_at=CASE WHEN p_to_state IN ('succeeded','failed','dead_letter') THEN COALESCE(r.completed_at,v_now) ELSE r.completed_at END,
    error_code=CASE WHEN p_to_state IN ('failed','retry_wait','dead_letter') THEN p_error_code ELSE r.error_code END,
    resource_id=CASE WHEN p_to_state='succeeded' THEN p_resource_id ELSE r.resource_id END,
    atualizado_em=v_now
  WHERE r.id=v_run.id RETURNING r.* INTO v_run;

  UPDATE fitcore_execution_attempts SET
    state=p_to_state,
    started_at=CASE WHEN p_to_state='executing' THEN COALESCE(started_at,v_now) ELSE started_at END,
    completed_at=CASE WHEN p_to_state IN ('succeeded','failed','retry_wait','dead_letter') THEN COALESCE(completed_at,v_now) ELSE completed_at END,
    error_code=CASE WHEN p_to_state IN ('failed','retry_wait','dead_letter') THEN p_error_code ELSE error_code END,
    atualizado_em=v_now
  WHERE id=v_attempt.id RETURNING * INTO v_attempt;

  UPDATE fitcore_execution_operations AS o SET
    state=p_to_state,
    started_at=CASE WHEN p_to_state='executing' THEN COALESCE(o.started_at,v_now) ELSE o.started_at END,
    completed_at=CASE WHEN p_to_state IN ('succeeded','failed','retry_wait','dead_letter') THEN COALESCE(o.completed_at,v_now) ELSE o.completed_at END,
    error_code=CASE WHEN p_to_state IN ('failed','retry_wait','dead_letter') THEN p_error_code ELSE o.error_code END,
    resource_id=CASE WHEN p_to_state='succeeded' THEN p_resource_id ELSE o.resource_id END,
    atualizado_em=v_now
  WHERE o.id=v_operation.id RETURNING o.* INTO v_operation;

  INSERT INTO fitcore_execution_events(
    tenant_id,execution_run_id,execution_attempt_id,execution_operation_id,
    event_type,from_state,to_state,metadata
  ) VALUES (
    p_tenant_id,v_run.id,v_attempt.id,v_operation.id,
    'execution.'||p_to_state,v_from,p_to_state,
    COALESCE(p_metadata,'{}'::jsonb) ||
      CASE WHEN p_error_code IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('error_code',p_error_code) END
  );

  RETURN QUERY SELECT v_run.id,v_run.state,v_attempt.state,v_operation.state,false,v_run.resource_id;
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_observability(p_tenant_id uuid)
RETURNS TABLE(
  action_id text,
  source text,
  executions bigint,
  succeeded bigint,
  failed bigint,
  dead_letter bigint,
  retry_wait bigint,
  avg_duration_ms numeric,
  avg_attempts numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_forbidden';
  END IF;
  RETURN QUERY
  SELECT
    r.action_id,
    r.source,
    count(*)::bigint,
    count(*) FILTER (WHERE r.state='succeeded')::bigint,
    count(*) FILTER (WHERE r.state='failed')::bigint,
    count(*) FILTER (WHERE r.state='dead_letter')::bigint,
    count(*) FILTER (WHERE r.state='retry_wait')::bigint,
    avg(extract(epoch FROM (r.completed_at-r.started_at))*1000)
      FILTER (WHERE r.started_at IS NOT NULL AND r.completed_at IS NOT NULL),
    avg((SELECT count(*)::numeric FROM fitcore_execution_attempts a
         WHERE a.tenant_id=r.tenant_id AND a.execution_run_id=r.id))
  FROM fitcore_execution_runs r
  WHERE r.tenant_id=p_tenant_id
  GROUP BY r.action_id,r.source;
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_execution_admit(
  uuid,uuid,text,text,text,text,text,text,integer,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_transition(
  uuid,text,text,text,text,text,uuid,jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_observability(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_execution_admit(
      uuid,uuid,text,text,text,text,text,text,integer,text,text,text
    ) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_transition(
      uuid,text,text,text,text,text,uuid,jsonb
    ) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_observability(uuid) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version, descricao, status)
VALUES (
  '023-execution-kernel-v2',
  'Execution Kernel V2: admission, capability-ready lifecycle, settlement and observability for governed workout actions',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET
  descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
