const marker = {
  product: "FitCore Pro",
  ecosystem: "MarcaIA",
  ui: "fitcore-owned-shell",
  api: "fitcore-owned-api",
};

window.__FITCORE_PUBLIC_SHELL__ = marker;

const $ = (selector) => document.querySelector(selector);
const resultsEl = $("#exercise-results");
const inputEl = $("#exercise-search");
const buttonEl = $("#search-button");
const countEl = $("#catalog-count");
const totalEl = $("#catalog-total");
const apiStateEl = $("#api-state");

const queryAliases = new Map([
  ["agachamento", "squat"],
  ["peito", "chest"],
  ["costas", "back"],
  ["halter", "dumbbell"],
  ["halteres", "dumbbell"],
  ["barra", "barbell"],
  ["abdominal", "abs"],
  ["abdomen", "abs"],
  ["abdômen", "abs"],
  ["biceps", "biceps"],
  ["bíceps", "biceps"],
  ["triceps", "triceps"],
  ["tríceps", "triceps"],
  ["perna", "legs"],
  ["pernas", "legs"],
  ["ombro", "shoulders"],
  ["ombros", "shoulders"],
  ["funcional", "body weight"],
  ["crossfit", "burpee"],
  ["cross training", "burpee"],
  ["box", "burpee"],
  ["burpee", "burpee"],
  ["kettlebell", "kettlebell"],
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
  ["medicine ball", "bola medicinal"],
  ["rope", "corda"],
  ["wheel roller", "roda abdominal"],
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
  ["forearms", "antebraços"],
]);

const exactExerciseNames = new Map([
  ["barbell bench front squat", "Agachamento frontal com barra no banco"],
  ["barbell bench squat", "Agachamento com barra no banco"],
  ["barbell clean-grip front squat", "Agachamento frontal com pegada clean"],
  ["barbell front chest squat", "Agachamento frontal com barra no peito"],
  ["barbell front squat", "Agachamento frontal com barra"],
  ["barbell full squat", "Agachamento completo com barra"],
  ["assisted chest dip (kneeling)", "Mergulho para peito assistido ajoelhado"],
  ["alternate lateral pulldown", "Puxada lateral alternada"],
  ["assisted hanging knee raise with throw down", "Elevação de joelhos suspenso com auxílio"],
]);

const phraseTranslations = [
  ["barbell", "com barra"],
  ["dumbbell", "com halter"],
  ["kettlebell", "com kettlebell"],
  ["body weight", "com peso corporal"],
  ["cable", "no cabo"],
  ["leverage machine", "na máquina"],
  ["assisted", "assistido"],
  ["resistance band", "com elástico"],
  ["band", "com elástico"],
  ["bench", "no banco"],
  ["front squat", "agachamento frontal"],
  ["full squat", "agachamento completo"],
  ["squat", "agachamento"],
  ["lunge", "avanço"],
  ["deadlift", "levantamento terra"],
  ["bench press", "supino"],
  ["press", "desenvolvimento"],
  ["pulldown", "puxada"],
  ["pull-up", "barra fixa"],
  ["push-up", "flexão"],
  ["dip", "mergulho"],
  ["curl", "rosca"],
  ["raise", "elevação"],
  ["row", "remada"],
  ["extension", "extensão"],
  ["crunch", "abdominal"],
  ["plank", "prancha"],
  ["burpee", "burpee"],
  ["clean", "clean"],
  ["snatch", "snatch"],
  ["thruster", "thruster"],
  ["chest", "peito"],
  ["front", "frontal"],
  ["lateral", "lateral"],
  ["reverse", "reverso"],
  ["standing", "em pé"],
  ["seated", "sentado"],
  ["lying", "deitado"],
  ["kneeling", "ajoelhado"],
  ["hanging", "suspenso"],
  ["alternate", "alternado"],
];

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

function toTitlePt(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function exerciseNamePt(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "Exercício sem nome";
  if (exactExerciseNames.has(raw)) return exactExerciseNames.get(raw);

  let translated = ` ${raw.replace(/[()]/g, " ")} `;

  for (const [from, to] of phraseTranslations) {
    translated = translated.replaceAll(` ${from} `, ` ${to} `);
  }

  return toTitlePt(translated);
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
        <p>Tente pesquisar por músculo, equipamento ou movimento. Exemplos: peito, costas, halter, abdominal, burpee ou kettlebell.</p>
        <span class="policy">Disponível para prescrição</span>
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
        <h3>${escapeHtml(exerciseNamePt(item.name))}</h3>
        <div class="tag-row">${tags}</div>
        <p><strong>Foco principal:</strong> ${escapeHtml(label(item.primary_muscle || item.target))}</p>
        <p><strong>Músculos auxiliares:</strong> ${escapeHtml(muscles)}</p>
        <span class="policy">Disponível para montar treino</span>
      </article>
    `;
  }).join("");
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    const data = await res.json();
    if (apiStateEl) apiStateEl.textContent = data.ok ? "Sistema online" : "Verificar sistema";
  } catch (error) {
    if (apiStateEl) apiStateEl.textContent = "Sistema indisponível";
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
