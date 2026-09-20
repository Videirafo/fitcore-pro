-- FITCORE PRO — #85 Execution Analytics + Next Best Action
BEGIN;

CREATE TABLE IF NOT EXISTS fitcore_execution_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  proposal_id text NOT NULL,
  rule_version integer NOT NULL DEFAULT 1,
  action_id text NULL,
  reason_code text NOT NULL,
  priority text NOT NULL,
  state text NOT NULL DEFAULT 'proposed',
  resource_id uuid NULL,
  execution_id text NULL,
  trace_id text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, proposal_id),
  CHECK (proposal_id ~ '^nba_[0-9a-f]{32}$'),
  CHECK (rule_version BETWEEN 1 AND 1000),
  CHECK (action_id IS NULL OR action_id ~ '^[a-z0-9_.:-]{3,160}$'),
  CHECK (reason_code ~ '^[a-z0-9_.:-]{3,120}$'),
  CHECK (priority IN ('low','medium','high','critical')),
  CHECK (state IN ('proposed','executed','failed','dismissed','expired')),
  CHECK (execution_id IS NULL OR execution_id ~ '^exe_[0-9a-f]{32}$'),
  CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$')
);

CREATE INDEX IF NOT EXISTS idx_fitcore_execution_decisions_tenant_state
  ON fitcore_execution_decisions (tenant_id, state, atualizado_em DESC);

ALTER TABLE fitcore_execution_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_execution_decisions;
CREATE POLICY tenant_isolation ON fitcore_execution_decisions
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
REVOKE ALL ON fitcore_execution_decisions FROM PUBLIC;

