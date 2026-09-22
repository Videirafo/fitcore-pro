-- FITCORE PRO — #92 final hardening
-- Prevents cross-kind supersedes from suppressing physical measurement trends.
BEGIN;

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

REVOKE ALL ON FUNCTION fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '030-assessments-supersedes-kind',
  'Hardening #92: supersedes somente entre avaliações do mesmo tipo',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
