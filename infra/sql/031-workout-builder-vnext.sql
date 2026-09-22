-- FITCORE PRO — #93 Workout Builder VNext foundation
-- Templates versioned, periodization, blocks and per-set targets over MVP-24.
BEGIN;

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_runtime') THEN
    CREATE ROLE fitcore_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT fitcore_runtime TO fitcore_app;
  END IF;
END $;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_workout_days_tenant_id
  ON fitcore_workout_days (tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_workout_exercises_tenant_id
  ON fitcore_workout_exercises (tenant_id,id);

CREATE TABLE IF NOT EXISTS fitcore_workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  objective text NOT NULL,
  protocol_code text NOT NULL DEFAULT 'general',
  periodization jsonb NOT NULL DEFAULT '{"type":"none","weeks":4}'::jsonb,
  builder jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'published',
  created_by_user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (template_key ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (version BETWEEN 1 AND 10000),
  CHECK (length(title) BETWEEN 3 AND 160),
  CHECK (length(objective) BETWEEN 1 AND 160),
  CHECK (protocol_code ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (status IN ('draft','published','archived')),
  CHECK (jsonb_typeof(periodization)='object'),
  CHECK (jsonb_typeof(builder)='object'),
  CHECK (octet_length(builder::text) <= 262144),
  UNIQUE (tenant_id,template_key,version)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_workout_templates_lookup
  ON fitcore_workout_templates (tenant_id,template_key,status,version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_workout_templates_tenant_id
  ON fitcore_workout_templates (tenant_id,id);

CREATE TABLE IF NOT EXISTS fitcore_workout_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_day_id uuid NOT NULL,
  ordem integer NOT NULL CHECK (ordem BETWEEN 1 AND 50),
  block_code text NOT NULL,
  title text NOT NULL,
  block_type text NOT NULL DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (block_code ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (length(title) BETWEEN 1 AND 120),
  CHECK (block_type ~ '^[a-z0-9_.:-]{2,40}$'),
  UNIQUE (workout_day_id,ordem),
  UNIQUE (workout_day_id,block_code)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_workout_blocks_day
  ON fitcore_workout_blocks (tenant_id,workout_day_id,ordem);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_workout_blocks_tenant_id
  ON fitcore_workout_blocks (tenant_id,id);

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='fitcore_workout_blocks_tenant_day_fkey'
  ) THEN
    ALTER TABLE fitcore_workout_blocks
      ADD CONSTRAINT fitcore_workout_blocks_tenant_day_fkey
      FOREIGN KEY (tenant_id,workout_day_id)
      REFERENCES fitcore_workout_days(tenant_id,id)
      ON DELETE CASCADE;
  END IF;
END $;

ALTER TABLE fitcore_workout_exercises
  ADD COLUMN IF NOT EXISTS block_id uuid NULL,
  ADD COLUMN IF NOT EXISTS progression jsonb NOT NULL DEFAULT '{"kind":"none","step":0}'::jsonb;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='fitcore_workout_exercises_tenant_block_fkey'
  ) THEN
    ALTER TABLE fitcore_workout_exercises
      ADD CONSTRAINT fitcore_workout_exercises_tenant_block_fkey
      FOREIGN KEY (tenant_id,block_id)
      REFERENCES fitcore_workout_blocks(tenant_id,id)
      ON DELETE SET NULL;
  END IF;
END $;

CREATE INDEX IF NOT EXISTS idx_fitcore_workout_exercises_block
  ON fitcore_workout_exercises (tenant_id,block_id,ordem);

CREATE TABLE IF NOT EXISTS fitcore_workout_set_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_exercise_id uuid NOT NULL,
  set_order integer NOT NULL CHECK (set_order BETWEEN 1 AND 20),
  reps text NOT NULL,
  load_target text NULL,
  rest_seconds integer NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 0 AND 600),
  rir_target numeric(4,2) NULL CHECK (rir_target IS NULL OR rir_target BETWEEN 0 AND 10),
  rpe_target numeric(4,2) NULL CHECK (rpe_target IS NULL OR rpe_target BETWEEN 1 AND 10),
  tempo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(reps) BETWEEN 1 AND 40),
  CHECK (load_target IS NULL OR length(load_target) <= 40),
  CHECK (tempo IS NULL OR length(tempo) <= 30),
  UNIQUE (workout_exercise_id,set_order)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_workout_set_targets_exercise
  ON fitcore_workout_set_targets (tenant_id,workout_exercise_id,set_order);

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='fitcore_workout_set_targets_tenant_exercise_fkey'
  ) THEN
    ALTER TABLE fitcore_workout_set_targets
      ADD CONSTRAINT fitcore_workout_set_targets_tenant_exercise_fkey
      FOREIGN KEY (tenant_id,workout_exercise_id)
      REFERENCES fitcore_workout_exercises(tenant_id,id)
      ON DELETE CASCADE;
  END IF;
END $;

ALTER TABLE fitcore_workouts
  ADD COLUMN IF NOT EXISTS prescription_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS builder_schema_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS protocol_code text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS periodization jsonb NOT NULL DEFAULT '{"type":"none","weeks":4}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_template_id uuid NULL;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='fitcore_workouts_tenant_template_fkey'
  ) THEN
    ALTER TABLE fitcore_workouts
      ADD CONSTRAINT fitcore_workouts_tenant_template_fkey
      FOREIGN KEY (tenant_id,source_template_id)
      REFERENCES fitcore_workout_templates(tenant_id,id)
      ON DELETE SET NULL;
  END IF;
END $;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='fitcore_workouts_prescription_version_check'
  ) THEN
    ALTER TABLE fitcore_workouts
      ADD CONSTRAINT fitcore_workouts_prescription_version_check
      CHECK (prescription_version BETWEEN 1 AND 10000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='fitcore_workouts_builder_schema_version_check'
  ) THEN
    ALTER TABLE fitcore_workouts
      ADD CONSTRAINT fitcore_workouts_builder_schema_version_check
      CHECK (builder_schema_version BETWEEN 1 AND 100);
  END IF;
END $$;

ALTER TABLE fitcore_workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_set_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_set_targets FORCE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'fitcore_workout_templates',
    'fitcore_workout_blocks',
    'fitcore_workout_set_targets'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',r);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id::text=current_setting(''app.tenant_id'',true))',
      r
    );
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',r);
  END LOOP;
END $;

GRANT SELECT,INSERT ON fitcore_workout_templates TO fitcore_runtime;
GRANT SELECT ON fitcore_workout_blocks,fitcore_workout_set_targets TO fitcore_runtime;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '031-workout-builder-vnext',
  'Workout Builder VNext: templates, blocks, set targets, periodization and prescription versioning',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET status=EXCLUDED.status,descricao=EXCLUDED.descricao,aplicada_em=now();

COMMIT;