CREATE OR REPLACE FUNCTION fitcore_execution_analytics(
  p_tenant_id uuid,
  p_window_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_window_hours NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'execution_analytics_window_invalid';
  END IF;

  WITH scoped AS (
    SELECT r.*
    FROM fitcore_execution_runs r
    WHERE r.tenant_id=p_tenant_id
      AND r.criado_em >= now() - make_interval(hours => p_window_hours)
  ),
  summary AS (
    SELECT
      count(*)::bigint AS runs,
      count(*) FILTER (WHERE state='succeeded')::bigint AS succeeded,
      count(*) FILTER (WHERE state='failed')::bigint AS failed,
      count(*) FILTER (WHERE state='retry_wait')::bigint AS retry_wait,
      count(*) FILTER (WHERE state='dead_letter')::bigint AS dead_letter,
      count(*) FILTER (WHERE state IN ('executing','settlement_pending'))::bigint AS in_progress,
      count(*) FILTER (
        WHERE state IN ('executing','settlement_pending')
          AND atualizado_em < now() - interval '5 minutes'
      )::bigint AS stale,
      avg(extract(epoch FROM (completed_at-started_at))*1000)
        FILTER (WHERE started_at IS NOT NULL AND completed_at IS NOT NULL) AS avg_duration_ms,
      avg(extract(epoch FROM (completed_at-settlement_started_at))*1000)
        FILTER (WHERE settlement_started_at IS NOT NULL AND completed_at IS NOT NULL) AS avg_settlement_ms
    FROM scoped
  ),
  by_action AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'action_id',x.action_id,
      'source',x.source,
      'runs',x.runs,
      'succeeded',x.succeeded,
      'failed',x.failed,
      'retry_wait',x.retry_wait,
      'dead_letter',x.dead_letter,
      'avg_duration_ms',x.avg_duration_ms
    ) ORDER BY x.action_id,x.source),'[]'::jsonb) AS data
    FROM (
      SELECT action_id,source,count(*)::bigint AS runs,
        count(*) FILTER (WHERE state='succeeded')::bigint AS succeeded,
        count(*) FILTER (WHERE state='failed')::bigint AS failed,
        count(*) FILTER (WHERE state='retry_wait')::bigint AS retry_wait,
        count(*) FILTER (WHERE state='dead_letter')::bigint AS dead_letter,
        round(avg(extract(epoch FROM (completed_at-started_at))*1000)
          FILTER (WHERE started_at IS NOT NULL AND completed_at IS NOT NULL),2) AS avg_duration_ms
      FROM scoped GROUP BY action_id,source
    ) x
  ),
  counts AS (
    SELECT
      (SELECT count(*)::bigint FROM fitcore_execution_attempts a JOIN scoped r ON r.id=a.execution_run_id) AS attempts,
      (SELECT count(*)::bigint FROM fitcore_execution_operations o JOIN scoped r ON r.id=o.execution_run_id) AS operations
  ),
  alerts AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'code',code,'severity',severity,'count',count_value,'message',message
    ) ORDER BY rank),'[]'::jsonb) AS data
    FROM (
      SELECT 1 AS rank,'execution_dead_letter'::text AS code,'critical'::text AS severity,
        s.dead_letter AS count_value,'Execuções em dead-letter exigem revisão operacional.'::text AS message
      FROM summary s WHERE s.dead_letter>0
      UNION ALL
      SELECT 2,'execution_retry_wait','high',s.retry_wait,'Execuções aguardando retry precisam de acompanhamento.'
      FROM summary s WHERE s.retry_wait>0
      UNION ALL
      SELECT 3,'execution_stale_in_progress','high',s.stale,'Execuções stale podem exigir recovery/reconciliação.'
      FROM summary s WHERE s.stale>0
    ) a
  ),
  recent AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'trace_id',x.trace_id,
      'execution_id',x.execution_id,
      'action_id',x.action_id,
      'source',x.source,
      'state',x.state,
      'error_code',x.error_code,
      'created_at',x.criado_em,
      'updated_at',x.atualizado_em
    ) ORDER BY x.criado_em DESC),'[]'::jsonb) AS data
    FROM (
      SELECT trace_id,execution_id,action_id,source,state,error_code,criado_em,atualizado_em
      FROM scoped ORDER BY criado_em DESC LIMIT 20
    ) x
  )
  SELECT jsonb_build_object(
    'window_hours',p_window_hours,
    'summary',jsonb_build_object(
      'runs',s.runs,
      'attempts',c.attempts,
      'operations',c.operations,
      'succeeded',s.succeeded,
      'failed',s.failed,
      'retry_wait',s.retry_wait,
      'dead_letter',s.dead_letter,
      'in_progress',s.in_progress,
      'stale',s.stale,
      'success_rate_pct',CASE WHEN s.runs=0 THEN 0 ELSE round((s.succeeded::numeric/s.runs::numeric)*100,2) END,
      'avg_duration_ms',round(COALESCE(s.avg_duration_ms,0),2),
      'avg_settlement_ms',round(COALESCE(s.avg_settlement_ms,0),2)
    ),
    'by_action',b.data,
    'alerts',a.data,
    'recent',r.data
  )
  INTO v_result
  FROM summary s CROSS JOIN counts c CROSS JOIN by_action b CROSS JOIN alerts a CROSS JOIN recent r;

  RETURN COALESCE(v_result,'{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_record_decision(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_proposal_id text,
  p_rule_version integer,
  p_action_id text,
  p_reason_code text,
  p_priority text,
  p_resource_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row fitcore_execution_decisions%rowtype;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fitcore_users u WHERE u.id=p_actor_user_id AND u.tenant_id=p_tenant_id AND u.ativo
  ) THEN RAISE EXCEPTION 'execution_actor_forbidden'; END IF;
  IF p_proposal_id !~ '^nba_[0-9a-f]{32}$'
     OR p_rule_version NOT BETWEEN 1 AND 1000
     OR (p_action_id IS NOT NULL AND p_action_id !~ '^[a-z0-9_.:-]{3,160}$')
     OR p_reason_code !~ '^[a-z0-9_.:-]{3,120}$'
     OR p_priority NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'execution_decision_invalid';
  END IF;

  SELECT * INTO v_row FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id FOR UPDATE;

  IF FOUND THEN
    IF v_row.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_row.rule_version<>p_rule_version
      OR v_row.action_id IS DISTINCT FROM p_action_id
      OR v_row.reason_code<>p_reason_code
      OR v_row.priority<>p_priority
      OR v_row.resource_id IS DISTINCT FROM p_resource_id THEN
      RAISE EXCEPTION 'execution_decision_binding_conflict';
    END IF;
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO fitcore_execution_decisions(
    tenant_id,actor_user_id,proposal_id,rule_version,action_id,reason_code,priority,resource_id
  ) VALUES (
    p_tenant_id,p_actor_user_id,p_proposal_id,p_rule_version,p_action_id,p_reason_code,p_priority,p_resource_id
  ) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_validate_decision(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_proposal_id text,
  p_action_id text,
  p_resource_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row fitcore_execution_decisions%rowtype;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NULL
     OR p_proposal_id !~ '^nba_[0-9a-f]{32}$'
     OR p_action_id !~ '^[a-z0-9_.:-]{3,160}$'
     OR p_resource_id IS NULL THEN
    RAISE EXCEPTION 'execution_decision_invalid';
  END IF;

  SELECT * INTO v_row
  FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'execution_decision_not_found'; END IF;
  IF v_row.actor_user_id IS DISTINCT FROM p_actor_user_id
     OR v_row.action_id IS DISTINCT FROM p_action_id
     OR v_row.resource_id IS DISTINCT FROM p_resource_id THEN
    RAISE EXCEPTION 'execution_decision_binding_conflict';
  END IF;
  IF v_row.state NOT IN ('proposed','executed') THEN
    RAISE EXCEPTION 'execution_decision_transition_forbidden';
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_execution_transition_decision(
  p_tenant_id uuid,
  p_proposal_id text,
  p_to_state text,
  p_execution_id text DEFAULT NULL,
  p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row fitcore_execution_decisions%rowtype;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_proposal_id !~ '^nba_[0-9a-f]{32}$'
     OR p_to_state NOT IN ('executed','failed','dismissed','expired')
     OR (p_execution_id IS NOT NULL AND p_execution_id !~ '^exe_[0-9a-f]{32}$')
     OR (p_trace_id IS NOT NULL AND p_trace_id !~ '^[0-9a-f]{32}$') THEN
    RAISE EXCEPTION 'execution_decision_transition_invalid';
  END IF;

  SELECT * INTO v_row FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_decision_not_found'; END IF;

  IF v_row.state=p_to_state THEN RETURN to_jsonb(v_row); END IF;
  IF v_row.state<>'proposed' THEN RAISE EXCEPTION 'execution_decision_transition_forbidden'; END IF;

  UPDATE fitcore_execution_decisions SET
    state=p_to_state,
    execution_id=COALESCE(p_execution_id,execution_id),
    trace_id=COALESCE(p_trace_id,trace_id),
    atualizado_em=now()
  WHERE id=v_row.id RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_execution_analytics(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_record_decision(uuid,uuid,text,integer,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_validate_decision(uuid,uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_execution_transition_decision(uuid,text,text,text,text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_execution_analytics(uuid,integer) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_record_decision(uuid,uuid,text,integer,text,text,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_validate_decision(uuid,uuid,text,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_execution_transition_decision(uuid,text,text,text,text) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '024-execution-analytics-nba',
  'Execution Analytics, alertas operacionais e decision ledger Next Best Action sobre o Kernel V2',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET descricao=EXCLUDED.descricao,status=EXCLUDED.status;

COMMIT;
