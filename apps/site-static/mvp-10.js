const els = {
  activeStore: document.querySelector("#active-store"),
  reason: document.querySelector("#store-reason"),
  dbConfigured: document.querySelector("#db-configured"),
  pgReady: document.querySelector("#pg-ready"),
  fallback: document.querySelector("#fallback"),
  resources: document.querySelector("#resources-count"),
  diagnostic: document.querySelector("#diagnostic"),
  refresh: document.querySelector("#refresh"),
};

function labelBoolean(value) {
  return value ? "sim" : "não";
}

function render(payload) {
  const postgres = payload.postgres || {};

  els.activeStore.textContent = payload.active_store || "--";
  els.reason.textContent = payload.reason || "diagnóstico indisponível";
  els.dbConfigured.textContent = labelBoolean(payload.database_configured);
  els.pgReady.textContent = labelBoolean(postgres.ready);
  els.fallback.textContent = labelBoolean(payload.fallback_seguro);
  els.resources.textContent = Array.isArray(payload.resources) ? String(payload.resources.length) : "--";
  els.diagnostic.textContent = JSON.stringify(payload, null, 2);
}

async function loadStatus() {
  els.diagnostic.textContent = "Carregando diagnóstico...";

  try {
    const response = await fetch(`/api/mvp-10/postgres-store?cb=${Date.now()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    render(await response.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    els.activeStore.textContent = "--";
    els.reason.textContent = "não foi possível carregar o diagnóstico";
    els.dbConfigured.textContent = "--";
    els.pgReady.textContent = "--";
    els.fallback.textContent = "--";
    els.resources.textContent = "--";
    els.diagnostic.textContent = JSON.stringify({ ok: false, erro: message }, null, 2);
  }
}

els.refresh?.addEventListener("click", loadStatus);
loadStatus();
