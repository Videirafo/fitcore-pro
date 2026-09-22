import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, hardening, rollback, manager, athlete, coach, server, ui, deploy] = await Promise.all([
  read("infra/sql/028-assessments-anamnesis.sql"),
  read("infra/sql/029-assessments-hardening.sql"),
  read("infra/sql/rollback-028-assessments-anamnesis.sql"),
  read("services/api/security/assessments-anamnesis.mjs"),
  read("services/api/security/athlete-360.mjs"),
  read("services/api/security/evidence-coach.mjs"),
  read("services/api/server.mjs"),
  read("apps/site/components/FitCoreRouteClient.tsx"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
]);

for (const token of [
  "fitcore_assessment_templates",
  "fitcore_assessment_consents",
  "fitcore_assessments",
  "fitcore_assessment_measurements",
  "fitcore_assessment_attachments",
  "fitcore_assessment_events",
  "fitcore_assessment_template_publish",
  "fitcore_assessment_consent_record",
  "fitcore_assessment_record",
  "fitcore_assessment_summary",
  "fitcore_assessment_history",
  "assessment_history_immutable",
  "ai_coach_derived_signals",
  "server_side_only",
  "clinical_inference",
]) assert.ok(migration.includes(token), token);

assert.match(migration, /p_actor_role='aluno'/);
assert.match(migration, /assessment_student_write_forbidden/);
assert.match(migration, /assessment_consent_required/);
assert.match(migration, /object_key !~\* '\^https\?:\/\/'/);
assert.match(migration, /raw_responses_in_summary',false/);
assert.match(migration, /attachments_in_summary',false/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_assessments/);

for (const token of [
  "assessment_tenant_context_mismatch",
  "pg_advisory_xact_lock",
  "superseded_measurements_excluded",
  "unit_safe_delta",
  "unit_compatible",
  "sample_count",
]) assert.ok(hardening.includes(token), token);
assert.match(hardening, /current_setting\('app\.tenant_id',true\)/);
assert.match(hardening, /newer\.supersedes_assessment_id=a\.id/);
assert.match(hardening, /latest_unit=previous_unit/);
assert.match(hardening, /count\(\*\) OVER \(PARTITION BY m\.measurement_code\)/);

assert.match(manager, /raw_responses_to_external_ai: false/);
assert.match(manager, /attachment_refs_to_external_ai: false/);
assert.match(manager, /function coachSignals/);
assert.match(manager, /listTemplates/);
assert.match(manager, /recordAssessment/);
assert.match(manager, /assessment_measurement_invalid/);
assert.doesNotMatch(manager, /mapped\.code \|\| mapped\.message/);

assert.match(athlete, /assessmentManager = null/);
assert.match(athlete, /health_assessment_summary_included/);
assert.match(athlete, /raw_anamnesis_in_snapshot: false/);
assert.match(athlete, /clinical_inference: false/);

assert.match(coach, /assessment_signals/);
assert.match(coach, /assessment_raw_data_external_ai: false/);
assert.match(coach, /assessment_signals_descriptive_only: true/);

for (const route of [
  "/api/vnext/assessments/status",
  "/api/vnext/assessments/me",
  "/api/vnext/assessments/consents",
  "/api/vnext/assessments/templates",
]) assert.ok(server.includes(route), route);

assert.match(server, /assessmentStudentRecordMatch/);
assert.match(server, /createAssessmentManager/);

for (const token of [
  "Anamnese e avaliações físicas",
  "Consentimento das avaliações",
  "Templates versionados",
  "Registrar anamnese",
  "Registrar avaliação",
  "Histórico imutável de avaliações",
  "não gera diagnóstico automático",
]) assert.ok(ui.includes(token), token);
assert.match(ui, /if \(result\) form\.reset\(\)/);
assert.match(ui, /Number\.isFinite\(value\)/);

assert.match(deploy, /apply-assessments-anamnesis\.sh/);
assert.match(deploy, /apply-assessments-hardening\.sh/);

console.log("Assessments + Anamnesis #92 + hardening 029 contract: OK");
