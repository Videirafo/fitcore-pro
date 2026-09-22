-- FITCORE PRO — #92 Anamnese + Avaliações Físicas
-- Versioned templates, explicit consent, immutable records and server-side descriptive signals.
BEGIN;

CREATE TABLE IF NOT EXISTS fitcore_assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  assessment_kind text NOT NULL,
  schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (template_code ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (version BETWEEN 1 AND 10000),
  CHECK (length(title) BETWEEN 3 AND 180),
  CHECK (assessment_kind IN ('anamnesis','physical')),
  CHECK (jsonb_typeof(schema_json)='object'),
  UNIQUE (tenant_id,template_code,version)
);

CREATE TABLE IF NOT EXISTS fitcore_assessment_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  scope text NOT NULL,
  state text NOT NULL,
  consent_version text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope IN ('assessment_data','ai_coach_derived_signals')),
  CHECK (state IN ('granted','revoked')),
  CHECK (consent_version ~ '^[a-zA-Z0-9_.:-]{1,40}$')
);

CREATE INDEX IF NOT EXISTS idx_fitcore_assessment_consents_current
  ON fitcore_assessment_consents (tenant_id,student_id,scope,occurred_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS fitcore_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES fitcore_assessment_templates(id) ON DELETE RESTRICT,
  template_code text NOT NULL,
  template_version integer NOT NULL,
  assessment_kind text NOT NULL,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by_user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  supersedes_assessment_id uuid NULL REFERENCES fitcore_assessments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (assessment_kind IN ('anamnesis','physical')),
  CHECK (jsonb_typeof(responses)='object'),
  CHECK (octet_length(responses::text) <= 65536)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_assessments_student
  ON fitcore_assessments (tenant_id,student_id,recorded_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS fitcore_assessment_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES fitcore_assessments(id) ON DELETE RESTRICT,
  measurement_code text NOT NULL,
  value numeric(18,4) NOT NULL,
  unit text NOT NULL,
  method text NULL,
  recorded_at timestamptz NOT NULL,
  CHECK (measurement_code ~ '^[a-z0-9_.:-]{2,80}$'),
  CHECK (length(unit) BETWEEN 1 AND 30),
  CHECK (method IS NULL OR length(method) <= 120),
  CHECK (abs(value) <= 1000000)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_assessment_measurements_history
  ON fitcore_assessment_measurements (tenant_id,student_id,measurement_code,recorded_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS fitcore_assessment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES fitcore_assessments(id) ON DELETE RESTRICT,
  label text NOT NULL,
  object_key text NOT NULL,
  media_type text NOT NULL,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(label) BETWEEN 1 AND 120),
  CHECK (object_key !~* '^https?://'),
  CHECK (length(object_key) BETWEEN 8 AND 500),
  CHECK (media_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (size_bytes BETWEEN 1 AND 52428800)
);

CREATE TABLE IF NOT EXISTS fitcore_assessment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES fitcore_assessments(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('recorded','supersedes')),
  CHECK (jsonb_typeof(detail)='object')
);

CREATE INDEX IF NOT EXISTS idx_fitcore_assessment_events_student
  ON fitcore_assessment_events (tenant_id,student_id,occurred_at DESC,id DESC);

ALTER TABLE fitcore_assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_assessment_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_assessment_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_assessment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_assessment_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'fitcore_assessment_templates','fitcore_assessment_consents','fitcore_assessments',
    'fitcore_assessment_measurements','fitcore_assessment_attachments','fitcore_assessment_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',r);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id::text=current_setting(''app.tenant_id'',true))',
      r
    );
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',r);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fitcore_assessment_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'assessment_history_immutable';
END;
$function$;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'fitcore_assessment_templates','fitcore_assessment_consents','fitcore_assessments',
    'fitcore_assessment_measurements','fitcore_assessment_attachments','fitcore_assessment_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS immutable_history ON %I',r);
    EXECUTE format(
      'CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fitcore_assessment_prevent_mutation()',
      r
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fitcore_assessment_accessible_student(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
BEGIN
  RETURN fitcore_athlete_360_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );
END;
$function$;

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

CREATE OR REPLACE FUNCTION fitcore_assessment_consent_record(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_student_id uuid,
  p_scope text,
  p_state text,
  p_consent_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_student_id uuid;
  v_user_id uuid;
  v_row fitcore_assessment_consents%rowtype;
BEGIN
  v_student_id:=fitcore_assessment_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );
  SELECT user_id INTO v_user_id
  FROM fitcore_students
  WHERE tenant_id=p_tenant_id AND id=v_student_id;

  IF p_actor_role<>'aluno' OR v_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'assessment_consent_subject_required';
  END IF;
  IF p_scope NOT IN ('assessment_data','ai_coach_derived_signals')
     OR p_state NOT IN ('granted','revoked')
     OR p_consent_version !~ '^[a-zA-Z0-9_.:-]{1,40}$' THEN
    RAISE EXCEPTION 'assessment_consent_invalid';
  END IF;

  INSERT INTO fitcore_assessment_consents(
    tenant_id,student_id,actor_user_id,scope,state,consent_version
  ) VALUES (
    p_tenant_id,v_student_id,p_actor_user_id,p_scope,p_state,p_consent_version
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',v_row.id,'student_id',v_row.student_id,'scope',v_row.scope,
    'state',v_row.state,'consent_version',v_row.consent_version,'occurred_at',v_row.occurred_at
  );
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
    IF COALESCE(v_item->>'code','') !~ '^[a-z0-9_.:-]{2,80}$'
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
       OR COALESCE(v_item->>'media_type','') !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
       OR COALESCE(v_item->>'sha256','') !~ '^[0-9a-f]{64}$' THEN
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

CREATE OR REPLACE FUNCTION fitcore_assessment_history(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_student_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_student_id uuid;
  v_limit integer;
BEGIN
  v_student_id:=fitcore_assessment_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );
  v_limit:=LEAST(GREATEST(COALESCE(p_limit,50),1),100);

  RETURN jsonb_build_object(
    'student_id',v_student_id,
    'summary',fitcore_assessment_summary(p_tenant_id,p_actor_user_id,p_actor_role,v_student_id),
    'records',COALESCE((
      SELECT jsonb_agg(row_data ORDER BY recorded_at DESC)
      FROM (
        SELECT
          a.recorded_at,
          jsonb_build_object(
            'id',a.id,'template_code',a.template_code,'template_version',a.template_version,
            'assessment_kind',a.assessment_kind,'responses',a.responses,'recorded_at',a.recorded_at,
            'recorded_by_user_id',a.recorded_by_user_id,
            'supersedes_assessment_id',a.supersedes_assessment_id,
            'measurements',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'measurement_code',m.measurement_code,'value',m.value,'unit',m.unit,
                'method',m.method,'recorded_at',m.recorded_at
              ) ORDER BY m.measurement_code)
              FROM fitcore_assessment_measurements m WHERE m.assessment_id=a.id
            ),'[]'::jsonb),
            'attachments',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',x.id,'label',x.label,'media_type',x.media_type,
                'sha256',x.sha256,'size_bytes',x.size_bytes,'created_at',x.created_at
              ) ORDER BY x.created_at)
              FROM fitcore_assessment_attachments x WHERE x.assessment_id=a.id
            ),'[]'::jsonb)
          ) row_data
        FROM fitcore_assessments a
        WHERE a.tenant_id=p_tenant_id AND a.student_id=v_student_id
        ORDER BY a.recorded_at DESC,a.id DESC
        LIMIT v_limit
      ) q
    ),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_assessment_accessible_student(uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_consent_record(uuid,uuid,text,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_template_publish(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_summary(uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_assessment_history(uuid,uuid,text,uuid,integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT SELECT ON fitcore_assessment_templates,fitcore_assessment_consents,fitcore_assessments,
      fitcore_assessment_measurements,fitcore_assessment_attachments,fitcore_assessment_events TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_accessible_student(uuid,uuid,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_current_consent(uuid,uuid,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_consent_record(uuid,uuid,text,uuid,text,text,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_template_publish(uuid,uuid,text,text,text,text,jsonb) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_summary(uuid,uuid,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_assessment_history(uuid,uuid,text,uuid,integer) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '028-assessments-anamnesis',
  'Anamnese e avaliações físicas: templates versionados, consentimento, histórico imutável, medidas e sinais descritivos server-side',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
