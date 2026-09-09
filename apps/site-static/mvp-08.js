const byId = (id) => document.getElementById(id);

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} retornou HTTP ${response.status}`);
  }
  return response.json();
}

function renderMode() {
  const databaseUrlConfigured = false;
  const mode = databaseUrlConfigured ? "PostgreSQL" : "JSON local";

  byId("current-mode").textContent = mode;
  byId("current-reason").textContent = "Fallback seguro até FITCORE_DATABASE_URL ser configurado e verificado.";
  byId("fallback-status").textContent = "ativo";
  byId("database-status").textContent = "preparado";
}

function statusText(ok, details) {
  return ok ? details : "não disponível";
}

function renderRuntime(results) {
  const health = results.health.status === "fulfilled" ? results.health.value : null;
  const mvp01 = results.mvp01.status === "fulfilled" ? results.mvp01.value : null;
  const mvp02 = results.mvp02.status === "fulfilled" ? results.mvp02.value : null;
  const mvp03 = results.mvp03.status === "fulfilled" ? results.mvp03.value : null;

  byId("runtime-status").innerHTML = [
    ["API", statusText(Boolean(health?.ok), health ? "online" : "falhou")],
    ["MVP-01", statusText(Boolean(mvp01?.aluno_treino), `${mvp01?.registros || 0} aluno(s)/treino(s)`) ],
    ["MVP-02", statusText(Boolean(mvp02?.checkin_treino), `${mvp02?.registros || 0} check-in(s)`) ],
    ["MVP-03", statusText(Boolean(mvp03?.painel_professor), `${mvp03?.registros || 0} revisão(ões)`) ],
  ].map(([title, text]) => `
    <div>
      <strong>${title}</strong>
      <span>${text}</span>
    </div>
  `).join("");
}

async function init() {
  renderMode();

  const [health, mvp01, mvp02, mvp03] = await Promise.allSettled([
    fetchJson("/api/health"),
    fetchJson("/api/mvp-01/status"),
    fetchJson("/api/mvp-02/status"),
    fetchJson("/api/mvp-03/status"),
  ]);

  renderRuntime({ health, mvp01, mvp02, mvp03 });
}

init().catch((error) => {
  byId("runtime-status").innerHTML = `
    <div>
      <strong>Validação</strong>
      <span>${error.message}</span>
    </div>
  `;
});
