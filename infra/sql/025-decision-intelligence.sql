-- FITCORE PRO — #89 Decision Intelligence
-- Additive lifecycle: proposal -> accept/reject -> execution -> settlement -> outcome.
BEGIN;

ALTER TABLE fitcore_execution_decisions
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS execution_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS outcome_code text NULL,
  ADD COLUMN IF NOT EXISTS outcome_metric_name text NULL,
  ADD COLUMN IF NOT EXISTS outcome_metric_value numeric(18,4) NULL,
  ADD COLUMN IF NOT EXISTS outcome_window_hours integer NULL,
  ADD COLUMN IF NOT EXISTS evidence_version integer NOT NULL DEFAULT 1;

ALTER TABLE fitcore_execution_decisions
  DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_state_check,
  DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_outcome_code_check,
  DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_outcome_metric_name_check,
  DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_outcome_window_check,
  DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_evidence_version_check;

UPDATE fitcore_execution_decisions
SET state='settled',
    accepted_at=COALESCE(accepted_at,criado_em),
    execution_started_at=COALESCE(execution_started_at,criado_em),
    settled_at=COALESCE(settled_at,atualizado_em)
WHERE state='executed';

ALTER TABLE fitcore_execution_decisions
  ADD CONSTRAINT fitcore_execution_decisions_state_check
  CHECK (state IN ('proposed','accepted','rejected','executing','settled','outcome_recorded','failed','dismissed','expired')),
  ADD CONSTRAINT fitcore_execution_decisions_outcome_code_check
  CHECK (outcome_code IS NULL OR outcome_code ~ '^[a-z0-9_.:-]{3,120}$'),
  ADD CONSTRAINT fitcore_execution_decisions_outcome_metric_name_check
  CHECK (outcome_metric_name IS NULL OR outcome_metric_name ~ '^[a-z0-9_.:-]{3,120}$'),
  ADD CONSTRAINT fitcore_execution_decisions_outcome_window_check
  CHECK (outcome_window_hours IS NULL OR outcome_window_hours BETWEEN 1 AND 8760),
  ADD CONSTRAINT fitcore_execution_decisions_evidence_version_check
  CHECK (evidence_version BETWEEN 1 AND 1000);

CREATE TABLE IF NOT EXISTS fitcore_execution_decision_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES fitcore_execution_decisions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  actor_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_state text NULL,
  to_state text NOT NULL,
  reason_code text NULL,
  execution_id text NULL,
  trace_id text NULL,
  outcome_code text NULL,
  outcome_metric_name text NULL,
  outcome_metric_value numeric(18,4) NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, version),
  CHECK (version BETWEEN 1 AND 1000000),
  CHECK (event_type IN ('migration_baseline','proposed','accepted','rejected','executing','settled','outcome_recorded','failed','dismissed','expired')),
  CHECK (from_state IS NULL OR from_state IN ('proposed','accepted','rejected','executing','settled','outcome_recorded','failed','dismissed','expired')),
  CHECK (to_state IN ('proposed','accepted','rejected','executing','settled','outcome_recorded','failed','dismissed','expired')),
  CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9_.:-]{3,120}$'),
  CHECK (execution_id IS NULL OR execution_id ~ '^exe_[0-9a-f]{32}$'),
  CHECK (trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'),
  CHECK (outcome_code IS NULL OR outcome_code ~ '^[a-z0-9_.:-]{3,120}$'),
  CHECK (outcome_metric_name IS NULL OR outcome_metric_name ~ '^[a-z0-9_.:-]{3,120}$')
);

CREATE INDEX IF NOT EXISTS idx_fitcore_decision_events_tenant_decision
  ON fitcore_execution_decision_events (tenant_id, decision_id, version DESC);

ALTER TABLE fitcore_execution_decision_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_execution_decision_events;
CREATE POLICY tenant_isolation ON fitcore_execution_decision_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
REVOKE ALL ON fitcore_execution_decision_events FROM PUBLIC;

INSERT INTO fitcore_execution_decision_events(
  tenant_id,decision_id,version,actor_user_id,event_type,from_state,to_state,reason_code,
  execution_id,trace_id,outcome_code,outcome_metric_name,outcome_metric_value,criado_em
)
SELECT d.tenant_id,d.id,1,d.actor_user_id,'migration_baseline',NULL,d.state,d.reason_code,
       d.execution_id,d.trace_id,d.outcome_code,d.outcome_metric_name,d.outcome_metric_value,d.criado_em
FROM fitcore_execution_decisions d
WHERE NOT EXISTS (
  SELECT 1 FROM fitcore_execution_decision_events e WHERE e.decision_id=d.id
)
ON CONFLICT (decision_id,version) DO NOTHING;

