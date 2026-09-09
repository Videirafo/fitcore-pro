const tables = [
  ["fitcore_tenants", "empresa/unidade do cliente; base do isolamento multi-tenant"],
  ["fitcore_users", "usuários mínimos com papel: gestor, professor ou aluno"],
  ["fitcore_students", "alunos com dados mínimos e sem informação sensível nesta fase"],
  ["fitcore_workouts", "treinos por aluno, objetivo, modalidade, status e aprovação"],
  ["fitcore_workout_days", "dias/blocos do treino com foco, aquecimento e orientação"],
  ["fitcore_workout_exercises", "exercícios prescritos por dia, ordem, séries e repetições"],
  ["fitcore_professor_reviews", "revisões do professor, ajustes e aprovação"],
  ["fitcore_workout_executions", "execuções/check-ins do treino com status e esforço"],
  ["fitcore_exercise_execution_items", "marcações de cada exercício feito pelo aluno"],
  ["fitcore_audit_events", "trilha mínima de auditoria LGPD por ação"],
];

const mvpMap = [
  ["MVP-01", "fitcore_students + fitcore_workouts", "cadastro mínimo do aluno e rascunho de treino"],
  ["MVP-02", "fitcore_workout_executions", "check-in planejado, em execução ou concluído"],
  ["MVP-03", "fitcore_professor_reviews", "revisão, troca de exercício e aprovação"],
  ["MVP-04", "fitcore_exercise_execution_items", "aluno marca exercícios feitos e conclui treino"],
  ["MVP-05", "fitcore_users + papel", "menus e permissões por gestor, professor e aluno"],
  ["MVP-06", "mídia validada + auditoria", "GIFs, origem, licença e uso visual no treino"],
];

const $ = (id) => document.getElementById(id);

function renderTables() {
  $("table-list").innerHTML = tables.map(([name, description]) => `
    <div class="table-row">
      <strong>${name}</strong>
      <span>${description}</span>
    </div>
  `).join("");
}

function renderSchemaMap() {
  $("schema-grid").innerHTML = mvpMap.map(([mvp, table, description]) => `
    <div class="schema-row">
      <strong>${mvp} → ${table}</strong>
      <span>${description}</span>
    </div>
  `).join("");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
  return response.json();
}

function setMode(mode, detail, statusClass = "status-ok") {
  const modeEl = $("persistence-mode");
  const detailEl = $("persistence-detail");
  modeEl.textContent = mode;
  modeEl.className = statusClass;
  detailEl.textContent = detail;
}

async function loadStatus() {
  try {
    const health = await fetchJson(`/api/health?ts=${Date.now()}`);
    const mvp01 = health?.mvp_01?.registros || 0;
    const mvp02 = health?.mvp_02?.registros || 0;
    const mvp03 = health?.mvp_03?.registros || 0;

    $("metric-students").textContent = mvp01;
    $("metric-workouts").textContent = mvp01;
    $("metric-checkins").textContent = mvp02;
    $("metric-reviews").textContent = mvp03;

    setMode("fallback seguro", "API própria online; banco ainda precisa ser aplicado/configurado.", "status-warn");
  } catch (error) {
    setMode("indisponível", "Não foi possível consultar /api/health.", "status-error");
  }
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = $(button.dataset.copy);
      if (!target) return;
      await navigator.clipboard.writeText(target.textContent.trim());
      const old = button.textContent;
      button.textContent = "Copiado";
      setTimeout(() => { button.textContent = old; }, 1200);
    });
  });
}

renderTables();
renderSchemaMap();
setupCopyButtons();
loadStatus();
