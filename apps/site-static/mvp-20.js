const els = {
  status: document.querySelector("#status-card"),
  policy: document.querySelector("#policy-output"),
  logs: document.querySelector("#logs"),
  cleanup: document.querySelector("#cleanup"),
  cleanupOutput: document.querySelector("#cleanup-output"),
};

function safe(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const res = await fetch(path, { cache: "no-store", credentials: "include", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.mensagem || data.erro || `HTTP ${res.status}`);
  return data;
}

async function loadStatus() {
  try {
    const data = await api(`/api/mvp-20/security/status?v=${Date.now()}`);
    els.status.innerHTML = `<strong>${data.enabled ? "Hardening ativo" : "Hardening inativo"}</strong><span>ambiente ${safe(data.fitcore_env)} · demo ${data.demo_login_enabled ? "permitido" : "bloqueado"}</span>`;
    els.policy.textContent = JSON.stringify({ demo_login_enabled: data.demo_login_enabled, credential_policy: data.credential_policy, rate_limit: data.rate_limit, logs: data.logs }, null, 2);
  } catch (error) {
    els.status.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
}

async function loadLogs() {
  try {
    const data = await api(`/api/mvp-20/security/logs?v=${Date.now()}`);
    els.logs.innerHTML = data.logs.length ? data.logs.map((log) => `<div class="item"><strong>${safe(log.acao)} · ${safe(log.status)}</strong><span>${safe(log.detalhe || "sem detalhe")}</span><small>${safe(log.criado_em)}</small></div>`).join("") : "Nenhum evento de segurança recente.";
  } catch (error) {
    els.logs.innerHTML = `<p>${safe(error.message)}</p><p><a class="button" href="/mvp-19.html">Entrar como gestor</a></p>`;
  }
}

els.cleanup?.addEventListener("click", async () => {
  els.cleanupOutput.textContent = "Executando limpeza...";
  try {
    const data = await api("/api/mvp-20/security/cleanup-sessions", { method: "POST", body: "{}" });
    els.cleanupOutput.innerHTML = `<strong>Limpeza concluída</strong><span>sessões expiradas revogadas: ${safe(data.expired_sessions_revoked)} · buckets antigos removidos: ${safe(data.old_rate_buckets_deleted)}</span>`;
    await loadLogs();
  } catch (error) {
    els.cleanupOutput.textContent = error.message;
  }
});

loadStatus();
loadLogs();
