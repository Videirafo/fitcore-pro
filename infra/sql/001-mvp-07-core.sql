-- FITCORE PRO — MVP-07
-- Persistência real + banco mínimo
-- Objetivo: preparar o FitCore para sair de JSON local e entrar em PostgreSQL multi-tenant.
-- Seguro por padrão: idempotente, com tenant_id, user_role e auditoria mínima LGPD.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso', 'teste')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('gestor', 'professor', 'aluno')),
  externo_id text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, externo_id)
);

CREATE TABLE IF NOT EXISTS fitcore_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  nome_publico text NOT NULL,
  nivel text NOT NULL DEFAULT 'iniciante',
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'teste')),
  observacoes_minimas text,
  criado_por uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  objetivo text NOT NULL,
  modalidade text NOT NULL DEFAULT 'academia',
  foco text NOT NULL DEFAULT 'completo',
  dias_semana integer NOT NULL DEFAULT 3 CHECK (dias_semana BETWEEN 1 AND 7),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'em_revisao', 'aprovado', 'arquivado')),
  criado_por uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  aprovado_por uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_workout_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES fitcore_workouts(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem > 0),
  titulo text NOT NULL,
  foco text,
  aquecimento text,
  orientacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_id, ordem)
);

CREATE TABLE IF NOT EXISTS fitcore_workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_day_id uuid NOT NULL REFERENCES fitcore_workout_days(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem > 0),
  source_id text,
  slug text NOT NULL,
  nome text NOT NULL,
  categoria text,
  equipamento text,
  foco text,
  series integer CHECK (series IS NULL OR series BETWEEN 1 AND 20),
  repeticoes text,
  descanso_segundos integer CHECK (descanso_segundos IS NULL OR descanso_segundos BETWEEN 0 AND 600),
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_day_id, ordem)
);

CREATE TABLE IF NOT EXISTS fitcore_professor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES fitcore_workouts(id) ON DELETE CASCADE,
  professor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'em_revisao' CHECK (status IN ('em_revisao', 'ajustes_solicitados', 'aprovado')),
  observacoes text,
  ajustes jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_workout_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES fitcore_workouts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'em_execucao', 'concluido')),
  percepcao_esforco integer CHECK (percepcao_esforco IS NULL OR percepcao_esforco BETWEEN 1 AND 10),
  duracao_minutos integer CHECK (duracao_minutos IS NULL OR duracao_minutos BETWEEN 1 AND 300),
  observacoes text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_por uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_exercise_execution_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES fitcore_workout_executions(id) ON DELETE CASCADE,
  workout_exercise_id uuid REFERENCES fitcore_workout_exercises(id) ON DELETE SET NULL,
  slug text NOT NULL,
  nome text NOT NULL,
  feito boolean NOT NULL DEFAULT false,
  carga text,
  repeticoes text,
  observacao text,
  registrado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('gestor', 'professor', 'aluno', 'sistema')),
  recurso_tipo text NOT NULL,
  recurso_id uuid,
  acao text NOT NULL,
  status text,
  detalhe text,
  ip_hash text,
  user_agent_hash text,
  politica_lgpd text NOT NULL DEFAULT 'evento_minimo_sem_documento_telefone_email_foto_medida_ou_dado_de_saude',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_users_tenant_role ON fitcore_users (tenant_id, papel);
CREATE INDEX IF NOT EXISTS idx_fitcore_students_tenant ON fitcore_students (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fitcore_workouts_tenant_student ON fitcore_workouts (tenant_id, student_id, status);
CREATE INDEX IF NOT EXISTS idx_fitcore_reviews_tenant_status ON fitcore_professor_reviews (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fitcore_executions_tenant_status ON fitcore_workout_executions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fitcore_audit_tenant_created ON fitcore_audit_events (tenant_id, criado_em DESC);

ALTER TABLE fitcore_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_professor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_exercise_execution_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_audit_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'fitcore_users',
    'fitcore_students',
    'fitcore_workouts',
    'fitcore_workout_days',
    'fitcore_workout_exercises',
    'fitcore_professor_reviews',
    'fitcore_workout_executions',
    'fitcore_exercise_execution_items',
    'fitcore_audit_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_self ON fitcore_tenants;
CREATE POLICY tenant_self ON fitcore_tenants
  USING (id::text = current_setting('app.tenant_id', true))
  WITH CHECK (id::text = current_setting('app.tenant_id', true));

INSERT INTO fitcore_tenants (slug, nome, status)
VALUES ('demo', 'FitCore Demo', 'teste')
ON CONFLICT (slug) DO UPDATE SET atualizado_em = now();