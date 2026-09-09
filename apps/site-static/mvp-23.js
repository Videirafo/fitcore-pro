const els = {
  session: document.querySelector("#session-card"),
  form: document.querySelector("#student-form"),
  createOut: document.querySelector("#create-output"),
  studentsOut: document.querySelector("#students-output"),
  detail: document.querySelector("#student-detail"),
  search: document.querySelector("#search"),
  status: document.querySelector("#status-filter"),
  refresh: document.querySelector("#refresh"),
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

function formBody(form) {
  const raw = Object.fromEntries(new FormData(form).entries());
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value || "").trim()]).filter(([, value]) => value));
}

async function refreshSession() {
  try {
    const data = await api(`/api/mvp-15/session?v=${Date.now()}`);
    const session = data.current_session;
    if (!session) {
      els.session.innerHTML = `<strong>Login necessário</strong><span>Entre como gestor ou professor.</span><a class="button secondary" href="/mvp-19.html">Entrar</a>`;
      return null;
    }
    els.session.innerHTML = `<strong>${safe(session.actor_role)} · ${safe(session.actor_name)}</strong><span>tenant ${safe(session.tenant_slug)} · RBAC assinado</span>`;
    return session;
  } catch (error) {
    els.session.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
    return null;
  }
}

function renderStudents(data) {
  const students = data.students || [];
  els.studentsOut.innerHTML = `
    <div class="item"><strong>Tenant ${safe(data.tenant_slug)}</strong><span>${safe(data.total)} aluno(s) · ${safe(data.ativos)} ativo(s)</span></div>
    ${students.map((student) => `
      <div class="item">
        <span class="badge">${safe(student.status)}</span>
        <strong>${safe(student.nome_publico)}</strong>
        <span>${safe(student.codigo_publico || "sem código")} · ${safe(student.nivel)} · ${safe(student.objetivo || "sem objetivo")}</span>
        <small>professor: ${safe(student.professor_nome || "não definido")} · frequência: ${safe(student.frequencia_semana || "-")}/semana</small>
        <button type="button" data-student-id="${safe(student.id)}">Ver detalhes</button>
      </div>`).join("") || '<div class="item">Nenhum aluno encontrado.</div>'}
  `;
}

async function loadStudents() {
  try {
    const params = new URLSearchParams();
    if (els.search.value.trim()) params.set("search", els.search.value.trim());
    if (els.status.value) params.set("status", els.status.value);
    params.set("limit", "40");
    const data = await api(`/api/mvp-23/students?${params.toString()}`);
    renderStudents(data);
  } catch (error) {
    els.studentsOut.innerHTML = `<div class="item"><strong>Não foi possível carregar</strong><span>${safe(error.message)}</span><a class="button secondary" href="/mvp-19.html">Entrar</a></div>`;
  }
}

async function loadDetail(id) {
  els.detail.textContent = "Carregando aluno...";
  try {
    const data = await api(`/api/mvp-23/students/${encodeURIComponent(id)}?v=${Date.now()}`);
    const student = data.student;
    els.detail.innerHTML = `
      <strong>${safe(student.nome_publico)}</strong>
      <span>${safe(student.codigo_publico || "sem código")} · ${safe(student.status)} · ${safe(student.nivel)}</span>
      <span>Objetivo: ${safe(student.objetivo || "-")}</span>
      <span>Modalidade: ${safe(student.modalidade_preferida || "-")}</span>
      <span>Professor: ${safe(student.professor_nome || "não definido")}</span>
      <span>Etiquetas: ${(student.etiquetas || []).map(safe).join(", ") || "-"}</span>
      <button class="secondary" type="button" id="deactivate-student">Marcar inativo</button>
    `;
    document.querySelector("#deactivate-student")?.addEventListener("click", async () => {
      await api(`/api/mvp-23/students/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status: "inativo", detalhe: "inativado pela UI MVP-23" }) });
      await loadStudents();
      await loadDetail(id);
    });
  } catch (error) {
    els.detail.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
}

els.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.createOut.textContent = "Criando aluno...";
  try {
    const data = await api("/api/mvp-23/students", { method: "POST", body: JSON.stringify(formBody(els.form)) });
    els.createOut.innerHTML = `<strong>Aluno criado</strong><span>${safe(data.student.nome_publico)} · ${safe(data.student.codigo_publico)}</span>`;
    await loadStudents();
    await loadDetail(data.student.id);
  } catch (error) {
    els.createOut.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
});

els.refresh?.addEventListener("click", loadStudents);
els.search?.addEventListener("input", () => setTimeout(loadStudents, 150));
els.status?.addEventListener("change", loadStudents);
els.studentsOut?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-student-id]");
  if (button) loadDetail(button.dataset.studentId);
});

refreshSession().then(loadStudents);
