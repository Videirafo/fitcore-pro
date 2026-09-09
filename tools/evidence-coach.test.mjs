import test from "node:test";
import assert from "node:assert/strict";
import { buildStudentContextPack, evaluateFeedbackQuality, buildCoachRecommendations } from "../services/api/security/evidence-coach.mjs";

test("MVP-33 sinaliza evidência insuficiente sem inventar progresso", () => {
  const pack = buildStudentContextPack({ student: { student_id: "a", student_name: "Aluno", total_executions: 0, completed_executions: 0, weekly_frequency: 0 } });
  const quality = evaluateFeedbackQuality(pack);
  const recs = buildCoachRecommendations(pack);
  assert.equal(pack.metrics.adherence_percent, null);
  assert.equal(quality.sufficient, false);
  assert.equal(recs[0].kind, "evidence");
});

test("MVP-33 recomenda revisão humana quando esforço médio é alto", () => {
  const pack = buildStudentContextPack({ student: { student_id: "b", total_executions: 8, completed_executions: 7, weekly_frequency: 2, average_effort: 9.2, average_duration: 48 } });
  const recs = buildCoachRecommendations(pack);
  assert.ok(recs.some((item) => item.kind === "load_review"));
  assert.equal(pack.confidence, "media");
});

test("MVP-33 só sugere progressão gradual com aderência e frequência consistentes", () => {
  const pack = buildStudentContextPack({ student: { student_id: "c", total_executions: 12, completed_executions: 11, weekly_frequency: 3, average_effort: 7.5 } });
  const recs = buildCoachRecommendations(pack);
  assert.ok(recs.some((item) => item.kind === "progression"));
  assert.equal(pack.confidence, "alta");
});
