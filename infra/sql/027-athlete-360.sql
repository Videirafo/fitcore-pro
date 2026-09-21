-- FITCORE PRO — #91 Athlete 360
-- Single operational athlete view over existing sources + structured goals.
BEGIN;

CREATE TABLE IF NOT EXISTS fitcore_athlete_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  title text NOT NULL,
  goal_code text NOT NULL,
  target_value numeric(18,4) NULL,
  target_unit text NULL,
  progress_value numeric(18,4) NULL,
  target_date date NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  achieved_at timestamptz NULL,
  CHECK (length(title) BETWEEN 3 AND 180),
  CHECK (goal_code ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (target_unit IS NULL OR target_unit ~ '^[A-Za-z0-9%_.:/ -]{1,40}$'),
  CHECK (priority IN ('low','medium','high')),
  CHECK (status IN ('active','achieved','paused','cancelled')),
  CHECK (target_value IS NULL OR target_value >= 0),
  CHECK (progress_value IS NULL OR progress_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_athlete_goals_student
  ON fitcore_athlete_goals (tenant_id,student_id,status,priority,atualizado_em DESC);

CREATE TABLE IF NOT EXISTS fitcore_athlete_goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES fitcore_athlete_goals(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NOT NULL,
  progress_value numeric(18,4) NULL,
  reason_code text NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN ('created','progress_updated','status_changed')),
  CHECK (from_status IS NULL OR from_status IN ('active','achieved','paused','cancelled')),
  CHECK (to_status IN ('active','achieved','paused','cancelled')),
  CHECK (progress_value IS NULL OR progress_value >= 0),
  CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9_.:-]{3,120}$')
);

CREATE INDEX IF NOT EXISTS idx_fitcore_athlete_goal_events_student
  ON fitcore_athlete_goal_events (tenant_id,student_id,ocorrido_em DESC);

ALTER TABLE fitcore_athlete_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_athlete_goal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_athlete_goals;
CREATE POLICY tenant_isolation ON fitcore_athlete_goals
  USING (tenant_id::text=current_setting('app.tenant_id',true))
  WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
DROP POLICY IF EXISTS tenant_isolation ON fitcore_athlete_goal_events;
CREATE POLICY tenant_isolation ON fitcore_athlete_goal_events
  USING (tenant_id::text=current_setting('app.tenant_id',true))
  WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
