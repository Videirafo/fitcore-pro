const statusEl = document.querySelector("#session-status");
const detailEl = document.querySelector("#session-detail");
const debugEl = document.querySelector("#debug-output");

function setText(el, value) { if (el) el.textContent = value; }

async function loadSession() {
  try {
    const data = await window.FitCoreAuth.current();
    const session = data.current_session;
    setText(statusEl, session ? "Sessão ativa" : "Login necessário");
    setText(detailEl, session ? `${session.actor_role} · ${session.tenant_slug} · banco` : "nenhuma sessão assinada ativa");
    setText(debugEl, JSON.stringify({
      auth_mode: data.auth_mode,
      current_session: session,
      protected_routes: data.protected_routes,
      mvp_16: {
        login_ui_integrado: true,
        telas_operacionais: ["mvp-01", "mvp-02", "mvp-03", "mvp-13"],
        headers_fonte_final: false,
      },
    }, null, 2));
  } catch (error) {
    setText(statusEl, "Erro");
    setText(detailEl, "não foi possível consultar sessão");
    setText(debugEl, error.message);
  }
}

loadSession();
