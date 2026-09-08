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

const queryAliases = new Map([
  ["agachamento", "squat"],
  ["peito", "chest"],
  ["costas", "back"],
  ["halter", "dumbbell"],
  ["barra", "barbell"],
  ["abdominal", "abs"],
  ["abdômen", "abs"],
  ["biceps", "biceps"],
  ["bíceps", "biceps"],
  ["triceps", "triceps"],
  ["tríceps", "triceps"],
  ["perna", "legs"],
  ["pernas", "legs"],
  ["ombro", "shoulders"],
  ["ombros", "shoulders"],
]);

const labelMap = new Map([
  ["back", "costas"],
  ["chest", "peito"],
  ["upper legs", "pernas"],
  ["lower legs", "panturrilhas"],
  ["upper arms", "braços"],
  ["lower arms", "antebraços"],
  ["shoulders", "ombros"],
  ["waist", "abdômen"],
  ["cardio", "cardio"],
  ["dumbbell", "halter"],
  ["barbell", "barra"],
  ["cable", "cabo"],
  ["body weight", "peso corporal"],
  ["leverage machine", "máquina"],
  ["assisted", "assistido"],
  ["band", "elástico"],
  ["kettlebell", "kettlebell"],
  ["pectorals", "peitoral"],
  ["lats", "dorsais"],
  ["quads", "quadríceps"],
  ["glutes", "glúteos"],
  ["hamstrings", "posterior de coxa"],
  ["abs", "abdômen"],
  ["calves", "panturrilhas"],
  ["biceps", "bíceps"],
  ["triceps", "tríceps"],
  ["delts", "deltoides"],
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeQuery(query) {
  const raw = String(query || "").trim().toLowerCase();
  return queryAliases.get(raw) || raw;
}

function label(value) {
  const raw = String(value || "").trim();
  return labelMap.get(raw.toLowerCase()) || raw || "não informado";
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  if (countEl) countEl.textContent = `${total} exercício${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}`;
  if (totalEl && total > 0 && !query) totalEl.textContent = total.toLocaleString("pt-BR");

  if (!items.length) {
    resultsEl.innerHTML = `
      <article class="result-card">
        <small>Nenhum exercício encontrado</small>
        <h3>Refine a busca</h3>
        <p>Tente pesquisar por músculo, equipamento ou movimento. Exemplos: peito, costas, halter, abdominal.</p>
        <span class="policy">Base textual segura</span>
      </article>
    `;
    return;
  }

  resultsEl.innerHTML = items.map((item) => {
    const tags = [item.body_part, item.equipment, item.target]
      .filter(Boolean)
      .map((tag) => `<span class="tag">${escapeHtml(label(tag))}</span>`)
      .join("");

    const muscles = Array.isArray(item.secondary_muscles) && item.secondary_muscles.length
      ? item.secondary_muscles.slice(0, 3).map(label).join(", ")
      : "não informado";

    return `
      <article class="result-card">
        <small>Código ${escapeHtml(item.source_id)} · ${escapeHtml(label(item.category || "catálogo"))}</small>
        <h3>${escapeHtml(titleCase(item.name))}</h3>
        <div class="tag-row">${tags}</div>
        <p><strong>Foco principal:</strong> ${escapeHtml(label(item.primary_muscle || item.target))}</p>
        <p><strong>Músculos auxiliares:</strong> ${escapeHtml(muscles)}</p>
        <span class="policy">Conteúdo textual validado</span>
      </article>
    `;
  }).join("");
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    const data = await res.json();
    if (apiStateEl) apiStateEl.textContent = data.ok ? "Catálogo online" : "Verificar catálogo";
    if (mediaPolicyEl) mediaPolicyEl.textContent = data.media_policy ? "seguro" : "validado";
  } catch (error) {
    if (apiStateEl) apiStateEl.textContent = "Catálogo offline";
    console.warn("FitCore health check failed", error);
  }
}

async function searchExercises(query = "") {
  setLoading();
  const normalizedQuery = normalizeQuery(query);
  const params = new URLSearchParams({ limit: "6" });
  if (normalizedQuery) params.set("search", normalizedQuery);

  try {
    const res = await fetch(`/api/exercises?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    renderResults(data, normalizedQuery);
  } catch (error) {
    if (countEl) countEl.textContent = "Erro ao carregar exercícios";
    if (resultsEl) {
      resultsEl.innerHTML = `
        <article class="result-card">
          <small>Catálogo indisponível</small>
          <h3>Não foi possível carregar a base de exercícios.</h3>
          <p>Verifique o serviço FitCore API e tente novamente.</p>
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
    if (inputEl) inputEl.value = chip.textContent.trim();
    searchExercises(query);
  });
}

loadHealth();
searchExercises(inputEl?.value || "agachamento");
console.info("FitCore public shell loaded", marker);
