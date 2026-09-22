-- FITCORE PRO — rollback #92 hardening 029
-- Restores the exact function behavior from migration 028.
BEGIN;

CREATE OR REPLACE FUNCTION fitcore_assessment_current_consent(
  p_tenant_id uuid,
  p_student_id uuid,
  p_scope text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path=public
AS $function$
  SELECT COALESCE((
    SELECT c.state
    FROM fitcore_assessment_consents c
    WHERE c.tenant_id=p_tenant_id
      AND c.student_id=p_student_id
      AND c.scope=p_scope
    ORDER BY c.occurred_at DESC,c.id DESC
    LIMIT 1
  ),'missing');
$function$;

CREATE OR REPLACE FUNCTION fitcore_assessment_template_publish(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_template_code text,
  p_title text,
  p_assessment_kind text,
  p_schema_json jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_version integer;
  v_row fitcore_assessment_templates%rowtype;
BEGIN
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'assessment_tenant_context_mismatch';
  END IF;
  IF p_actor_role<>'gestor' THEN RAISE EXCEPTION 'assessment_template_forbidden'; END IF;
  IF p_template_code !~ '^[a-z0-9_.:-]{3,80}$'
     OR length(trim(COALESCE(p_title,'')))<3
     OR p_assessment_kind NOT IN ('anamnesis','physical')
     OR jsonb_typeof(COALESCE(p_schema_json,'{}'::jsonb))<>'object'
     OR octet_length(COALESCE(p_schema_json,'{}'::jsonb)::text)>65536 THEN
    RAISE EXCEPTION 'assessment_template_invalid';
  END IF;

  SELECT COALESCE(max(version),0)+1 INTO v_version
  FROM fitcore_assessment_templates
  WHERE tenant_id=p_tenant_id AND template_code=p_template_code;

  INSERT INTO fitcore_assessment_templates(
    tenant_id,template_code,version,title,assessment_kind,schema_json,created_by_user_id
  ) VALUES (
    p_tenant_id,p_template_code,v_version,trim(p_title),p_assessment_kind,
    COALESCE(p_schema_json,'{}'::jsonb),p_actor_user_id
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',v_row.id,'template_code',v_row.template_code,'version',v_row.version,
    'title',v_row.title,'assessment_kind',v_row.assessment_kind,'created_at',v_row.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_assessment_summary(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_student_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_student_id uuid;
BEGIN
  v_student_id:=fitcore_assessment_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );

  RETURN (
    WITH base AS (
      SELECT
        count(*)::bigint total,
        count(*) FILTER (WHERE assessment_kind='anamnesis')::bigint anamnesis_count,
        count(*) FILTER (WHERE assessment_kind='physical')::bigint physical_count,
        max(recorded_at) last_assessment_at,
        max(recorded_at) FILTER (WHERE assessment_kind='anamnesis') last_anamnesis_at,
        max(recorded_at) FILTER (WHERE assessment_kind='physical') last_physical_at
      FROM fitcore_assessments
      WHERE tenant_id=p_tenant_id AND student_id=v_student_id
    ), ranked AS (
      SELECT
        m.measurement_code,m.value,m.unit,m.recorded_at,
        row_number() OVER (
          PARTITION BY m.measurement_code ORDER BY m.recorded_at DESC,m.id DESC
        ) rn
      FROM fitcore_assessment_measurements m
      WHERE m.tenant_id=p_tenant_id AND m.student_id=v_student_id
    ), per_measurement AS (
      SELECT
        measurement_code,
        max(unit) FILTER (WHERE rn=1) unit,
        max(value) FILTER (WHERE rn=1) latest_value,
        max(value) FILTER (WHERE rn=2) previous_value,
        max(recorded_at) FILTER (WHERE rn=1) latest_at,
        count(*) sample_count
      FROM ranked
      WHERE rn<=2
      GROUP BY measurement_code
    ), trends AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'measurement_code',measurement_code,
        'unit',unit,
        'latest_value',latest_value,
        'previous_value',previous_value,
        'delta',CASE
          WHEN latest_value IS NOT NULL AND previous_value IS NOT NULL
          THEN latest_value-previous_value
          ELSE NULL END,
        'latest_at',latest_at,
        'sample_count',sample_count
      ) ORDER BY measurement_code),'[]'::jsonb) data
      FROM per_measurement
    )
    SELECT jsonb_build_object(
      'student_id',v_student_id,
      'assessment_count',b.total,
      'anamnesis_count',b.anamnesis_count,
      'physical_count',b.physical_count,
      'last_assessment_at',b.last_assessment_at,
      'last_anamnesis_at',b.last_anamnesis_at,
      'last_physical_at',b.last_physical_at,
      'assessment_data_consent',fitcore_assessment_current_consent(p_tenant_id,v_student_id,'assessment_data'),
      'ai_coach_allowed',fitcore_assessment_current_consent(p_tenant_id,v_student_id,'ai_coach_derived_signals')='granted',
      'measurement_trends',COALESCE(t.data,'[]'::jsonb),
      'signals_policy',jsonb_build_object(
        'server_side_only',true,'descriptive_only',true,'clinical_inference',false,
        'raw_responses_in_summary',false,'attachments_in_summary',false
      )
    )
    FROM base b LEFT JOIN trends t ON true
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_template_publish(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_summary(uuid,uuid,text,uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_template_publish(uuid,uuid,text,text,text,text,jsonb) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_summary(uuid,uuid,text,uuid) TO fitcore_app;
  END IF;
END $$;

DELETE FROM fitcore_schema_migrations WHERE version='029-assessments-hardening';
COMMIT;
