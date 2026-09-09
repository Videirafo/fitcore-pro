const els = {
  session: document.querySelector("#session-card"),
  form: document.querySelector("#prescription-form"),
  studentSelect: document.querySelector("#student-select"),
  createOut: document.querySelector("#create-output"),
  listOut: document.querySelector("#prescriptions-output"),
  detail: document.querySelector("#detail-output"),
  myOut: document.querySelector("#my-output"),
  search: document.querySelector("#search"),
  status: document.querySelector("#status-filter"),
  refresh: document.querySelector("#refresh"),
  loadMy: document.querySelector("#load-my-workouts"),
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
      els.session.innerHTML = `<strong>Login necessário</strong><span>Entre para prescrever ou ver treinos.</span><a class="button secondary" href="/mvp-19.html">Entrar</a>`;
      return null;
    }
    els.session.innerHTML = `<strong>${safe(session.actor_role)} · ${safe(session.actor_name)}</strong><span>tenant ${safe(session.tenant_slug)} · sessão assinada · RBAC ativo</span>`;
    return session;
  } catch (error) {
    els.session.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
    return null;
  }
}

function renderPrescriptions(data, target = els.listOut) {
  const items = data.prescriptions || [];
  target.innerHTML = `
    <div class="item"><strong>Tenant ${safe(data.tenant_slug)}</strong><span>${safe(data.total)} treino(s) · ${safe(data.aprovados || 0)} aprovado(s) · ${safe(data.em_revisao || 0)} em revisão</span></div>
    ${items.map((item) => `
      <div class="item">
        <span class="badge">${safe(item.status)}</span>
        <strong>${safe(item.nome_treino)}</strong>
        <span>${safe(item.student_name)} · ${safe(item.objetivo)} · ${safe(item.dias_semana)}x/semana</span>
        <small>professor: ${safe(item.professor_name || "pendente")} · revisão: ${safe(item.review_status || "-")}</small>
        <button type="button" data-prescription-id="${safe(item.id)}">Ver detalhes</button>
      </div>`).join("") || '<div class="item">Nenhuma prescrição encontrada.</div>'}
  `;
}

async function loadStudents() {
  try {
    const data = await api(`/api/mvp-23/students?limit=80&status=ativo`);
    const students = data.students || [];
    els.studentSelect.innerHTML = students.map((student) => `<option value="${safe(student.id)}">${safe(student.nome_publico)} · ${safe(student.professor_nome || "sem professor")}</option>`).join("") || '<option value="">Cadastre aluno no MVP-23</option>';
  } catch (error) {
    els.studentSelect.innerHTML = `<option value="">${safe(error.message)}</option>`;
  }
}

async function loadPrescriptions() {
  try {
    const params = new URLSearchParams();
    if (els.search.value.trim()) params.set("search", els.search.value.trim());
    if (els.status.value) params.set("status", els.status.value);
    params.set("limit", "40");
    const data = await api(`/api/mvp-24/prescriptions?${params.toString()}`);
    renderPrescriptions(data);
  } catch (error) {
    els.listOut.innerHTML = `<div class="item"><strong>Não foi possível carregar</strong><span>${safe(error.message)}</span><a class="button secondary" href="/mvp-19.html">Entrar</a></div>`;
  }
}

async function loadDetail(id) {
  els.detail.textContent = "Carregando prescrição...";
  try {
    const data = await api(`/api/mvp-24/prescriptions/${encodeURIComponent(id)}?v=${Date.now()}`);
    const item = data.prescription;
    els.detail.innerHTML = `
      <strong>${safe(item.nome_treino)}</strong>
      <span>${safe(item.student_name)} · ${safe(item.status)} · ${safe(item.dias_semana)}x/semana</span>
      <span>Objetivo: ${safe(item.objetivo)} · Foco: ${safe(item.foco)}</span>
      <span>Orientações: ${safe(item.orientacoes || "-")}</span>
      <div>${(item.exercicios || []).map((exercise) => `<small>• ${safe(exercise.nome || exercise)}</small>`).join("")}</div>
      <button type="button" id="approve-prescription" data-review-id="${safe(item.id)}">Aprovar treino</button>
      <button type="button" class="secondary" id="adjust-prescription" data-review-id="${safe(item.id)}">Solicitar ajustes</button>
    `;
  } catch (error) {
    els.detail.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
}

async function review(id, status) {
  const data = await api(`/api/mvp-24/prescriptions/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ status, observacoes: status === "aprovado" ? "Aprovado pela interface operacional." : "Ajustes solicitados pela interface operacional." }) });
  els.detail.innerHTML = `<strong>Revisão salva</strong><span>${safe(data.prescription.nome_treino)} · ${safe(data.prescription.status)}</span>`;
  await loadPrescriptions();
}

els.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.createOut.textContent = "Criando prescrição...";
  try {
    const data = await api("/api/mvp-24/prescriptions", { method: "POST", body: JSON.stringify(formBody(els.form)) });
    els.createOut.innerHTML = `<strong>Prescrição criada</strong><span>${safe(data.prescription.nome_treino)} · ${safe(data.prescription.status)}</span>`;
    await loadPrescriptions();
  } catch (error) {
    els.createOut.innerHTML = `<strong>Erro</strong><span>${safe(error.message)}</span>`;
  }
});

els.listOut?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-prescription-id]");
  if (button) loadDetail(button.dataset.prescriptionId);
});
els.detail?.addEventListener("click", async (event) => {
  const approve = event.target.closest("#approve-prescription");
  const adjust = event.target.closest("#adjust-prescription");
  if (approve) await review(approve.dataset.reviewId, "aprovado");
  if (adjust) await review(adjust.dataset.reviewId, "ajustes_solicitados");
});
els.refresh?.addEventListener("click", loadPrescriptions);
els.search?.addEventListener("input", () => { clearTimeout(window.__mvp24Search); window.__mvp24Search = setTimeout(loadPrescriptions, 300); });
els.status?.addEventListener("change", loadPrescriptions);
els.loadMy?.addEventListener("click", async () => {
  try { renderPrescriptions(await api(`/api/mvp-24/my-workouts?limit=40`), els.myOut); }
  catch (error) { els.myOut.innerHTML = `<div class="item"><strong>Indisponível</strong><span>${safe(error.message)}</span></div>`; }
});

(async function init() {
  await refreshSession();
  await loadStudents();
  await loadPrescriptions();
})();
