import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, rollback, manager, server, routeClient, nav, legacyNav, page, deploy] = await Promise.all([
  read("infra/sql/027-athlete-360.sql"),
  read("infra/sql/rollback-027-athlete-360.sql"),
  read("services/api/security/athlete-360.mjs"),
  read("services/api/server.mjs"),
  read("apps/site/components/FitCoreRouteClient.tsx"),
  read("apps/site/components/FitCoreNavClient.tsx"),
  read("services/api/security/navigation-rbac.mjs"),
  read("apps/site/app/atleta/page.tsx"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
]);

for (const token of [
  "fitcore_athlete_goals",
  "fitcore_athlete_goal_events",
  "fitcore_athlete_360_accessible_student",
  "fitcore_athlete_360_snapshot",
  "fitcore_athlete_goal_create",
  "fitcore_athlete_goal_update",
  "adherence_28d_pct",
  "physical_assessments_issue",
  "pr_engine_issue",
]) assert.match(migration, new RegExp(token));

for (const forbidden of ["email", "telefone", "phone", "observacoes_minimas", "medical_data"]) {
  if (forbidden === "medical_data") assert.match(migration, /'medical_data_included',false/);
  else assert.doesNotMatch(migration, new RegExp(`['"]${forbidden}['"]\s*,`));
}
assert.match(migration, /p_actor_role='aluno' AND s\.user_id=p_actor_user_id/);
assert.match(migration, /p_actor_role='professor' AND s\.professor_id=p_actor_user_id/);
assert.match(migration, /athlete360_tenant_context_mismatch/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_athlete_goals/);

assert.match(manager, /Unified operational read model over existing sources/);
assert.match(manager, /minimum_identity: true/);
assert.match(manager, /health_assessment_summary_included/);
assert.match(manager, /raw_anamnesis_in_snapshot: false/);
assert.match(manager, /clinical_inference: false/);
assert.match(manager, /source_of_truth/);
assert.doesNotMatch(manager, /email:|telefone:|phone:/);

assert.match(server, /createAthlete360Manager/);
assert.match(server, /\/api\/vnext\/athlete-360\/status/);
assert.match(server, /\/api\/vnext\/athlete-360\/me/);
assert.match(server, /athlete360Manager\.snapshot/);
assert.match(server, /athlete360Manager\.createGoal/);
assert.match(server, /athlete360Manager\.updateGoal/);

assert.match(routeClient, /type Mode = .*"athlete"/);
assert.match(routeClient, /Athlete 360 · fonte operacional única/);
assert.match(routeClient, /Perfil autorizado/);
assert.match(routeClient, /Metas e progresso/);
assert.match(routeClient, /Timeline operacional/);
assert.match(routeClient, /Programado no #/);
assert.match(nav, /href: "\/atleta", label: "Athlete 360"/);
assert.match(legacyNav, /id: "athlete_360"/);
assert.match(page, /mode="athlete"/);
assert.match(deploy, /apply-athlete-360\.sh/);

console.log("Athlete 360 #91 contract: OK");
