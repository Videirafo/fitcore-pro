const els = {
  session: document.querySelector("#session-card"),
  credentialForm: document.querySelector("#credential-form"),
  credentialOut: document.querySelector("#credential-output"),
  loginForm: document.querySelector("#login-form"),
  loginOut: document.querySelector("#login-output"),
  revoke: document.querySelector("#revoke-credential"),
  recoveryRequestForm: document.querySelector("#recovery-request-form"),
  recoveryRequestOut: document.querySelector("#recovery-request-output"),
  recoveryCompleteForm: document.querySelector("#recovery-complete-form"),
  recoveryCompleteOut: document.querySelector("#recovery-complete-output"),
  recoveryToken: document.querySelector("#recovery-token"),
};

const params = new URLSearchParams(location.search);
const recoveryFromUrl = params.get("recovery");
const tenantFromUrl = params.get("tenant_slug") || params.get("tenant") || "demo";
if (recoveryFromUrl && els.recoveryToken) els.recoveryToken.value = recoveryFromUrl;
document.querySelectorAll('[name="tenant_slug"]').forEach((input) => { input.value = tenantFromUrl; });

function safe(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.mensagem || data.erro || `HTTP ${res.status}`);
  return data;
}

function renderSession(data) {
  const session = data.current_session;
  if (!session) {
    els.session.innerHTML = `<strong>Sem sessão ativa</strong><span>Entre por credencial, convite ou sessão de gestor existente.</span>`;
    els.credentialOut.textContent = "Faça login para definir ou revogar credencial.";
    return;
  }
  els.session.innerHTML = `<strong>${safe(session.actor_role)} · ${safe(session.actor_name)}</strong><span>tenant ${safe(session.tenant_slug)} · fonte ${safe(session.login_source || "sessão assinada")} · headers não confiáveis</span>`;
  loadProfile();
}

async function refreshSession() {
  try { renderSession(await api(`/api/mvp-15/session?v=${Date.now()}`)); }
  catch (error) { els.session.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`; }
}

async function loadProfile() {
  try {
    const data = await api(`/api/mvp-19/credentials/me?v=${Date.now()}`);
    const user = data.user;
    els.credentialOut.innerHTML = `<strong>${safe(user.nome)}</strong><span>${safe(user.papel)} · identificador: ${safe(user.login_identifier || "não definido")} · credencial: ${user.credential_set ? "ativa" : "pendente"}</span>`;
  } catch (error) {
    els.credentialOut.textContent = error.message;
  }
}

els.credentialForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.credentialForm).entries());
  els.credentialOut.textContent = "Salvando credencial...";
  try {
    const data = await api("/api/mvp-19/credentials/set", { method: "POST", body: JSON.stringify(body) });
    els.credentialOut.innerHTML = `<strong>Credencial salva</strong><span>Login: ${safe(data.user.login_identifier)} · tipo: ${safe(data.user.credential_kind)} · sem texto puro no banco.</span>`;
  } catch (error) { els.credentialOut.textContent = error.message; }
});

els.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.loginForm).entries());
  els.loginOut.textContent = "Entrando...";
  try {
    const data = await api("/api/mvp-19/login", { method: "POST", body: JSON.stringify(body) });
    els.loginOut.innerHTML = `<strong>Login realizado</strong><span>${safe(data.session.actor_role)} · ${safe(data.session.actor_name)} · origem ${safe(data.session.login_source)}</span>`;
    await refreshSession();
  } catch (error) { els.loginOut.textContent = error.message; }
});

els.revoke?.addEventListener("click", async () => {
  els.credentialOut.textContent = "Revogando credencial...";
  try {
    const data = await api("/api/mvp-19/credentials/revoke", { method: "POST", body: "{}" });
    els.credentialOut.innerHTML = `<strong>Credencial revogada</strong><span>${safe(data.user.login_identifier)} não entra mais por senha/código até redefinir.</span>`;
  } catch (error) { els.credentialOut.textContent = error.message; }
});

els.recoveryRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.recoveryRequestForm).entries());
  els.recoveryRequestOut.textContent = "Gerando recuperação...";
  try {
    const data = await api("/api/mvp-19/recovery/request", { method: "POST", body: JSON.stringify(body) });
    els.recoveryRequestOut.innerHTML = data.token
      ? `<strong>Token gerado</strong><input readonly value="${safe(data.recovery_link)}" /><span>Validade: ${safe(data.recovery.expires_at)}. Em produção isso vai por canal verificado.</span>`
      : `<strong>Solicitação registrada</strong><span>${safe(data.message)}</span>`;
  } catch (error) { els.recoveryRequestOut.textContent = error.message; }
});

els.recoveryCompleteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.recoveryCompleteForm).entries());
  els.recoveryCompleteOut.textContent = "Concluindo recuperação...";
  try {
    const data = await api("/api/mvp-19/recovery/complete", { method: "POST", body: JSON.stringify(body) });
    els.recoveryCompleteOut.innerHTML = `<strong>Credencial redefinida</strong><span>Sessão criada para ${safe(data.session.actor_role)} · ${safe(data.session.actor_name)}.</span>`;
    await refreshSession();
  } catch (error) { els.recoveryCompleteOut.textContent = error.message; }
});

refreshSession();
