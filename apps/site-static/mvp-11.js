const output = document.querySelector('#api-output');
const activeStore = document.querySelector('#active-store');
const storeDetail = document.querySelector('#store-detail');
const dbState = document.querySelector('#db-state');
const pgState = document.querySelector('#pg-state');
const rollbackState = document.querySelector('#rollback-state');

function setText(el, value) {
  if (el) el.textContent = value;
}

async function load() {
  try {
    const response = await fetch(`/api/mvp-10/postgres-store?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setText(activeStore, data.active_store || '--');
    setText(storeDetail, data.reason || 'diagnóstico carregado');
    setText(dbState, data.database_configured ? 'Configurado' : 'Ausente');
    setText(pgState, data.postgres?.ready ? 'Pronto' : data.postgres?.status || 'Pendente');
    setText(rollbackState, data.active_store === 'PostgresStore' ? 'Disponível' : 'JSON ativo');
    setText(output, JSON.stringify(data, null, 2));
  } catch (error) {
    setText(activeStore, 'Indefinido');
    setText(storeDetail, 'API ainda não respondeu');
    setText(dbState, 'Indefinido');
    setText(pgState, 'Indefinido');
    setText(rollbackState, 'Verificar');
    setText(output, JSON.stringify({ ok: false, erro: error.message }, null, 2));
  }
}

load();