CREATE OR REPLACE FUNCTION fitcore_decision_track_proposal(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_proposal_id text
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
  SELECT * INTO v_row FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_decision_not_found'; END IF;
  IF v_row.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'execution_decision_actor_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fitcore_execution_decision_events WHERE decision_id=v_row.id) THEN
    INSERT INTO fitcore_execution_decision_events(
      tenant_id,decision_id,version,actor_user_id,event_type,from_state,to_state,reason_code,criado_em
    ) VALUES (
      p_tenant_id,v_row.id,1,p_actor_user_id,'proposed',NULL,'proposed',v_row.reason_code,v_row.criado_em
    );
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_decision_validate_accepted(
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
  IF p_actor_user_id IS NULL OR p_proposal_id !~ '^nba_[0-9a-f]{32}$'
     OR p_action_id !~ '^[a-z0-9_.:-]{3,160}$' OR p_resource_id IS NULL THEN
    RAISE EXCEPTION 'execution_decision_invalid';
  END IF;
  SELECT * INTO v_row FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_decision_not_found'; END IF;
  IF v_row.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'execution_decision_actor_mismatch';
  END IF;
  IF v_row.action_id IS DISTINCT FROM p_action_id OR v_row.resource_id IS DISTINCT FROM p_resource_id THEN
    RAISE EXCEPTION 'execution_decision_binding_conflict';
  END IF;
  IF v_row.state='proposed' THEN RAISE EXCEPTION 'execution_decision_accept_required'; END IF;
  IF v_row.state NOT IN ('accepted','executing','settled','outcome_recorded') THEN
    RAISE EXCEPTION 'execution_decision_transition_forbidden';
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_decision_transition(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_proposal_id text,
  p_to_state text,
  p_execution_id text DEFAULT NULL,
  p_trace_id text DEFAULT NULL,
  p_reason_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row fitcore_execution_decisions%rowtype;
  v_from text;
  v_version integer;
  v_allowed boolean := false;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NULL OR p_proposal_id !~ '^nba_[0-9a-f]{32}$'
     OR p_to_state NOT IN ('accepted','rejected','executing','settled','failed','dismissed','expired')
     OR (p_execution_id IS NOT NULL AND p_execution_id !~ '^exe_[0-9a-f]{32}$')
     OR (p_trace_id IS NOT NULL AND p_trace_id !~ '^[0-9a-f]{32}$')
     OR (p_reason_code IS NOT NULL AND p_reason_code !~ '^[a-z0-9_.:-]{3,120}$') THEN
    RAISE EXCEPTION 'execution_decision_transition_invalid';
  END IF;

  SELECT * INTO v_row FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_decision_not_found'; END IF;
  IF v_row.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'execution_decision_actor_mismatch';
  END IF;
  IF v_row.execution_id IS NOT NULL AND p_execution_id IS NOT NULL AND v_row.execution_id<>p_execution_id THEN
    RAISE EXCEPTION 'execution_decision_binding_conflict';
  END IF;
  IF v_row.trace_id IS NOT NULL AND p_trace_id IS NOT NULL AND v_row.trace_id<>p_trace_id THEN
    RAISE EXCEPTION 'execution_decision_binding_conflict';
  END IF;
  IF v_row.state=p_to_state THEN RETURN to_jsonb(v_row); END IF;
  IF v_row.state='outcome_recorded' AND p_to_state IN ('settled','failed') THEN RETURN to_jsonb(v_row); END IF;

  v_from := v_row.state;
  v_allowed := CASE
    WHEN v_from='proposed' AND p_to_state IN ('accepted','rejected','dismissed','expired') THEN true
    WHEN v_from='accepted' AND p_to_state IN ('executing','failed','dismissed') THEN true
    WHEN v_from='executing' AND p_to_state IN ('settled','failed') THEN true
    ELSE false
  END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'execution_decision_transition_forbidden'; END IF;

  UPDATE fitcore_execution_decisions SET
    state=p_to_state,
    execution_id=COALESCE(p_execution_id,execution_id),
    trace_id=COALESCE(p_trace_id,trace_id),
    accepted_at=CASE WHEN p_to_state='accepted' THEN COALESCE(accepted_at,now()) ELSE accepted_at END,
    rejected_at=CASE WHEN p_to_state='rejected' THEN COALESCE(rejected_at,now()) ELSE rejected_at END,
    execution_started_at=CASE WHEN p_to_state='executing' THEN COALESCE(execution_started_at,now()) ELSE execution_started_at END,
    settled_at=CASE WHEN p_to_state IN ('settled','failed') THEN COALESCE(settled_at,now()) ELSE settled_at END,
    atualizado_em=now()
  WHERE id=v_row.id RETURNING * INTO v_row;
  SELECT COALESCE(max(version),0)+1 INTO v_version
  FROM fitcore_execution_decision_events WHERE decision_id=v_row.id;
  INSERT INTO fitcore_execution_decision_events(
    tenant_id,decision_id,version,actor_user_id,event_type,from_state,to_state,reason_code,execution_id,trace_id
  ) VALUES (
    p_tenant_id,v_row.id,v_version,p_actor_user_id,p_to_state,v_from,p_to_state,
    COALESCE(p_reason_code,v_row.reason_code),v_row.execution_id,v_row.trace_id
  );
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_decision_record_outcome(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_proposal_id text,
  p_outcome_code text,
  p_metric_name text,
  p_metric_value numeric,
  p_window_hours integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row fitcore_execution_decisions%rowtype;
  v_from text;
  v_version integer;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'execution_tenant_required'; END IF;
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'execution_tenant_context_mismatch';
  END IF;
  IF p_actor_user_id IS NULL OR p_proposal_id !~ '^nba_[0-9a-f]{32}$'
     OR p_outcome_code !~ '^[a-z0-9_.:-]{3,120}$'
     OR p_metric_name !~ '^[a-z0-9_.:-]{3,120}$'
     OR p_metric_value IS NULL OR p_window_hours NOT BETWEEN 1 AND 8760 THEN
    RAISE EXCEPTION 'execution_decision_outcome_invalid';
  END IF;

  SELECT * INTO v_row FROM fitcore_execution_decisions
  WHERE tenant_id=p_tenant_id AND proposal_id=p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_decision_not_found'; END IF;
  IF v_row.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'execution_decision_actor_mismatch';
  END IF;
  IF v_row.state='outcome_recorded' THEN
    IF v_row.outcome_code=p_outcome_code
       AND v_row.outcome_metric_name=p_metric_name
       AND v_row.outcome_metric_value=p_metric_value
       AND v_row.outcome_window_hours=p_window_hours THEN
      RETURN to_jsonb(v_row);
    END IF;
    RAISE EXCEPTION 'execution_decision_outcome_conflict';
  END IF;
  IF v_row.state NOT IN ('settled','failed') THEN
    RAISE EXCEPTION 'execution_decision_transition_forbidden';
  END IF;
  v_from := v_row.state;
  UPDATE fitcore_execution_decisions SET
    state='outcome_recorded',
    outcome_code=p_outcome_code,
    outcome_metric_name=p_metric_name,
    outcome_metric_value=p_metric_value,
    outcome_window_hours=p_window_hours,
    outcome_recorded_at=now(),
    atualizado_em=now()
  WHERE id=v_row.id RETURNING * INTO v_row;

  SELECT COALESCE(max(version),0)+1 INTO v_version
  FROM fitcore_execution_decision_events WHERE decision_id=v_row.id;
  INSERT INTO fitcore_execution_decision_events(
    tenant_id,decision_id,version,actor_user_id,event_type,from_state,to_state,reason_code,
    execution_id,trace_id,outcome_code,outcome_metric_name,outcome_metric_value
  ) VALUES (
    p_tenant_id,v_row.id,v_version,p_actor_user_id,'outcome_recorded',v_from,'outcome_recorded',v_row.reason_code,
    v_row.execution_id,v_row.trace_id,p_outcome_code,p_metric_name,p_metric_value
  );
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_decision_intelligence(
  p_tenant_id uuid,
  p_window_hours integer DEFAULT 720
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
  IF p_window_hours NOT BETWEEN 1 AND 8760 THEN
    RAISE EXCEPTION 'execution_decision_window_invalid';
  END IF;

  WITH scoped AS (
    SELECT * FROM fitcore_execution_decisions
    WHERE tenant_id=p_tenant_id AND criado_em >= now()-make_interval(hours=>p_window_hours)
  ), summary AS (
    SELECT count(*)::bigint proposed,
      count(*) FILTER (WHERE accepted_at IS NOT NULL)::bigint accepted,
      count(*) FILTER (WHERE rejected_at IS NOT NULL)::bigint rejected,
      count(*) FILTER (WHERE execution_started_at IS NOT NULL)::bigint execution_started,
      count(*) FILTER (WHERE settled_at IS NOT NULL)::bigint settled,
      count(*) FILTER (WHERE outcome_recorded_at IS NOT NULL)::bigint outcomes,
      count(*) FILTER (WHERE state='failed')::bigint currently_failed
    FROM scoped
  ), by_reason AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'reason_code',x.reason_code,'action_id',x.action_id,'proposed',x.proposed,'accepted',x.accepted,
      'rejected',x.rejected,'execution_started',x.execution_started,'settled',x.settled,'outcomes',x.outcomes,
      'positive_outcomes',x.positive_outcomes
    ) ORDER BY x.reason_code,x.action_id NULLS LAST),'[]'::jsonb) data
    FROM (
      SELECT reason_code,action_id,count(*)::bigint proposed,
        count(*) FILTER (WHERE accepted_at IS NOT NULL)::bigint accepted,
        count(*) FILTER (WHERE rejected_at IS NOT NULL)::bigint rejected,
        count(*) FILTER (WHERE execution_started_at IS NOT NULL)::bigint execution_started,
        count(*) FILTER (WHERE settled_at IS NOT NULL)::bigint settled,
        count(*) FILTER (WHERE outcome_recorded_at IS NOT NULL)::bigint outcomes,
        count(*) FILTER (WHERE outcome_recorded_at IS NOT NULL AND outcome_metric_value>0)::bigint positive_outcomes
      FROM scoped GROUP BY reason_code,action_id
    ) x
  ), evidence_base AS (
    SELECT reason_code,action_id,
      count(*) FILTER (WHERE accepted_at IS NOT NULL)::bigint accepted_count,
      count(*) FILTER (WHERE settled_at IS NOT NULL)::bigint settled_count,
      count(*) FILTER (WHERE outcome_recorded_at IS NOT NULL)::bigint outcome_count,
      count(*) FILTER (WHERE outcome_recorded_at IS NOT NULL AND outcome_metric_value>0)::bigint positive_outcome_count
    FROM scoped GROUP BY reason_code,action_id
  ), evidence_ranked AS (
    SELECT *, row_number() OVER (
      ORDER BY outcome_count DESC,settled_count DESC,accepted_count DESC,reason_code ASC,action_id ASC NULLS LAST
    )::integer evidence_rank
    FROM evidence_base
  ), evidence AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'rank',evidence_rank,'reason_code',reason_code,'action_id',action_id,
      'accepted_count',accepted_count,'settled_count',settled_count,'outcome_count',outcome_count,
      'positive_outcome_count',positive_outcome_count,
      'tier',CASE WHEN outcome_count>=5 THEN 'strong' WHEN outcome_count>=3 THEN 'moderate' WHEN outcome_count>=1 THEN 'limited' ELSE 'none' END
    ) ORDER BY evidence_rank),'[]'::jsonb) data
    FROM evidence_ranked
  )
  SELECT jsonb_build_object(
    'version',1,
    'window_hours',p_window_hours,
    'rank_order',jsonb_build_array('outcome_count_desc','settled_count_desc','accepted_count_desc','reason_code_asc','action_id_asc'),
    'summary',jsonb_build_object(
      'proposed',s.proposed,'accepted',s.accepted,'rejected',s.rejected,'execution_started',s.execution_started,
      'settled',s.settled,'outcomes',s.outcomes,'currently_failed',s.currently_failed,
      'acceptance_rate_pct',CASE WHEN s.proposed=0 THEN 0 ELSE round((s.accepted::numeric/s.proposed::numeric)*100,2) END,
      'execution_rate_pct',CASE WHEN s.accepted=0 THEN 0 ELSE round((s.execution_started::numeric/s.accepted::numeric)*100,2) END,
      'settlement_rate_pct',CASE WHEN s.execution_started=0 THEN 0 ELSE round((s.settled::numeric/s.execution_started::numeric)*100,2) END,
      'outcome_rate_pct',CASE WHEN s.settled=0 THEN 0 ELSE round((s.outcomes::numeric/s.settled::numeric)*100,2) END
    ),
    'by_reason',b.data,
    'evidence',e.data
  ) INTO v_result
  FROM summary s CROSS JOIN by_reason b CROSS JOIN evidence e;
  RETURN COALESCE(v_result,'{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION fitcore_decision_track_proposal(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_decision_validate_accepted(uuid,uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_decision_transition(uuid,uuid,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_decision_record_outcome(uuid,uuid,text,text,text,numeric,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_decision_intelligence(uuid,integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT SELECT ON fitcore_execution_decision_events TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_decision_track_proposal(uuid,uuid,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_decision_validate_accepted(uuid,uuid,text,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_decision_transition(uuid,uuid,text,text,text,text,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_decision_record_outcome(uuid,uuid,text,text,text,numeric,integer) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_decision_intelligence(uuid,integer) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '025-decision-intelligence',
  'Decision Intelligence: accept/reject, execution/settlement/outcome, history and transparent evidence ranking',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET descricao=EXCLUDED.descricao,status=EXCLUDED.status;

COMMIT;
