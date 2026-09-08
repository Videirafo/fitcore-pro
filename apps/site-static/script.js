const marker = {
  product: "FitCore Pro",
  ecosystem: "MarcaIA",
  ui: "fitcore-owned-shell",
  api: "fitcore-owned-api",
  engine: "internal-fitness-engine",
  media_policy: "textual_only",
};

window.__FITCORE_PUBLIC_SHELL__ = marker;

const $ = (selector) => document.querySelector(selector);
const resultsEl = $("#exercise-results");
const inputEl = $("#exercise-search");
const buttonEl = $("#search-button");
const countEl = $("#catalog-count");
const totalEl = $("#catalog-total");
const apiStateEl = $("#api-state");
const mediaPolicyEl = $("#media-policy");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setLoading() {
  if (!resultsEl) return;
  resultsEl.innerHTML = `
    <article class="result-card skeleton"></article>
    <article class="result-card skeleton"></article>
    <article class="result-card skeleton"></article>
  `;
}

function renderResults(payload, query) {
  if (!resultsEl) return;

  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = Number(payload.total ?? items.length);

  if (countEl) countEl.textContent = `${total} resultado${total === 1 ? "" : "s"}`;
  if (totalEl && total > 0 && !query) totalEl.textContent = total.toLocaleString("pt-BR");

  if (!items.length) {
    resultsEl.innerHTML = `
      <article class="result-card">
        <small>Nenhum resultado</small>
        <h3>Refine a busca</h3>
        <p>Tente buscar por músculo, equipamento ou movimento. Exemplo: dumbbell, chest, back, abs.</p>
        <span class="policy">media_policy=textual_only</span>
      </article>
    `;
    return;
  }

  resultsEl.innerHTML = items.map((item) => {
    const tags = [item.body_part, item.equipment, item.target]
      .filter(Boolean)
      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
      .join("");

    const muscles = Array.isArray(item.secondary_muscles) && item.secondary_muscles.length
      ? item.secondary_muscles.slice(0, 3).join(", ")
      : "sem secundários informados";

    return `
      <article class="result-card">
        <small>${escapeHtml(item.source_id)} · ${escapeHtml(item.category || "catalog")}</small>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="tag-row">${tags}</div>
        <p><strong>Músculo principal:</strong> ${escapeHtml(item.primary_muscle || item.target || "não informado")}</p>
        <p><strong>Secundários:</strong> ${escapeHtml(muscles)}</p>
        <span class="policy">media_policy=${escapeHtml(item.media_policy || "textual_only")}</span>
      </article>
    `;
  }).join("");
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    const data = await res.json();
    if (apiStateEl) apiStateEl.textContent = data.ok ? "Online" : "Atenção";
    if (mediaPolicyEl) mediaPolicyEl.textContent = data.media_policy || "textual_only";
  } catch (error) {
    if (apiStateEl) apiStateEl.textContent = "Offline";
    console.warn("FitCore health check failed", error);
  }
}

async function searchExercises(query = "") {
  setLoading();
  const params = new URLSearchParams({ limit: "6" });
  if (query.trim()) params.set("search", query.trim());

  try {
    const res = await fetch(`/api/exercises?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    renderResults(data, query.trim());
  } catch (error) {
    if (countEl) countEl.textContent = "Erro na busca";
    if (resultsEl) {
      resultsEl.innerHTML = `
        <article class="result-card">
          <small>API indisponível</small>
          <h3>Não foi possível carregar o catálogo.</h3>
          <p>Verifique o serviço fitcore-api e tente novamente.</p>
          <span class="policy">${escapeHtml(error.message)}</span>
        </article>
      `;
    }
  }
}

let timer = null;
inputEl?.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => searchExercises(inputEl.value), 280);
});

buttonEl?.addEventListener("click", () => searchExercises(inputEl?.value || ""));

for (const chip of document.querySelectorAll("[data-query]")) {
  chip.addEventListener("click", () => {
    const query = chip.getAttribute("data-query") || "";
    if (inputEl) inputEl.value = query;
    searchExercises(query);
  });
}

loadHealth();
searchExercises(inputEl?.value || "squat");
console.info("FitCore public shell loaded", marker);