REVOKE ALL ON fitcore_athlete_goals,fitcore_athlete_goal_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION fitcore_athlete_360_accessible_student(
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
DECLARE
  v_student_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'athlete360_session_required';
  END IF;
  IF current_setting('app.tenant_id',true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'athlete360_tenant_context_mismatch';
  END IF;
  IF p_actor_role NOT IN ('gestor','professor','aluno') THEN
    RAISE EXCEPTION 'athlete360_role_forbidden';
  END IF;

  SELECT s.id INTO v_student_id
  FROM fitcore_students s
  WHERE s.tenant_id=p_tenant_id
    AND (p_student_id IS NULL OR s.id=p_student_id)
    AND (
      p_actor_role='gestor'
      OR (p_actor_role='professor' AND s.professor_id=p_actor_user_id)
      OR (p_actor_role='aluno' AND s.user_id=p_actor_user_id)
    )
  ORDER BY s.atualizado_em DESC
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'athlete360_student_not_found_or_forbidden';
  END IF;
  RETURN v_student_id;
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_athlete_360_snapshot(
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
  v_result jsonb;
BEGIN
  v_student_id:=fitcore_athlete_360_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );

  WITH profile AS (
    SELECT
      s.id,s.nome_publico,s.codigo_publico,s.nivel,s.status,s.objetivo,
      s.modalidade_preferida,s.frequencia_semana,s.professor_id,s.user_id,
      s.etiquetas,s.consentimento_lgpd,s.criado_em,s.atualizado_em,
      p.nome professor_nome,t.nome tenant_nome,t.slug tenant_slug
    FROM fitcore_students s
    JOIN fitcore_tenants t ON t.id=s.tenant_id
    LEFT JOIN fitcore_users p ON p.id=s.professor_id AND p.tenant_id=s.tenant_id
    WHERE s.tenant_id=p_tenant_id AND s.id=v_student_id
  ), goals AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',g.id,'title',g.title,'goal_code',g.goal_code,
      'target_value',g.target_value,'target_unit',g.target_unit,
      'progress_value',g.progress_value,'target_date',g.target_date,
      'priority',g.priority,'status',g.status,
      'created_at',g.criado_em,'updated_at',g.atualizado_em,'achieved_at',g.achieved_at
    ) ORDER BY
      CASE g.status WHEN 'active' THEN 1 WHEN 'paused' THEN 2 WHEN 'achieved' THEN 3 ELSE 4 END,
      CASE g.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      g.atualizado_em DESC),'[]'::jsonb) data
    FROM fitcore_athlete_goals g
    WHERE g.tenant_id=p_tenant_id AND g.student_id=v_student_id
  ), workout_stats AS (
    SELECT
      count(*)::bigint total,
      count(*) FILTER (WHERE status='aprovado')::bigint approved,
      max(atualizado_em) last_updated_at
    FROM fitcore_workouts
    WHERE tenant_id=p_tenant_id AND student_id=v_student_id
  ), latest_workout AS (
    SELECT jsonb_build_object(
      'id',w.id,'objective',w.objetivo,'modality',w.modalidade,'focus',w.foco,
      'days_per_week',w.dias_semana,'status',w.status,'approved_at',w.aprovado_em,
      'updated_at',w.atualizado_em
    ) data
    FROM fitcore_workouts w
    WHERE w.tenant_id=p_tenant_id AND w.student_id=v_student_id
    ORDER BY (w.status='aprovado') DESC,w.atualizado_em DESC
    LIMIT 1
  ), execution_stats AS (
    SELECT
      count(*)::bigint total,
      count(*) FILTER (WHERE status='concluido')::bigint completed,
      count(*) FILTER (WHERE status='em_execucao')::bigint active,
      count(*) FILTER (WHERE status='concluido' AND concluido_em>=now()-interval '7 days')::bigint completed_7d,
      count(*) FILTER (WHERE status='concluido' AND concluido_em>=now()-interval '28 days')::bigint completed_28d,
      round(avg(percepcao_esforco) FILTER (WHERE percepcao_esforco IS NOT NULL),1) avg_effort,
      round(avg(duracao_minutos) FILTER (WHERE duracao_minutos IS NOT NULL),1) avg_duration,
      max(coalesce(concluido_em,iniciado_em,atualizado_em)) last_activity_at
    FROM fitcore_workout_executions
    WHERE tenant_id=p_tenant_id AND student_id=v_student_id
  ), active_execution AS (
    SELECT jsonb_build_object(
      'id',e.id,'workout_id',e.workout_id,'status',e.status,
      'effort',e.percepcao_esforco,'duration_minutes',e.duracao_minutos,
      'started_at',e.iniciado_em,'updated_at',e.atualizado_em
    ) data
    FROM fitcore_workout_executions e
    WHERE e.tenant_id=p_tenant_id AND e.student_id=v_student_id AND e.status='em_execucao'
    ORDER BY e.atualizado_em DESC LIMIT 1
  ),

 timeline AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC),'[]'::jsonb) data
    FROM (
      SELECT 'goal'::text kind,g.event_type::text event_type,g.ocorrido_em occurred_at,
        jsonb_build_object('goal_id',g.goal_id,'status',g.to_status,'progress_value',g.progress_value) detail
      FROM fitcore_athlete_goal_events g
      WHERE g.tenant_id=p_tenant_id AND g.student_id=v_student_id
      UNION ALL
      SELECT 'execution',CASE WHEN e.status='concluido' THEN 'workout_completed' ELSE 'workout_started' END,
        coalesce(e.concluido_em,e.iniciado_em,e.atualizado_em),
        jsonb_build_object('execution_id',e.id,'workout_id',e.workout_id,'status',e.status,'effort',e.percepcao_esforco,'duration_minutes',e.duracao_minutos)
      FROM fitcore_workout_executions e
      WHERE e.tenant_id=p_tenant_id AND e.student_id=v_student_id
      UNION ALL
      SELECT 'workout',CASE WHEN w.status='aprovado' THEN 'workout_approved' ELSE 'workout_updated' END,
        coalesce(w.aprovado_em,w.atualizado_em),
        jsonb_build_object('workout_id',w.id,'status',w.status,'objective',w.objetivo)
      FROM fitcore_workouts w
      WHERE w.tenant_id=p_tenant_id AND w.student_id=v_student_id
      UNION ALL
      SELECT 'decision','nba_'||d.state,d.atualizado_em,
        jsonb_build_object('proposal_id',d.proposal_id,'action_id',d.action_id,'reason_code',d.reason_code,'state',d.state,'outcome_code',d.outcome_code)
      FROM fitcore_execution_decisions d
      WHERE d.tenant_id=p_tenant_id
        AND d.resource_id IN (
          SELECT w.id FROM fitcore_workouts w WHERE w.tenant_id=p_tenant_id AND w.student_id=v_student_id
          UNION
          SELECT e.id FROM fitcore_workout_executions e WHERE e.tenant_id=p_tenant_id AND e.student_id=v_student_id
        )
      ORDER BY occurred_at DESC
      LIMIT 80
    ) x
  ), latest_decisions AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'proposal_id',d.proposal_id,'action_id',d.action_id,'reason_code',d.reason_code,
      'priority',d.priority,'state',d.state,'outcome_code',d.outcome_code,
      'outcome_metric_name',d.outcome_metric_name,'outcome_metric_value',d.outcome_metric_value,
      'updated_at',d.atualizado_em
    ) ORDER BY d.atualizado_em DESC),'[]'::jsonb) data
    FROM fitcore_execution_decisions d
    WHERE d.tenant_id=p_tenant_id
      AND d.resource_id IN (
        SELECT w.id FROM fitcore_workouts w WHERE w.tenant_id=p_tenant_id AND w.student_id=v_student_id
        UNION
        SELECT e.id FROM fitcore_workout_executions e WHERE e.tenant_id=p_tenant_id AND e.student_id=v_student_id
      )
  )
  SELECT jsonb_build_object(
    'version',1,
    'student_id',p.id,
    'profile',jsonb_build_object(
      'name',p.nome_publico,'code',p.codigo_publico,'level',p.nivel,'status',p.status,
      'objective',p.objetivo,'preferred_modality',p.modalidade_preferida,
      'weekly_frequency_target',p.frequencia_semana,'tags',p.etiquetas,
      'ai_consent',p.consentimento_lgpd
    ),
    'relationships',jsonb_build_object(
      'tenant_name',p.tenant_nome,'tenant_slug',p.tenant_slug,
      'coach_id',p.professor_id,'coach_name',p.professor_nome
    ),
    'goals',g.data,
    'training',jsonb_build_object(
      'workouts_total',ws.total,'approved_workouts',ws.approved,
      'latest_workout',lw.data,'active_execution',ae.data
    ),
    'adherence',jsonb_build_object(
      'completed_7d',es.completed_7d,'completed_28d',es.completed_28d,
      'weekly_frequency_target',COALESCE(p.frequencia_semana,0),
      'adherence_28d_pct',CASE
        WHEN COALESCE(p.frequencia_semana,0)=0 THEN 0
        ELSE LEAST(100,round((es.completed_28d::numeric/(p.frequencia_semana*4)::numeric)*100,1))
      END,
      'average_effort',es.avg_effort,'average_duration',es.avg_duration,
      'last_activity_at',es.last_activity_at
    ),
    'today',jsonb_build_object(
      'active_execution',ae.data,
      'approved_workout',lw.data,
      'status',CASE
        WHEN ae.data IS NOT NULL THEN 'continue_session'
        WHEN ws.approved>0 THEN 'workout_ready'
        ELSE 'awaiting_prescription'
      END
    ),
    'decisions',ld.data,
    'timeline',tl.data,
    'availability',jsonb_build_object(
      'workouts',true,'executions',true,'goals',true,'decisions',true,
      'physical_assessments',false,'pr_engine',false,
      'physical_assessments_issue',92,'pr_engine_issue',95
    ),
    'privacy',jsonb_build_object(
      'tenant_scoped',true,'minimum_identity',true,
      'ai_consent',p.consentimento_lgpd,
      'medical_data_included',false
    )
  ) INTO v_result
  FROM profile p
  CROSS JOIN goals g
  CROSS JOIN workout_stats ws
  LEFT JOIN latest_workout lw ON true
  CROSS JOIN execution_stats es
  LEFT JOIN active_execution ae ON true
  CROSS JOIN timeline tl
  CROSS JOIN latest_decisions ld;

  RETURN COALESCE(v_result,'{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_athlete_goal_create(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_student_id uuid,
  p_title text,
  p_goal_code text,
  p_target_value numeric DEFAULT NULL,
  p_target_unit text DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_priority text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_student_id uuid;
  v_goal fitcore_athlete_goals%rowtype;
BEGIN
  v_student_id:=fitcore_athlete_360_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,p_student_id
  );
  IF length(trim(COALESCE(p_title,'')))<3 OR p_goal_code !~ '^[a-z0-9_.:-]{3,80}$'
     OR p_priority NOT IN ('low','medium','high')
     OR (p_target_value IS NOT NULL AND p_target_value<0) THEN
    RAISE EXCEPTION 'athlete360_goal_invalid';
  END IF;
  INSERT INTO fitcore_athlete_goals(
    tenant_id,student_id,title,goal_code,target_value,target_unit,target_date,priority,created_by_user_id
  ) VALUES (
    p_tenant_id,v_student_id,trim(p_title),p_goal_code,p_target_value,NULLIF(trim(p_target_unit),''),
    p_target_date,p_priority,p_actor_user_id
  ) RETURNING * INTO v_goal;
  INSERT INTO fitcore_athlete_goal_events(
    tenant_id,student_id,goal_id,actor_user_id,event_type,to_status,progress_value,reason_code
  ) VALUES (
    p_tenant_id,v_student_id,v_goal.id,p_actor_user_id,'created','active',v_goal.progress_value,'goal_created'
  );
  RETURN to_jsonb(v_goal);
