const els = {
  session: document.querySelector("#session"),
  form: document.querySelector("#invite-form"),
  inviteOut: document.querySelector("#invite-output"),
  users: document.querySelector("#users"),
  tokenPanel: document.querySelector("#token-panel"),
  tokenOut: document.querySelector("#token-output"),
  accept: document.querySelector("#accept-invite"),
};

const token = new URLSearchParams(location.search).get("token");

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

function showSession(data) {
  const session = data.current_session;
  if (!session) {
    els.session.innerHTML = `<strong>Login de gestor necessário</strong><span>Entre como gestor no MVP-15 para criar convites reais.</span><a href="/mvp-15.html">Abrir sessão</a>`;
    els.form.hidden = true;
    return;
  }
  els.session.innerHTML = `<strong>${safe(session.actor_role)} · ${safe(session.actor_name)}</strong><span>tenant ${safe(session.tenant_slug)} · papel vindo do banco · headers não confiáveis</span>`;
  els.form.hidden = session.actor_role !== "gestor";
  if (session.actor_role !== "gestor") els.inviteOut.textContent = "Somente gestor cria usuários e convites.";
}

async function loadUsers() {
  try {
    const data = await api(`/api/mvp-18/users?v=${Date.now()}`);
    els.users.innerHTML = `
      <h2>Usuários reais</h2>
      <div class="list">${data.users.map((user) => `<div class="item"><strong>${safe(user.nome)}</strong><span>${safe(user.papel)} · ${user.ativo ? "ativo" : "inativo"}</span></div>`).join("")}</div>
      <h2>Convites</h2>
      <div class="list">${data.invites.map((invite) => `<div class="item"><strong>${safe(invite.nome_convidado)}</strong><span>${safe(invite.papel)} · ${safe(invite.status)}</span></div>`).join("")}</div>`;
  } catch (error) {
    els.users.innerHTML = `<p>${safe(error.message)}</p>`;
  }
}

async function bootManager() {
  try {
    const session = await api(`/api/mvp-15/session?v=${Date.now()}`);
    showSession(session);
    await loadUsers();
  } catch (error) {
    els.session.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
}

async function bootInvite() {
  els.tokenPanel.hidden = false;
  els.form.hidden = true;
  document.querySelector("#manager-panel").hidden = true;
  try {
    const data = await api(`/api/mvp-18/invites/inspect?token=${encodeURIComponent(token)}&v=${Date.now()}`);
    const invite = data.invite;
    els.tokenOut.innerHTML = `<strong>Convite para ${safe(invite.nome_convidado)}</strong><span>Papel: ${safe(invite.papel)} · status: ${safe(invite.status)}</span><small>Sem botão demo: a sessão será criada pelo token e pelo papel do banco.</small>`;
    els.accept.disabled = !data.can_accept;
  } catch (error) {
    els.tokenOut.innerHTML = `<strong>Convite inválido</strong><span>${safe(error.message)}</span>`;
    els.accept.disabled = true;
  }
}

els.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.form).entries());
  els.inviteOut.textContent = "Criando convite...";
  try {
    const data = await api("/api/mvp-18/users/invite", { method: "POST", body: JSON.stringify(body) });
    els.inviteOut.innerHTML = `<strong>Convite criado</strong><input readonly value="${safe(data.full_invite_url)}" /><span>Envie este link para o usuário. O token não fica salvo em texto puro no banco.</span>`;
    await loadUsers();
  } catch (error) {
    els.inviteOut.textContent = error.message;
  }
});

els.accept?.addEventListener("click", async () => {
  els.tokenOut.innerHTML = `<strong>Aceitando convite...</strong><span>Gerando sessão real.</span>`;
  try {
    const data = await api("/api/mvp-18/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
    els.tokenOut.innerHTML = `<strong>Sessão criada</strong><span>${safe(data.session.actor_role)} · ${safe(data.session.actor_name)} · papel vindo do banco.</span><a href="/mvp-02.html">Continuar</a>`;
    els.accept.disabled = true;
  } catch (error) {
    els.tokenOut.textContent = error.message;
  }
});

if (token) bootInvite(); else bootManager();
