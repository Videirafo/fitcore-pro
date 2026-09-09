const els = {
  status: document.querySelector("#status-card"),
  form: document.querySelector("#onboarding-form"),
  out: document.querySelector("#onboarding-output"),
  tenant: document.querySelector("#tenant-output"),
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
    const status = await api(`/api/mvp-21/status?v=${Date.now()}`);
    els.status.innerHTML = `<strong>${status.enabled ? "Onboarding ativo" : "Onboarding inativo"}</strong><span>demo não é mais o único fluxo · tenant atual: ${safe(status.current_tenant_slug || "sem sessão")}</span>`;
  } catch (error) {
    els.status.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
}

async function loadTenant() {
  try {
    const data = await api(`/api/mvp-21/tenant?v=${Date.now()}`);
    const tenant = data.tenant;
    els.tenant.innerHTML = `<strong>${safe(tenant.nome)}</strong><span>${safe(tenant.tipo_negocio)} · ${safe(tenant.slug)} · ${safe(tenant.internal_domain)}</span><span>usuários: ${data.counters.users} · alunos: ${data.counters.students} · treinos: ${data.counters.workouts}</span><div class="actions"><a class="button" href="/mvp-13.html">Abrir operação</a><a class="button secondary" href="/mvp-19.html?tenant_slug=${encodeURIComponent(tenant.slug)}">Login deste tenant</a></div>`;
  } catch (error) {
    els.tenant.innerHTML = `<span>${safe(error.message)}</span>`;
  }
}

els.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.form).entries());
  els.out.textContent = "Criando tenant real...";
  try {
    const data = await api("/api/mvp-21/onboarding", { method: "POST", body: JSON.stringify(body) });
    els.out.innerHTML = `
      <strong>Tenant criado e sessão iniciada</strong>
      <span>${safe(data.tenant.nome)} · ${safe(data.tenant.slug)} · ${safe(data.tenant.internal_domain)}</span>
      <span>Gestor: ${safe(data.owner.nome)} · login: ${safe(data.owner.login_identifier)}</span>
      <span>Professor inicial: ${safe(data.first_professor.nome)} · aluno inicial: ${safe(data.first_student.nome_publico)}</span>
      <code>${safe(data.login.url)}</code>
      <div class="actions"><a class="button" href="/mvp-13.html">Abrir operação</a><a class="button secondary" href="/mvp-19.html?tenant_slug=${encodeURIComponent(data.tenant.slug)}">Entrar depois</a></div>
    `;
    await loadStatus();
    await loadTenant();
  } catch (error) {
    els.out.textContent = error.message;
  }
});

loadStatus();
loadTenant();
