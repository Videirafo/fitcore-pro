-- FITCORE PRO — #93 Workout Builder VNext
-- Additive builder/version/template layer over canonical workouts/days/exercises.
BEGIN;

CREATE TABLE IF NOT EXISTS fitcore_workout_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_day_id uuid NOT NULL REFERENCES fitcore_workout_days(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem > 0),
  titulo text NOT NULL,
  protocol_code text NULL,
  observacao text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_day_id, ordem)
);

ALTER TABLE fitcore_workout_exercises
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES fitcore_workout_blocks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_load_kg numeric(10,2),
  ADD COLUMN IF NOT EXISTS target_rir_min integer,
  ADD COLUMN IF NOT EXISTS target_rir_max integer,
  ADD COLUMN IF NOT EXISTS target_rpe numeric(3,1),
  ADD COLUMN IF NOT EXISTS tempo text,
  ADD COLUMN IF NOT EXISTS protocol_code text;

ALTER TABLE fitcore_workout_exercises
  DROP CONSTRAINT IF EXISTS fitcore_workout_exercises_target_rir_min_check,
  ADD CONSTRAINT fitcore_workout_exercises_target_rir_min_check CHECK (target_rir_min IS NULL OR target_rir_min BETWEEN 0 AND 10),
  DROP CONSTRAINT IF EXISTS fitcore_workout_exercises_target_rir_max_check,
  ADD CONSTRAINT fitcore_workout_exercises_target_rir_max_check CHECK (target_rir_max IS NULL OR target_rir_max BETWEEN 0 AND 10),
  DROP CONSTRAINT IF EXISTS fitcore_workout_exercises_target_rpe_check,
  ADD CONSTRAINT fitcore_workout_exercises_target_rpe_check CHECK (target_rpe IS NULL OR target_rpe BETWEEN 1 AND 10),
  DROP CONSTRAINT IF EXISTS fitcore_workout_exercises_target_load_check,
  ADD CONSTRAINT fitcore_workout_exercises_target_load_check CHECK (target_load_kg IS NULL OR target_load_kg >= 0);

CREATE TABLE IF NOT EXISTS fitcore_workout_builder_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES fitcore_workouts(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','superseded')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  periodization jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  CHECK (jsonb_typeof(snapshot)='object'),
  CHECK (jsonb_typeof(periodization)='object'),
  CHECK (octet_length(snapshot::text) <= 524288),
  CHECK (octet_length(periodization::text) <= 131072),
  UNIQUE (tenant_id, workout_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_workout_builder_versions
  ON fitcore_workout_builder_versions (tenant_id, workout_id, version DESC);

ALTER TABLE fitcore_workouts
  ADD COLUMN IF NOT EXISTS published_builder_version_id uuid REFERENCES fitcore_workout_builder_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fitcore_workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  nome text NOT NULL,
  source_version_id uuid NOT NULL REFERENCES fitcore_workout_builder_versions(id) ON DELETE RESTRICT,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (template_code ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (length(nome) BETWEEN 3 AND 180),
  UNIQUE (tenant_id, template_code)
);

CREATE TABLE IF NOT EXISTS fitcore_workout_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  protocol_code text NOT NULL,
  nome text NOT NULL,
  descricao text NULL,
  defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (protocol_code ~ '^[a-z0-9_.:-]{3,80}$'),
  CHECK (length(nome) BETWEEN 3 AND 180),
  CHECK (jsonb_typeof(defaults)='object'),
  UNIQUE (tenant_id, protocol_code)
);

ALTER TABLE fitcore_workout_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_builder_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_workout_protocols ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'fitcore_workout_blocks',
    'fitcore_workout_builder_versions',
    'fitcore_workout_templates',
    'fitcore_workout_protocols'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',r);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK (tenant_id::text=current_setting(''app.tenant_id'',true))',
      r
    );
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',r);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fitcore_workout_builder_prevent_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'workout_builder_version_immutable';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workout_id IS DISTINCT FROM OLD.workout_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.periodization IS DISTINCT FROM OLD.periodization
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'workout_builder_version_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS immutable_builder_version ON fitcore_workout_builder_versions;
CREATE TRIGGER immutable_builder_version
BEFORE UPDATE OR DELETE ON fitcore_workout_builder_versions
FOR EACH ROW EXECUTE FUNCTION fitcore_workout_builder_prevent_version_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON fitcore_workout_blocks TO fitcore_app;
    GRANT SELECT,INSERT,UPDATE ON fitcore_workout_builder_versions TO fitcore_app;
    GRANT SELECT,INSERT,UPDATE ON fitcore_workout_templates TO fitcore_app;
    GRANT SELECT,INSERT,UPDATE ON fitcore_workout_protocols TO fitcore_app;
  END IF;
END $$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES (
  '030-workout-builder-vnext',
  'Workout Builder VNext: blocks, immutable versions, templates, protocols, periodization and target RIR/RPE/load',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();

COMMIT;
