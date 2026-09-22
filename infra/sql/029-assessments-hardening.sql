-- FITCORE PRO — #92 hardening follow-up
-- Fixes tenant-context consent lookup, serialized template versions and correct active measurement trends.
BEGIN;

CREATE OR REPLACE FUNCTION fitcore_assessment_current_consent(
  p_tenant_id uuid,
  p_student_id uuid,
  p_scope text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_state text;
BEGIN
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'assessment_tenant_context_mismatch';
  END IF;

  SELECT c.state INTO v_state
  FROM fitcore_assessment_consents c
  WHERE c.tenant_id=p_tenant_id
    AND c.student_id=p_student_id
    AND c.scope=p_scope
  ORDER BY c.occurred_at DESC,c.id DESC
  LIMIT 1;

  RETURN COALESCE(v_state,'missing');
END;
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_template_code,0));

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

CREATE OR REPLACE FUNCTION fitcore_assessment_record(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_student_id uuid,
  p_template_code text,
  p_template_version integer,
  p_assessment_kind text,
  p_responses jsonb DEFAULT '{}'::jsonb,
  p_measurements jsonb DEFAULT '[]'::jsonb,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_supersedes_assessment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_student_id uuid;
  v_template fitcore_assessment_templates%rowtype;
  v_assessment fitcore_assessments%rowtype;
  v_previous fitcore_assessments%rowtype;
  v_item jsonb;
  v_count integer;
  v_object_key text;
BEGIN
  v_student_id:=fitcore_assessment_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );

  IF fitcore_assessment_current_consent(p_tenant_id,v_student_id,'assessment_data')<>'granted' THEN
    RAISE EXCEPTION 'assessment_consent_required';
  END IF;
  IF p_assessment_kind NOT IN ('anamnesis','physical')
     OR jsonb_typeof(COALESCE(p_responses,'{}'::jsonb))<>'object'
     OR jsonb_typeof(COALESCE(p_measurements,'[]'::jsonb))<>'array'
     OR jsonb_typeof(COALESCE(p_attachments,'[]'::jsonb))<>'array'
     OR octet_length(COALESCE(p_responses,'{}'::jsonb)::text)>65536 THEN
    RAISE EXCEPTION 'assessment_record_invalid';
  END IF;

  SELECT * INTO v_template
  FROM fitcore_assessment_templates
  WHERE tenant_id=p_tenant_id
    AND template_code=p_template_code
    AND version=p_template_version
    AND assessment_kind=p_assessment_kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment_template_not_found'; END IF;

  IF p_actor_role='aluno' THEN
    IF p_assessment_kind<>'anamnesis'
       OR jsonb_array_length(COALESCE(p_measurements,'[]'::jsonb))>0
       OR jsonb_array_length(COALESCE(p_attachments,'[]'::jsonb))>0 THEN
      RAISE EXCEPTION 'assessment_student_write_forbidden';
    END IF;
  ELSIF p_actor_role NOT IN ('gestor','professor') THEN
    RAISE EXCEPTION 'assessment_role_forbidden';
  END IF;

  IF jsonb_array_length(COALESCE(p_measurements,'[]'::jsonb))>64
     OR jsonb_array_length(COALESCE(p_attachments,'[]'::jsonb))>12 THEN
    RAISE EXCEPTION 'assessment_record_invalid';
  END IF;

  IF p_supersedes_assessment_id IS NOT NULL THEN
    SELECT * INTO v_previous
    FROM fitcore_assessments
    WHERE tenant_id=p_tenant_id AND student_id=v_student_id AND id=p_supersedes_assessment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'assessment_supersedes_invalid'; END IF;
    IF v_previous.assessment_kind IS DISTINCT FROM p_assessment_kind THEN
      RAISE EXCEPTION 'assessment_supersedes_kind_mismatch';
    END IF;
  END IF;

  INSERT INTO fitcore_assessments(
    tenant_id,student_id,template_id,template_code,template_version,assessment_kind,
    responses,recorded_by_user_id,supersedes_assessment_id
  ) VALUES (
    p_tenant_id,v_student_id,v_template.id,v_template.template_code,v_template.version,
    v_template.assessment_kind,COALESCE(p_responses,'{}'::jsonb),p_actor_user_id,
    p_supersedes_assessment_id
  ) RETURNING * INTO v_assessment;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_measurements,'[]'::jsonb))
  LOOP
    IF COALESCE(v_item->>'code','') !~ '^[a-z0-9_.:-]{2,80}
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
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'assessment_tenant_context_mismatch';
  END IF;

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
    ), active_measurements AS (
      SELECT
        m.measurement_code,m.value,m.unit,m.recorded_at,m.id,
        row_number() OVER (
          PARTITION BY m.measurement_code ORDER BY m.recorded_at DESC,m.id DESC
        ) rn,
        count(*) OVER (PARTITION BY m.measurement_code) sample_count
      FROM fitcore_assessment_measurements m
      JOIN fitcore_assessments a ON a.id=m.assessment_id
      WHERE m.tenant_id=p_tenant_id
        AND m.student_id=v_student_id
        AND NOT EXISTS (
          SELECT 1
          FROM fitcore_assessments newer
          WHERE newer.tenant_id=a.tenant_id
            AND newer.student_id=a.student_id
            AND newer.supersedes_assessment_id=a.id
        )
    ), per_measurement AS (
      SELECT
        measurement_code,
        max(unit) FILTER (WHERE rn=1) latest_unit,
        max(unit) FILTER (WHERE rn=2) previous_unit,
        max(value) FILTER (WHERE rn=1) latest_value,
        max(value) FILTER (WHERE rn=2) previous_value,
        max(recorded_at) FILTER (WHERE rn=1) latest_at,
        max(sample_count) sample_count
      FROM active_measurements
      GROUP BY measurement_code
    ), trends AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'measurement_code',measurement_code,
        'unit',latest_unit,
        'latest_value',latest_value,
        'previous_value',previous_value,
        'previous_unit',previous_unit,
        'delta',CASE
          WHEN latest_value IS NOT NULL
           AND previous_value IS NOT NULL
           AND latest_unit=previous_unit
          THEN latest_value-previous_value
          ELSE NULL END,
        'unit_compatible',CASE
          WHEN previous_value IS NULL THEN NULL
          ELSE latest_unit=previous_unit END,
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
        'raw_responses_in_summary',false,'attachments_in_summary',false,
        'superseded_measurements_excluded',true,'unit_safe_delta',true
      )
    )
    FROM base b LEFT JOIN trends t ON true
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '029-assessments-hardening',
  'Hardening #92: tenant-safe consent, serialized template versions, active/unit-safe measurement trends',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;

       OR COALESCE(v_item->>'unit','')='' OR length(v_item->>'unit')>30
       OR jsonb_typeof(v_item->'value') NOT IN ('number','string') THEN
      RAISE EXCEPTION 'assessment_measurement_invalid';
    END IF;
    BEGIN
      INSERT INTO fitcore_assessment_measurements(
        tenant_id,student_id,assessment_id,measurement_code,value,unit,method,recorded_at
      ) VALUES (
        p_tenant_id,v_student_id,v_assessment.id,v_item->>'code',
        (v_item->>'value')::numeric,v_item->>'unit',NULLIF(v_item->>'method',''),
        v_assessment.recorded_at
      );
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'assessment_measurement_invalid';
    END;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_attachments,'[]'::jsonb))
  LOOP
    v_object_key:=COALESCE(v_item->>'object_key','');
    IF p_actor_role='aluno'
       OR length(COALESCE(v_item->>'label',''))<1
       OR v_object_key ~* '^https?://'
       OR position(p_tenant_id::text in v_object_key)=0
       OR position(v_student_id::text in v_object_key)=0
       OR COALESCE(v_item->>'media_type','') !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+
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
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'assessment_tenant_context_mismatch';
  END IF;

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
    ), active_measurements AS (
      SELECT
        m.measurement_code,m.value,m.unit,m.recorded_at,m.id,
        row_number() OVER (
          PARTITION BY m.measurement_code ORDER BY m.recorded_at DESC,m.id DESC
        ) rn,
        count(*) OVER (PARTITION BY m.measurement_code) sample_count
      FROM fitcore_assessment_measurements m
      JOIN fitcore_assessments a ON a.id=m.assessment_id
      WHERE m.tenant_id=p_tenant_id
        AND m.student_id=v_student_id
        AND NOT EXISTS (
          SELECT 1
          FROM fitcore_assessments newer
          WHERE newer.tenant_id=a.tenant_id
            AND newer.student_id=a.student_id
            AND newer.supersedes_assessment_id=a.id
        )
    ), per_measurement AS (
      SELECT
        measurement_code,
        max(unit) FILTER (WHERE rn=1) latest_unit,
        max(unit) FILTER (WHERE rn=2) previous_unit,
        max(value) FILTER (WHERE rn=1) latest_value,
        max(value) FILTER (WHERE rn=2) previous_value,
        max(recorded_at) FILTER (WHERE rn=1) latest_at,
        max(sample_count) sample_count
      FROM active_measurements
      GROUP BY measurement_code
    ), trends AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'measurement_code',measurement_code,
        'unit',latest_unit,
        'latest_value',latest_value,
        'previous_value',previous_value,
        'previous_unit',previous_unit,
        'delta',CASE
          WHEN latest_value IS NOT NULL
           AND previous_value IS NOT NULL
           AND latest_unit=previous_unit
          THEN latest_value-previous_value
          ELSE NULL END,
        'unit_compatible',CASE
          WHEN previous_value IS NULL THEN NULL
          ELSE latest_unit=previous_unit END,
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
        'raw_responses_in_summary',false,'attachments_in_summary',false,
        'superseded_measurements_excluded',true,'unit_safe_delta',true
      )
    )
    FROM base b LEFT JOIN trends t ON true
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '029-assessments-hardening',
  'Hardening #92: tenant-safe consent, serialized template versions, active/unit-safe measurement trends',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;

       OR COALESCE(v_item->>'sha256','') !~ '^[0-9a-f]{64}
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
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'assessment_tenant_context_mismatch';
  END IF;

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
    ), active_measurements AS (
      SELECT
        m.measurement_code,m.value,m.unit,m.recorded_at,m.id,
        row_number() OVER (
          PARTITION BY m.measurement_code ORDER BY m.recorded_at DESC,m.id DESC
        ) rn,
        count(*) OVER (PARTITION BY m.measurement_code) sample_count
      FROM fitcore_assessment_measurements m
      JOIN fitcore_assessments a ON a.id=m.assessment_id
      WHERE m.tenant_id=p_tenant_id
        AND m.student_id=v_student_id
        AND NOT EXISTS (
          SELECT 1
          FROM fitcore_assessments newer
          WHERE newer.tenant_id=a.tenant_id
            AND newer.student_id=a.student_id
            AND newer.supersedes_assessment_id=a.id
        )
    ), per_measurement AS (
      SELECT
        measurement_code,
        max(unit) FILTER (WHERE rn=1) latest_unit,
        max(unit) FILTER (WHERE rn=2) previous_unit,
        max(value) FILTER (WHERE rn=1) latest_value,
        max(value) FILTER (WHERE rn=2) previous_value,
        max(recorded_at) FILTER (WHERE rn=1) latest_at,
        max(sample_count) sample_count
      FROM active_measurements
      GROUP BY measurement_code
    ), trends AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'measurement_code',measurement_code,
        'unit',latest_unit,
        'latest_value',latest_value,
        'previous_value',previous_value,
        'previous_unit',previous_unit,
        'delta',CASE
          WHEN latest_value IS NOT NULL
           AND previous_value IS NOT NULL
           AND latest_unit=previous_unit
          THEN latest_value-previous_value
          ELSE NULL END,
        'unit_compatible',CASE
          WHEN previous_value IS NULL THEN NULL
          ELSE latest_unit=previous_unit END,
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
        'raw_responses_in_summary',false,'attachments_in_summary',false,
        'superseded_measurements_excluded',true,'unit_safe_delta',true
      )
    )
    FROM base b LEFT JOIN trends t ON true
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '029-assessments-hardening',
  'Hardening #92: tenant-safe consent, serialized template versions, active/unit-safe measurement trends',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
 THEN
      RAISE EXCEPTION 'assessment_attachment_invalid';
    END IF;
    BEGIN
      INSERT INTO fitcore_assessment_attachments(
        tenant_id,student_id,assessment_id,label,object_key,media_type,sha256,size_bytes
      ) VALUES (
        p_tenant_id,v_student_id,v_assessment.id,v_item->>'label',v_object_key,
        v_item->>'media_type',v_item->>'sha256',(v_item->>'size_bytes')::bigint
      );
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'assessment_attachment_invalid';
    END;
  END LOOP;

  INSERT INTO fitcore_assessment_events(
    tenant_id,student_id,assessment_id,actor_user_id,event_type,detail
  ) VALUES (
    p_tenant_id,v_student_id,v_assessment.id,p_actor_user_id,
    CASE WHEN p_supersedes_assessment_id IS NULL THEN 'recorded' ELSE 'supersedes' END,
    jsonb_build_object(
      'template_code',v_assessment.template_code,'template_version',v_assessment.template_version,
      'assessment_kind',v_assessment.assessment_kind,
      'supersedes_assessment_id',p_supersedes_assessment_id
    )
  );

  SELECT count(*) INTO v_count FROM fitcore_assessment_measurements WHERE assessment_id=v_assessment.id;
  RETURN jsonb_build_object(
    'id',v_assessment.id,'student_id',v_assessment.student_id,
    'template_code',v_assessment.template_code,'template_version',v_assessment.template_version,
    'assessment_kind',v_assessment.assessment_kind,'recorded_at',v_assessment.recorded_at,
    'supersedes_assessment_id',v_assessment.supersedes_assessment_id,
    'measurement_count',v_count,
    'attachment_count',(SELECT count(*) FROM fitcore_assessment_attachments WHERE assessment_id=v_assessment.id)
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
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'assessment_tenant_context_mismatch';
  END IF;

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
    ), active_measurements AS (
      SELECT
        m.measurement_code,m.value,m.unit,m.recorded_at,m.id,
        row_number() OVER (
          PARTITION BY m.measurement_code ORDER BY m.recorded_at DESC,m.id DESC
        ) rn,
        count(*) OVER (PARTITION BY m.measurement_code) sample_count
      FROM fitcore_assessment_measurements m
      JOIN fitcore_assessments a ON a.id=m.assessment_id
      WHERE m.tenant_id=p_tenant_id
        AND m.student_id=v_student_id
        AND NOT EXISTS (
          SELECT 1
          FROM fitcore_assessments newer
          WHERE newer.tenant_id=a.tenant_id
            AND newer.student_id=a.student_id
            AND newer.supersedes_assessment_id=a.id
        )
    ), per_measurement AS (
      SELECT
        measurement_code,
        max(unit) FILTER (WHERE rn=1) latest_unit,
        max(unit) FILTER (WHERE rn=2) previous_unit,
        max(value) FILTER (WHERE rn=1) latest_value,
        max(value) FILTER (WHERE rn=2) previous_value,
        max(recorded_at) FILTER (WHERE rn=1) latest_at,
        max(sample_count) sample_count
      FROM active_measurements
      GROUP BY measurement_code
    ), trends AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'measurement_code',measurement_code,
        'unit',latest_unit,
        'latest_value',latest_value,
        'previous_value',previous_value,
        'previous_unit',previous_unit,
        'delta',CASE
          WHEN latest_value IS NOT NULL
           AND previous_value IS NOT NULL
           AND latest_unit=previous_unit
          THEN latest_value-previous_value
          ELSE NULL END,
        'unit_compatible',CASE
          WHEN previous_value IS NULL THEN NULL
          ELSE latest_unit=previous_unit END,
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
        'raw_responses_in_summary',false,'attachments_in_summary',false,
        'superseded_measurements_excluded',true,'unit_safe_delta',true
      )
    )
    FROM base b LEFT JOIN trends t ON true
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '029-assessments-hardening',
  'Hardening #92: tenant-safe consent, serialized template versions, active/unit-safe measurement trends',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
