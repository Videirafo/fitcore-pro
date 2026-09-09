const statusLabel = document.querySelector("#status-label");
const statusDetail = document.querySelector("#status-detail");
const adapterName = document.querySelector("#adapter-name");
const activeStore = document.querySelector("#active-store");
const databaseState = document.querySelector("#database-state");
const apiOutput = document.querySelector("#api-output");

function setText(selector, value) {
  const el = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (el) el.textContent = value;
}

async function fetchJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} respondeu HTTP ${response.status}`);
  }
  return response.json();
}

async function loadMvp09() {
  try {
    const data = await fetchJson("/api/mvp-09/persistence");

    setText(statusLabel, data.server_connected ? "Conectado" : "Pendente");
    setText(statusDetail, data.reason || "adapter verificado");
    setText(adapterName, data.adapter || "PersistenceAdapter");
    setText(activeStore, data.active_store || data.selected_store || "JsonFileStore");
    setText(databaseState, data.database_configured ? "Configurado" : "Fallback");
    setText(apiOutput, JSON.stringify(data, null, 2));
  } catch (error) {
    setText(statusLabel, "Aguardando");
    setText(statusDetail, "aplique o MVP-09 no server.mjs e reinicie a API");
    setText(adapterName, "PersistenceAdapter");
    setText(activeStore, "JsonFileStore");
    setText(databaseState, "Fallback");
    setText(apiOutput, JSON.stringify({
      ok: false,
      mensagem: error.message,
      acao: "rodar: bash infra/scripts/apply-mvp-09-adapter.sh && systemctl restart fitcore-api",
    }, null, 2));
  }
}

loadMvp09();
