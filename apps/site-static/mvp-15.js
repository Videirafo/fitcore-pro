const out = document.querySelector("#output");
const fields = {
  title: document.querySelector("#status-title"),
  detail: document.querySelector("#status-detail"),
  tenant: document.querySelector("#tenant"),
  role: document.querySelector("#role"),
  source: document.querySelector("#source"),
  headers: document.querySelector("#headers"),
};

function show(data) {
  out.textContent = JSON.stringify(data, null, 2);
  const session = data.current_session;
  fields.title.textContent = session ? "Sessão ativa" : data.auth_mode === "signed" ? "Login necessário" : "Modo soft";
  fields.detail.textContent = session ? "Sessão assinada validada pelo banco." : "Nenhuma sessão assinada ativa neste navegador.";
  fields.tenant.textContent = session?.tenant_slug || data.tenant_slug || "demo";
  fields.role.textContent = session?.actor_role || "--";
  fields.source.textContent = session ? "PostgreSQL" : data.auth_mode || "soft";
  fields.headers.textContent = session?.headers_trusted === false ? "não confiáveis" : "soft/default";
}

async function api(path, options = {}) {
  const res = await fetch(path, { cache: "no-store", credentials: "include", ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function refresh() {
  try { show(await api(`/api/mvp-15/session?v=${Date.now()}`)); }
  catch (error) { out.textContent = error.message; }
}

document.querySelectorAll("button[data-role]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      const role = button.dataset.role;
      const data = await api("/api/mvp-15/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, actor_name: `${role} demo` }),
      });
      show({ ok: true, auth_mode: "signed", current_session: data.session, login: data.login });
      await refresh();
    } catch (error) { out.textContent = error.message; }
  });
});

document.querySelector("#logout").addEventListener("click", async () => {
  try {
    const data = await api("/api/mvp-15/session/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    show(data);
    await refresh();
  } catch (error) { out.textContent = error.message; }
});

refresh();
