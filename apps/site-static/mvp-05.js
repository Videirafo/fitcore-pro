const roleDefinitions = {
  gestor: {
    label: "Gestor",
    summary: "Visão da operação, alunos, treinos, check-ins e auditoria.",
    description: "Acompanha operação, alunos, treinos, check-ins e eventos mínimos de auditoria.",
    navigation: [
      { title: "Visão da operação", href: "/", detail: "Indicadores gerais, módulos e evolução do produto.", action: "Abrir início" },
      { title: "Aluno + treino", href: "/mvp-01.html", detail: "Criar aluno de teste e gerar rascunho de treino.", action: "Criar registro" },
      { title: "Check-ins", href: "/mvp-02.html", detail: "Acompanhar planejados, em execução e concluídos.", action: "Ver execuções" },
      { title: "Auditoria", href: "#auditoria", detail: "Consultar eventos mínimos gerados nos MVPs.", action: "Ver eventos" },
    ],
    permissions: [
      "Ver indicadores gerais da operação.",
      "Criar aluno e rascunho de treino.",
      "Ver revisões do professor.",
      "Ver check-ins de alunos.",
      "Consultar auditoria mínima consolidada.",
    ],
  },
  professor: {
    label: "Professor",
    summary: "Prescrição, revisão, troca de exercício e aprovação do treino.",
    description: "Revisa treinos criados, ajusta exercícios, aprova a prescrição e acompanha execução do aluno.",
    navigation: [
      { title: "Painel do professor", href: "/mvp-03.html", detail: "Revisar e aprovar treinos antes da liberação.", action: "Abrir revisão" },
      { title: "Banco de exercícios", href: "/#catalogo", detail: "Buscar movimentos por grupo, equipamento ou nome.", action: "Pesquisar" },
      { title: "Check-in do treino", href: "/mvp-02.html", detail: "Registrar ou acompanhar execução do aluno.", action: "Abrir check-in" },
      { title: "Aluno liberado", href: "/mvp-04.html", detail: "Conferir como o aluno vê o treino aprovado.", action: "Ver aluno" },
    ],
    permissions: [
      "Ver alunos com treino gerado.",
      "Abrir revisão de treino.",
      "Trocar exercício quando necessário.",
      "Aprovar treino para execução.",
      "Ver check-ins relacionados à prescrição.",
    ],
  },
  aluno: {
    label: "Aluno",
    summary: "Treino aprovado, execução, marcação de exercícios e histórico pessoal.",
    description: "Acessa apenas o treino aprovado pelo professor, inicia execução, marca exercícios feitos e conclui o treino.",
    navigation: [
      { title: "Meu treino", href: "/mvp-04.html", detail: "Abrir treino aprovado e executar exercícios.", action: "Abrir painel" },
      { title: "Histórico pessoal", href: "/mvp-04.html#historico", detail: "Ver últimas execuções registradas.", action: "Ver histórico" },
      { title: "Check-in", href: "/mvp-02.html", detail: "Registro mínimo de execução do treino.", action: "Ver check-in" },
    ],
    permissions: [
      "Ver somente treino aprovado.",
      "Iniciar treino liberado.",
      "Marcar exercícios como feitos.",
      "Concluir treino.",
      "Ver histórico pessoal simples.",
    ],
  },
};

const matrixRules = [
  { feature: "Criar aluno + treino", gestor: true, professor: false, aluno: false },
  { feature: "Revisar treino", gestor: true, professor: true, aluno: false },
  { feature: "Trocar exercício", gestor: true, professor: true, aluno: false },
  { feature: "Aprovar treino", gestor: true, professor: true, aluno: false },
  { feature: "Ver treino aprovado", gestor: true, professor: true, aluno: true },
  { feature: "Iniciar e concluir treino", gestor: false, professor: false, aluno: true },
  { feature: "Ver auditoria unificada", gestor: true, professor: true, aluno: false },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  role: "gestor",
  workouts: [],
  reviews: [],
  checkins: [],
  audit: [],
};

