const els = {
  session: document.querySelector("#session-card"),
  createForm: document.querySelector("#create-user-form"),
  createOut: document.querySelector("#create-user-output"),
  inviteForm: document.querySelector("#invite-form"),
  inviteOut: document.querySelector("#invite-output"),
  acceptForm: document.querySelector("#accept-form"),
  acceptOut: document.querySelector("#accept-output"),
  usersOut: document.querySelector("#users-output"),
  refresh: document.querySelector("#refresh-users"),
  acceptTenant: document.querySelector("#accept-tenant"),
  acceptToken: document.querySelector("#accept-token"),
};

const params = new URLSearchParams(location.search);
if (els.acceptTenant) els.acceptTenant.value = params.get("tenant_slug") || params.get("tenant") || "";
if (els.acceptToken) els.acceptToken.value = params.get("token") || "";

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

function formBody(form) {
  const raw = Object.fromEntries(new FormData(form).entries());
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value || "").trim()]).filter(([, value]) => value));
}

async function refreshSession() {
  try {
    const data = await api(`/api/mvp-15/session?v=${Date.now()}`);
    const session = data.current_session;
    if (!session) {
      els.session.innerHTML = `<strong>Login necessário</strong><span>Entre como gestor para administrar equipe.</span><a class="button secondary" href="/mvp-19.html">Entrar</a>`;
      return null;
    }
    els.session.innerHTML = `<strong>${safe(session.actor_role)} · ${safe(session.actor_name)}</strong><span>tenant ${safe(session.tenant_slug)} · fonte ${safe(session.login_source)} · headers não confiáveis</span>`;
    return session;
  } catch (error) {
    els.session.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
    return null;
  }
}

function renderUsers(data) {
  const users = data.users || [];
  const invites = data.invites || [];
  els.usersOut.innerHTML = `
    <div class="item"><strong>Tenant ${safe(data.tenant_slug)}</strong><span>${users.length} usuário(s) · ${invites.length} convite(s)</span></div>
    ${users.map((user) => `<div class="item"><strong>${safe(user.nome)}</strong><span>${safe(user.papel)} · ${safe(user.login_identifier || "sem login")}</span><small>credencial: ${user.credential_set ? "ativa" : "pendente"}</small></div>`).join("")}
    ${invites.slice(0, 6).map((invite) => `<div class="item"><span class="badge">convite</span><strong>${safe(invite.nome_convidado)}</strong><span>${safe(invite.papel)} · ${safe(invite.status)}</span><small>${safe(invite.expires_at)}</small></div>`).join("")}
  `;
}

async function loadUsers() {
  try { renderUsers(await api(`/api/mvp-22/users?v=${Date.now()}`)); }
  catch (error) { els.usersOut.innerHTML = `<p>${safe(error.message)}</p><p><a class="button" href="/mvp-19.html">Entrar como gestor</a></p>`; }
}

els.createForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.createOut.textContent = "Criando usuário no tenant atual...";
  try {
    const data = await api("/api/mvp-22/users", { method: "POST", body: JSON.stringify(formBody(els.createForm)) });
    els.createOut.innerHTML = `<strong>Usuário criado</strong><span>${safe(data.user.nome)} · ${safe(data.user.papel)} · login ${safe(data.user.login_identifier)}</span>`;
    await loadUsers();
  } catch (error) { els.createOut.textContent = error.message; }
});

els.inviteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.inviteOut.textContent = "Gerando convite...";
  try {
    const data = await api("/api/mvp-22/users/invite", { method: "POST", body: JSON.stringify(formBody(els.inviteForm)) });
    els.inviteOut.innerHTML = `<strong>Convite criado</strong><input readonly value="${safe(data.invite.full_invite_url)}" /><span>tenant ${safe(data.invite.tenant_slug)} · ${safe(data.invite.papel)}</span>`;
    if (els.acceptTenant) els.acceptTenant.value = data.invite.tenant_slug;
    if (els.acceptToken) els.acceptToken.value = data.token;
    await loadUsers();
  } catch (error) { els.inviteOut.textContent = error.message; }
});

els.acceptForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.acceptOut.textContent = "Aceitando convite...";
  try {
    const data = await api("/api/mvp-22/invites/accept", { method: "POST", body: JSON.stringify(formBody(els.acceptForm)) });
    els.acceptOut.innerHTML = `<strong>Convite aceito</strong><span>${safe(data.user.nome)} · ${safe(data.user.papel)} · tenant ${safe(data.session.tenant_slug)}</span><a class="button secondary" href="/mvp-04.html">Abrir operação</a>`;
    await refreshSession();
  } catch (error) { els.acceptOut.textContent = error.message; }
});

els.refresh?.addEventListener("click", loadUsers);

refreshSession().then(loadUsers);
