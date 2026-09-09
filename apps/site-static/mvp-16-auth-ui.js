// FITCORE PRO — MVP-16
// Login UI compartilhado para telas operacionais.
// Mantém fetch autenticado por cookie HttpOnly e evita depender de headers como fonte final de confiança.

(() => {
  const config = {
    required: document.body?.dataset.fitcoreAuthRequired === "true",
    roles: String(document.body?.dataset.fitcoreRoles || "gestor,professor,aluno").split(",").map((role) => role.trim()).filter(Boolean),
    title: document.body?.dataset.fitcoreAuthTitle || "Login necessário",
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => originalFetch(input, { credentials: "include", ...init });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function roleLabel(role) {
    return ({ gestor: "gestor", professor: "professor", aluno: "aluno" })[role] || role;
  }

  async function requestJson(path, options = {}) {
    const res = await window.fetch(path, {
      cache: "no-store",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const error = new Error(data.mensagem || data.erro || `HTTP ${res.status}`);
      error.status = res.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  function ensureShell() {
    if (document.querySelector("#fitcore-authbar")) return;
    document.body.insertAdjacentHTML("afterbegin", `
      <div id="fitcore-authbar" class="fitcore-authbar" data-visible="false">
        <div><strong id="fitcore-auth-title">Verificando sessão</strong><span id="fitcore-auth-detail">Aguardando API de sessão.</span></div>
        <div class="fitcore-auth-actions"><button type="button" id="fitcore-auth-refresh">Atualizar sessão</button><button type="button" class="secondary" id="fitcore-auth-logout">Sair</button></div>
      </div>
      <div id="fitcore-auth-lock" class="fitcore-auth-lock" data-visible="false">
        <section class="fitcore-auth-panel">
          <small>MVP-16 · Login integrado</small>
          <h2>${escapeHtml(config.title)}</h2>
          <p>Esta tela usa sessão assinada. O tenant e o papel final são resolvidos no banco, não por headers do navegador.</p>
          <div class="fitcore-auth-role-grid" id="fitcore-auth-roles"></div>
          <div class="fitcore-auth-state" id="fitcore-auth-state">Escolha um perfil demo para continuar.</div>
        </section>
      </div>
    `);

    document.querySelector("#fitcore-auth-refresh")?.addEventListener("click", () => location.reload());
    document.querySelector("#fitcore-auth-logout")?.addEventListener("click", async () => {
      await logout();
      location.reload();
    });
    const rolesEl = document.querySelector("#fitcore-auth-roles");
    rolesEl.innerHTML = config.roles.map((role) => `<button type="button" data-fitcore-login-role="${escapeHtml(role)}">Entrar como ${escapeHtml(roleLabel(role))}</button>`).join("");
    rolesEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-fitcore-login-role]");
      if (!button) return;
      await login(button.dataset.fitcoreLoginRole);
    });
  }

  function setBar(session, mode = "signed") {
    ensureShell();
    const bar = document.querySelector("#fitcore-authbar");
    const title = document.querySelector("#fitcore-auth-title");
    const detail = document.querySelector("#fitcore-auth-detail");
    bar.dataset.visible = "true";
    if (session) {
      title.textContent = `${session.actor_role} · ${session.actor_name}`;
      detail.textContent = `tenant ${session.tenant_slug || "demo"} · papel vindo do banco · headers não confiáveis`;
    } else {
      title.textContent = mode === "signed" ? "Login necessário" : "Modo soft";
      detail.textContent = mode === "signed" ? "Faça login para acessar esta operação." : "RBAC soft ativo.";
    }
  }

  function lock(message = "Faça login para continuar.") {
    ensureShell();
    document.body.classList.add("fitcore-auth-locked");
    document.querySelector("#fitcore-auth-lock").dataset.visible = "true";
    document.querySelector("#fitcore-auth-state").textContent = message;
  }

  function unlock() {
    ensureShell();
    document.body.classList.remove("fitcore-auth-locked");
    document.querySelector("#fitcore-auth-lock").dataset.visible = "false";
  }

  async function current() {
    const data = await requestJson(`/api/mvp-15/session?v=${Date.now()}`);
    return data;
  }

  async function login(role) {
    ensureShell();
    document.querySelector("#fitcore-auth-state").textContent = `Criando sessão ${role}...`;
    const data = await requestJson("/api/mvp-15/session/login", {
      method: "POST",
      body: JSON.stringify({ role, actor_name: `${role} demo` }),
    });
    setBar(data.session, "signed");
    unlock();
    location.reload();
  }

  async function logout() {
    return requestJson("/api/mvp-15/session/logout", { method: "POST", body: "{}" });
  }

  async function requireSession() {
    ensureShell();
    try {
      const data = await current();
      const session = data.current_session;
      setBar(session, data.auth_mode);
      if (config.required && !session && data.auth_mode === "signed") {
        lock("Sessão assinada obrigatória para esta tela.");
        return null;
      }
      unlock();
      return session || null;
    } catch (error) {
      setBar(null, "signed");
      if (config.required) lock(error.message || "Não foi possível validar a sessão.");
      return null;
    }
  }

  window.FitCoreAuth = { requireSession, current, login, logout, api: requestJson };
  document.addEventListener("DOMContentLoaded", requireSession, { once: true });
})();
