import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, rollback, manager, athlete, coach, server, ui, deploy] = await Promise.all([
  read("infra/sql/028-assessments-anamnesis.sql"),
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

assert.match(manager, /raw_responses_to_external_ai: false/);
assert.match(manager, /attachment_refs_to_external_ai: false/);
assert.match(manager, /function coachSignals/);
assert.match(manager, /listTemplates/);
assert.match(manager, /recordAssessment/);

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

assert.match(deploy, /apply-assessments-anamnesis\.sh/);

console.log("Assessments + Anamnesis #92 contract: OK");
