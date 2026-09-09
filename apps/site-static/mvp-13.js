const els = {
  storeStatus: document.querySelector("#store-status"),
  storeDetail: document.querySelector("#store-detail"),
  metricWorkouts: document.querySelector("#metric-workouts"),
  metricReviews: document.querySelector("#metric-reviews"),
  metricCheckins: document.querySelector("#metric-checkins"),
  metricStore: document.querySelector("#metric-store"),
  workoutList: document.querySelector("#workout-list"),
  reviewList: document.querySelector("#review-list"),
  checkinList: document.querySelector("#checkin-list"),
  debugOutput: document.querySelector("#debug-output"),
};

function text(el, value) {
  if (el) el.textContent = value;
}

async function getJson(path) {
  const response = await fetch(`${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} respondeu HTTP ${response.status}`);
  return response.json();
}

function renderItems(target, items, emptyLabel, mapper) {
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<div class="muted-box">${emptyLabel}</div>`;
    return;
  }
  target.innerHTML = items.map(mapper).join("");
}

function safe(value, fallback = "não informado") {
  return String(value || fallback)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadDashboard() {
  try {
    const [persistence, workouts, professor, checkins] = await Promise.all([
      getJson("/api/mvp-10/postgres-store"),
      getJson("/api/mvp-01/aluno-treino?limit=8"),
      getJson("/api/mvp-03/professor/contexto"),
      getJson("/api/mvp-02/checkins?limit=8"),
    ]);

    const reviewItems = Array.isArray(professor.reviews) ? professor.reviews : [];
    const workoutItems = Array.isArray(workouts.items) ? workouts.items : [];
    const checkinItems = Array.isArray(checkins.items) ? checkins.items : [];

    text(els.storeStatus, persistence.active_store || "--");
    text(els.storeDetail, persistence.reason || "estado verificado");
    text(els.metricWorkouts, String(workouts.total ?? workoutItems.length));
    text(els.metricReviews, String(professor.resumo?.revisoes ?? reviewItems.length));
    text(els.metricCheckins, String(checkins.total ?? checkinItems.length));
    text(els.metricStore, persistence.active_store || "--");

    renderItems(els.workoutList, workoutItems, "Nenhum treino encontrado.", (item) => `
      <div class="item">
        <strong>${safe(item.aluno?.nome)}</strong>
        <span>${safe(item.treino?.objetivo_nome || item.treino?.objetivo)} · ${safe(item.treino?.modalidade)} · ${safe(item.treino?.dias_semana)} dias</span>
        <span class="pill">${safe(item.status)}</span>
      </div>
    `);

    renderItems(els.reviewList, reviewItems, "Nenhuma revisão encontrada.", (item) => `
      <div class="item">
        <strong>${safe(item.aluno?.nome)}</strong>
        <span>${safe(item.professor?.nome)} · ${safe(item.treino?.objetivo)} · ${safe(item.treino_id)}</span>
        <span class="pill">${safe(item.status)}</span>
      </div>
    `);

    renderItems(els.checkinList, checkinItems, "Nenhum check-in encontrado.", (item) => `
      <div class="item">
        <strong>${safe(item.aluno?.nome)}</strong>
        <span>${safe(item.treino?.dia)} · esforço ${safe(item.percepcao_esforco)}/10 · ${safe(item.duracao_minutos)} min</span>
        <span class="pill">${safe(item.status)}</span>
      </div>
    `);

    text(els.debugOutput, JSON.stringify({
      persistence: {
        active_store: persistence.active_store,
        database_configured: persistence.database_configured,
        postgres_ready: persistence.postgres?.ready,
        fallback_rollback: persistence.policy?.fallbackRollback,
      },
      totals: {
        workouts: workouts.total ?? workoutItems.length,
        reviews: professor.resumo?.revisoes ?? reviewItems.length,
        checkins: checkins.total ?? checkinItems.length,
      },
      lgpd: persistence.policy?.lgpd,
    }, null, 2));
  } catch (error) {
    text(els.storeStatus, "Aguardando");
    text(els.storeDetail, "não foi possível carregar os dados operacionais");
    text(els.debugOutput, JSON.stringify({ ok: false, erro: error.message }, null, 2));
  }
}

loadDashboard();
