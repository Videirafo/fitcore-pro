-- FITCORE PRO — #93 Workout Builder VNext publish
-- Materializes normalized builder JSON into canonical workout/day/block/exercise/set tables.
BEGIN;

CREATE OR REPLACE FUNCTION fitcore_workout_builder_publish(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_student_id uuid,
  p_builder jsonb,
  p_source_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_actor_role text;
  v_student_professor uuid;
  v_workout_id uuid;
  v_review_id uuid;
  v_day_id uuid;
  v_block_id uuid;
  v_exercise_id uuid;
  v_day jsonb;
  v_block jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_day_ord bigint;
  v_block_ord bigint;
  v_exercise_ord bigint;
  v_set_ord bigint;
  v_version integer;
  v_day_count integer:=0;
  v_block_count integer:=0;
  v_exercise_count integer:=0;
  v_set_count integer:=0;
  v_frequency integer;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'workout_builder_session_required';
  END IF;
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'workout_builder_tenant_context_mismatch';
  END IF;
  IF p_builder IS NULL OR jsonb_typeof(p_builder)<>'object' THEN
    RAISE EXCEPTION 'workout_builder_payload_invalid';
  END IF;
  IF jsonb_typeof(COALESCE(p_builder->'days','[]'::jsonb))<>'array'
     OR jsonb_array_length(COALESCE(p_builder->'days','[]'::jsonb)) NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'workout_builder_days_invalid';
  END IF;

  SELECT u.papel INTO v_actor_role
  FROM fitcore_users u
  WHERE u.id=p_actor_user_id
    AND u.tenant_id=p_tenant_id
    AND u.ativo=true
  LIMIT 1;
  IF v_actor_role NOT IN ('gestor','professor') THEN
    RAISE EXCEPTION 'workout_builder_role_forbidden';
  END IF;

  SELECT s.professor_id INTO v_student_professor
  FROM fitcore_students s
  WHERE s.id=p_student_id
    AND s.tenant_id=p_tenant_id
    AND s.status<>'inativo'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workout_builder_student_not_found';
  END IF;

  IF p_source_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fitcore_workout_templates t
    WHERE t.id=p_source_template_id AND t.tenant_id=p_tenant_id
  ) THEN
    RAISE EXCEPTION 'workout_builder_template_not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':' || p_student_id::text || ':workout-builder',
    0
  ));

  SELECT COALESCE(MAX(w.prescription_version),0)+1
  INTO v_version
  FROM fitcore_workouts w
  WHERE w.tenant_id=p_tenant_id AND w.student_id=p_student_id;

  v_frequency:=LEAST(GREATEST(
    COALESCE((p_builder->>'frequency_per_week')::integer,jsonb_array_length(p_builder->'days')),
    1
  ),7);

  INSERT INTO fitcore_workouts(
    tenant_id,student_id,objetivo,modalidade,foco,dias_semana,status,criado_por,
    payload,prescription_version,builder_schema_version,protocol_code,periodization,source_template_id
  ) VALUES (
    p_tenant_id,
    p_student_id,
    left(COALESCE(NULLIF(btrim(p_builder->>'objective'),''),'progressão'),160),
    'academia',
    left(COALESCE(NULLIF(btrim(p_builder->>'objective'),''),'completo'),160),
    v_frequency,
    'em_revisao',
    p_actor_user_id,
    jsonb_build_object(
      'origem','workout_builder_vnext',
      'nome_treino',left(COALESCE(NULLIF(btrim(p_builder->>'title'),''),'Treino VNext'),160)
    ),
    v_version,
    LEAST(GREATEST(COALESCE((p_builder->>'schema_version')::smallint,1),1),100),
    left(COALESCE(NULLIF(btrim(p_builder->>'protocol_code'),''),'general'),80),
    COALESCE(p_builder->'periodization','{"type":"none","weeks":4}'::jsonb),
    p_source_template_id
  )
  RETURNING id INTO v_workout_id;

  FOR v_day,v_day_ord IN
    SELECT value,ordinality
    FROM jsonb_array_elements(p_builder->'days') WITH ORDINALITY
  LOOP
    INSERT INTO fitcore_workout_days(
      tenant_id,workout_id,ordem,titulo,foco,aquecimento,orientacao
    ) VALUES (
      p_tenant_id,
      v_workout_id,
      v_day_ord::integer,
      left(COALESCE(NULLIF(btrim(v_day->>'title'),''),'Dia '||v_day_ord),120),
      NULLIF(left(COALESCE(v_day->>'focus',''),120),''),
      NULLIF(left(COALESCE(v_day->>'warmup',''),320),''),
      NULLIF(left(COALESCE(v_day->>'guidance',''),320),'')
    )
    RETURNING id INTO v_day_id;
    v_day_count:=v_day_count+1;

    FOR v_block,v_block_ord IN
      SELECT value,ordinality
      FROM jsonb_array_elements(COALESCE(v_day->'blocks','[]'::jsonb)) WITH ORDINALITY
    LOOP
      IF v_block_ord>12 THEN RAISE EXCEPTION 'workout_builder_blocks_invalid'; END IF;
      INSERT INTO fitcore_workout_blocks(
        tenant_id,workout_day_id,ordem,block_code,title,block_type
      ) VALUES (
        p_tenant_id,
        v_day_id,
        v_block_ord::integer,
        left(COALESCE(NULLIF(btrim(v_block->>'code'),''),'block_'||v_block_ord),80),
        left(COALESCE(NULLIF(btrim(v_block->>'title'),''),'Bloco '||v_block_ord),120),
        left(COALESCE(NULLIF(btrim(v_block->>'type'),''),'main'),40)
      )
      RETURNING id INTO v_block_id;
      v_block_count:=v_block_count+1;

      FOR v_exercise,v_exercise_ord IN
        SELECT value,ordinality
        FROM jsonb_array_elements(COALESCE(v_block->'exercises','[]'::jsonb)) WITH ORDINALITY
      LOOP
        IF v_exercise_ord>20 THEN RAISE EXCEPTION 'workout_builder_exercises_invalid'; END IF;
        IF jsonb_array_length(COALESCE(v_exercise->'sets','[]'::jsonb)) NOT BETWEEN 1 AND 12 THEN
          RAISE EXCEPTION 'workout_builder_sets_invalid';
        END IF;

        INSERT INTO fitcore_workout_exercises(
          tenant_id,workout_day_id,block_id,ordem,source_id,slug,nome,categoria,equipamento,foco,
          series,repeticoes,descanso_segundos,observacao,progression
        ) VALUES (
          p_tenant_id,
          v_day_id,
          v_block_id,
          v_exercise_ord::integer,
          NULLIF(left(COALESCE(v_exercise->>'source_id',''),120),''),
          left(COALESCE(NULLIF(btrim(v_exercise->>'slug'),''),'exercise_'||v_exercise_ord),120),
          left(COALESCE(NULLIF(btrim(v_exercise->>'name'),''),'Exercício '||v_exercise_ord),160),
          NULLIF(left(COALESCE(v_exercise->>'category',''),80),''),
          NULLIF(left(COALESCE(v_exercise->>'equipment',''),80),''),
          NULLIF(left(COALESCE(v_exercise->>'focus',''),120),''),
          jsonb_array_length(v_exercise->'sets'),
          left(COALESCE(v_exercise->'sets'->0->>'reps','8-12'),40),
          LEAST(GREATEST(COALESCE((v_exercise->'sets'->0->>'rest_seconds')::integer,90),0),900),
          NULLIF(left(COALESCE(v_exercise->>'notes',''),320),''),
          COALESCE(v_exercise->'progression','{"kind":"none","step":0}'::jsonb)
        )
        RETURNING id INTO v_exercise_id;
        v_exercise_count:=v_exercise_count+1;

        FOR v_set,v_set_ord IN
          SELECT value,ordinality
          FROM jsonb_array_elements(v_exercise->'sets') WITH ORDINALITY
        LOOP
          INSERT INTO fitcore_workout_set_targets(
            tenant_id,workout_exercise_id,set_order,reps,load_target,rest_seconds,rir_target,rpe_target,tempo
          ) VALUES (
            p_tenant_id,
            v_exercise_id,
            v_set_ord::integer,
            left(COALESCE(NULLIF(btrim(v_set->>'reps'),''),'8-12'),40),
            NULLIF(left(COALESCE(v_set->>'load',''),40),''),
            LEAST(GREATEST(COALESCE((v_set->>'rest_seconds')::integer,90),0),900),
            CASE WHEN v_set ? 'rir_target' THEN (v_set->>'rir_target')::numeric ELSE NULL END,
            CASE WHEN v_set ? 'rpe_target' THEN (v_set->>'rpe_target')::numeric ELSE NULL END,
            NULLIF(left(COALESCE(v_set->>'tempo',''),30),'')
          );
          v_set_count:=v_set_count+1;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_exercise_count=0 OR v_set_count=0 THEN
    RAISE EXCEPTION 'workout_builder_not_publishable';
  END IF;

  INSERT INTO fitcore_professor_reviews(
    tenant_id,workout_id,professor_id,status,observacoes,ajustes,payload,atualizado_em
  ) VALUES (
    p_tenant_id,
    v_workout_id,
    CASE WHEN v_actor_role='professor' THEN p_actor_user_id ELSE v_student_professor END,
    'em_revisao',
    'Revisão pendente do Workout Builder VNext',
    '[]'::jsonb,
    jsonb_build_object('origem','workout_builder_vnext','prescription_version',v_version),
    now()
  )
  RETURNING id INTO v_review_id;

  INSERT INTO fitcore_workout_prescription_events(
    tenant_id,actor_id,workout_id,student_id,evento,status,detalhe,payload
  ) VALUES (
    p_tenant_id,p_actor_user_id,v_workout_id,p_student_id,
    'workout_builder_published','ok','Workout Builder VNext materializado',
    jsonb_build_object(
      'prescription_version',v_version,
      'days',v_day_count,'blocks',v_block_count,'exercises',v_exercise_count,'sets',v_set_count
    )
  );

  INSERT INTO fitcore_audit_events(
    tenant_id,actor_id,actor_role,recurso_tipo,recurso_id,acao,status,detalhe
  ) VALUES (
    p_tenant_id,p_actor_user_id,v_actor_role,'workout_prescription',v_workout_id,
    'workout_builder_published','ok',
    'Workout Builder VNext publicado sem payload sensível no audit trail'
  );

  RETURN jsonb_build_object(
    'workout_id',v_workout_id,
    'review_id',v_review_id,
    'student_id',p_student_id,
    'status','em_revisao',
    'prescription_version',v_version,
    'builder_schema_version',COALESCE((p_builder->>'schema_version')::integer,1),
    'days',v_day_count,
    'blocks',v_block_count,
    'exercises',v_exercise_count,
    'sets',v_set_count,
    'source_template_id',p_source_template_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_workout_builder_publish(uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_workout_builder_publish(uuid,uuid,uuid,jsonb,uuid) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '032-workout-builder-vnext-publish',
  'Workout Builder VNext structured prescription publication',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