END;
$function$;

CREATE OR REPLACE FUNCTION fitcore_athlete_goal_update(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_goal_id uuid,
  p_progress_value numeric DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_reason_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_goal fitcore_athlete_goals%rowtype;
  v_from text;
  v_student_id uuid;
BEGIN
  SELECT * INTO v_goal FROM fitcore_athlete_goals
  WHERE tenant_id=p_tenant_id AND id=p_goal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'athlete360_goal_not_found'; END IF;
  v_student_id:=fitcore_athlete_360_accessible_student(
    p_tenant_id,p_actor_user_id,p_actor_role,v_goal.student_id
  );
  IF p_progress_value IS NOT NULL AND p_progress_value<0 THEN
    RAISE EXCEPTION 'athlete360_goal_invalid';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active','achieved','paused','cancelled') THEN
    RAISE EXCEPTION 'athlete360_goal_invalid';
  END IF;
  IF p_reason_code IS NOT NULL AND p_reason_code !~ '^[a-z0-9_.:-]{3,120}$' THEN
    RAISE EXCEPTION 'athlete360_goal_invalid';
  END IF;
  v_from:=v_goal.status;
  UPDATE fitcore_athlete_goals SET
    progress_value=COALESCE(p_progress_value,progress_value),
    status=COALESCE(p_status,status),
    achieved_at=CASE
      WHEN COALESCE(p_status,status)='achieved' THEN COALESCE(achieved_at,now())
      WHEN p_status IS NOT NULL AND p_status<>'achieved' THEN NULL
      ELSE achieved_at END,
    atualizado_em=now()
  WHERE id=p_goal_id RETURNING * INTO v_goal;
  INSERT INTO fitcore_athlete_goal_events(
    tenant_id,student_id,goal_id,actor_user_id,event_type,from_status,to_status,
    progress_value,reason_code
  ) VALUES (
    p_tenant_id,v_student_id,v_goal.id,p_actor_user_id,
    CASE WHEN p_status IS NOT NULL AND p_status IS DISTINCT FROM v_from THEN 'status_changed' ELSE 'progress_updated' END,
    v_from,v_goal.status,v_goal.progress_value,COALESCE(p_reason_code,'goal_updated')
  );
  RETURN to_jsonb(v_goal);
END;
$function$;

REVOKE ALL ON FUNCTION fitcore_athlete_360_accessible_student(uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_athlete_360_snapshot(uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_athlete_goal_create(uuid,uuid,text,uuid,text,text,numeric,text,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fitcore_athlete_goal_update(uuid,uuid,text,uuid,numeric,text,text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT SELECT ON fitcore_athlete_goals,fitcore_athlete_goal_events TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_athlete_360_accessible_student(uuid,uuid,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_athlete_360_snapshot(uuid,uuid,text,uuid) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_athlete_goal_create(uuid,uuid,text,uuid,text,text,numeric,text,date,text) TO fitcore_app;
    GRANT EXECUTE ON FUNCTION fitcore_athlete_goal_update(uuid,uuid,text,uuid,numeric,text,text) TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '027-athlete-360',
  'Athlete 360: unified operational athlete snapshot, goals and privacy-safe timeline',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
