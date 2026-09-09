const activeStore = document.querySelector("#active-store");
const dbReady = document.querySelector("#db-ready");
const rollbackState = document.querySelector("#rollback-state");
const storeReason = document.querySelector("#store-reason");
const apiOutput = document.querySelector("#api-output");

function setText(target, value) {
  if (target) target.textContent = value;
}

async function loadState() {
  try {
    const response = await fetch(`/api/mvp-10/postgres-store?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    setText(activeStore, data.active_store || "--");
    setText(dbReady, data.postgres?.ready ? "Pronto" : "Pendente");
    setText(rollbackState, data.policy?.fallbackRollback ? "Disponível" : "Verificar");
    setText(storeReason, data.reason || "diagnóstico carregado");
    setText(apiOutput, JSON.stringify(data, null, 2));
  } catch (error) {
    setText(activeStore, "Erro");
    setText(dbReady, "Pendente");
    setText(rollbackState, "Verificar");
    setText(storeReason, "não foi possível consultar o endpoint");
    setText(apiOutput, JSON.stringify({ ok: false, mensagem: error.message }, null, 2));
  }
}

loadState();