function safe(value, fallback = "não informado") {
  return String(value || fallback).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} retornou ${response.status}`);
  return response.json();
}

function collectAuditEvents() {
  const events = [];

  for (const review of state.reviews) {
    for (const event of review.auditoria_lgpd || []) {
      events.push({
        source: "Revisão do professor",
        papel: event.papel || review.professor?.papel || "professor",
        tipo: event.tipo || "evento_de_revisao",
        status: event.status || review.status,
        detalhe: event.detalhe || `${review.aluno?.nome || "Aluno"} · ${review.treino?.objetivo || "Treino"}`,
        criado_em: event.criado_em || review.atualizado_em || review.criado_em,
      });
    }
  }

  for (const checkin of state.checkins) {
    for (const event of checkin.auditoria_lgpd || []) {
      events.push({
        source: "Check-in do treino",
        papel: event.papel || checkin.criado_por || "aluno",
        tipo: event.tipo || "evento_de_checkin",
        status: event.status || checkin.status,
        detalhe: event.detalhe || `${checkin.aluno?.nome || "Aluno"} · ${checkin.treino?.dia || "Treino"}`,
        criado_em: event.criado_em || checkin.atualizado_em || checkin.criado_em,
      });
    }
  }

  for (const workout of state.workouts) {
    events.push({
      source: "Aluno + treino",
      papel: "gestor",
      tipo: "rascunho_criado",
      status: workout.status || "rascunho_validacao",
      detalhe: `${workout.aluno?.nome || "Aluno"} · ${workout.treino?.objetivo_nome || workout.treino?.objetivo || "Treino"}`,
      criado_em: workout.criado_em,
    });
  }

  return events
    .filter((event) => event.criado_em)
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}

function canRoleSeeAuditEvent(role, event) {
  if (role === "gestor") return true;
  if (role === "professor") return event.source !== "Aluno + treino" || event.papel !== "aluno";
  return event.source === "Check-in do treino" && event.papel === "aluno";
}

function renderRole() {
  const role = roleDefinitions[state.role];
  $("#current-role-label").textContent = role.label;
  $("#current-role-summary").textContent = role.summary;
  $("#role-title").textContent = role.label;
  $("#role-description").textContent = role.description;
  $("#role-pill").textContent = state.role;

  $("#role-navigation").innerHTML = role.navigation.map((item) => `
    <a class="nav-card" href="${safe(item.href)}">
      <strong>${safe(item.title)}</strong>
      <span>${safe(item.detail)}</span>
      <em>${safe(item.action)}</em>
    </a>
  `).join("");

  $("#permission-list").innerHTML = role.permissions.map((permission) => `
    <div class="permission-item">
      <b>✓</b>
      <span>${safe(permission)}</span>
    </div>
  `).join("");

  renderAudit();
}

function renderMetrics() {
  const approved = state.reviews.filter((review) => review.status === "aprovado").length;
  $("#metric-students").textContent = state.workouts.length;
  $("#metric-approved").textContent = approved;
  $("#metric-checkins").textContent = state.checkins.length;
  $("#metric-audit").textContent = state.audit.length;
}

function renderMatrix() {
  $("#permission-matrix").innerHTML = `
    <div class="matrix-row header">
      <span>Recurso</span>
      <span>Gestor</span>
      <span>Professor</span>
      <span>Aluno</span>
    </div>
    ${matrixRules.map((rule) => `
      <div class="matrix-row">
        <span>${safe(rule.feature)}</span>
        <span class="${rule.gestor ? "can" : "cannot"}">${rule.gestor ? "Pode" : "Não"}</span>
        <span class="${rule.professor ? "can" : "cannot"}">${rule.professor ? "Pode" : "Não"}</span>
        <span class="${rule.aluno ? "can" : "cannot"}">${rule.aluno ? "Pode" : "Não"}</span>
      </div>
    `).join("")}
  `;
}

function renderAudit() {
  const visibleEvents = state.audit.filter((event) => canRoleSeeAuditEvent(state.role, event)).slice(0, 20);
  const auditList = $("#audit-list");

  if (!visibleEvents.length) {
    auditList.innerHTML = `<article class="empty">Nenhum evento visível para este perfil nesta fase.</article>`;
    return;
  }

  auditList.innerHTML = visibleEvents.map((event) => `
    <article>
      <div class="audit-row">
        <span class="audit-source">${safe(event.source)}</span>
        <span class="permission-badge">${safe(event.papel)}</span>
      </div>
      <strong>${safe(event.tipo).replaceAll("_", " ")}</strong>
      <small>${safe(event.status)} · ${safe(event.criado_em)}</small>
      <p>${safe(event.detalhe || "Evento mínimo registrado.")}</p>
    </article>
  `).join("");
}

async function loadContext() {
  try {
    const [workouts, reviews, checkins] = await Promise.all([
      getJson("/api/mvp-01/aluno-treino?limit=50"),
      getJson("/api/mvp-03/professor/reviews?limit=50"),
      getJson("/api/mvp-02/checkins?limit=50"),
    ]);

    state.workouts = workouts.items || [];
    state.reviews = reviews.items || [];
    state.checkins = checkins.items || [];
    state.audit = collectAuditEvents();

    renderMetrics();
    renderAudit();
  } catch (error) {
    $("#audit-list").innerHTML = `
      <article class="empty">Não foi possível carregar o contexto do MVP-05: ${safe(error.message)}</article>
    `;
  }
}

for (const tab of $$("[data-role]")) {
  tab.addEventListener("click", () => {
    state.role = tab.getAttribute("data-role") || "gestor";
    for (const item of $$("[data-role]")) item.classList.toggle("active", item === tab);
    renderRole();
  });
}

$("#refresh-button")?.addEventListener("click", loadContext);

renderRole();
renderMatrix();
loadContext();
