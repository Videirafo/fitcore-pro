const $ = (selector) => document.querySelector(selector);

const statusEl = $("#mvp03-status");
const studentsEl = $("#summary-students");
const reviewEl = $("#summary-review");
const approvedEl = $("#summary-approved");
const selectEl = $("#student-select");
const formEl = $("#review-form");
const resultEl = $("#review-result");
const historyEl = $("#review-history");
const refreshEl = $("#refresh-history");

let currentReviewId = null;

const replacementAliases = new Map([
  ["remada", "row"],
  ["remadas", "row"],
  ["costas", "back"],
  ["dorsal", "back"],
  ["dorsais", "back"],
  ["puxada", "pulldown"],
  ["puxada costas", "pulldown back"],
  ["peito", "chest"],
  ["supino", "bench press"],
  ["crucifixo", "fly"],
  ["agachamento", "squat"],
  ["perna", "legs"],
  ["pernas", "legs"],
  ["gluteo", "glutes"],
  ["glúteo", "glutes"],
  ["gluteos", "glutes"],
  ["glúteos", "glutes"],
  ["ombro", "shoulders"],
  ["ombros", "shoulders"],
  ["abdominal", "abs"],
  ["abdomen", "abs"],
  ["abdômen", "abs"],
  ["halter", "dumbbell"],
  ["halteres", "dumbbell"],
  ["barra", "barbell"],
  ["cabo", "cable"],
  ["maquina", "machine"],
  ["máquina", "machine"],
  ["peso corporal", "body weight"],
  ["funcional", "body weight"],
  ["burpee", "burpee"],
  ["kettlebell", "kettlebell"],
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeReplacementSearch(value) {
  const raw = String(value || "").trim();
  const loose = normalizeLoose(raw);

  if (!loose) return "squat";
  if (replacementAliases.has(raw.toLowerCase())) return replacementAliases.get(raw.toLowerCase());
  if (replacementAliases.has(loose)) return replacementAliases.get(loose);

  const parts = loose.split(" ").map((part) => replacementAliases.get(part) || part);
  return parts.join(" ");
}

function showInlineMessage(title, message) {
  if (!resultEl) return;
  const previous = resultEl.querySelector(".inline-message");
  previous?.remove();

  const box = document.createElement("div");
  box.className = "inline-message";
  box.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(message)}</span>
  `;
  resultEl.prepend(box);
}

function statusLabel(status) {
  const map = {
    em_revisao: "em revisão",
    ajustes_solicitados: "ajustes solicitados",
    aprovado: "aprovado",
  };
  return map[status] || status || "não informado";
}

function mediaForExercise(exercicio) {
  if (typeof window.fitcoreExerciseMedia === "function") {
    return window.fitcoreExerciseMedia(exercicio);
  }

  return {
    objetivo: "execução técnica do movimento",
    serve_para: "treinar o grupo muscular indicado, reforçar técnica e apoiar a progressão do aluno.",
    como_executar: ["Executar com controle.", "Preservar postura e amplitude segura."],
    cuidado: "Ajustar carga conforme nível e restrições do aluno.",
  };
}

function exerciseLearningHtml(exercicio) {
  const media = mediaForExercise(exercicio);
  const gif = media?.gif || "";
  const nome = exercicio?.nome || "Exercício";
  const musculo = exercicio?.musculo_principal || exercicio?.foco || "não informado";

  return `
    <div class="exercise-learning">
      <div class="exercise-gif ${gif ? "" : "media-missing"}">
        ${gif ? `<img src="${escapeHtml(gif)}" alt="GIF demonstrando ${escapeHtml(nome)}" loading="lazy" onerror="this.closest('.exercise-gif').classList.add('media-missing'); this.remove();" />` : ""}
        <span>GIF pendente</span>
      </div>
      <div class="exercise-purpose-card">
        <b>Para que serve</b>
        <p>${escapeHtml(media.serve_para)}</p>
        <small>Principal: ${escapeHtml(musculo)}</small>
      </div>
    </div>
  `;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.mensagem || payload.erro || `Erro ${response.status}`);
  }

  return payload;
}

function renderContext(payload) {
  const alunos = Array.isArray(payload.alunos) ? payload.alunos : [];
  const resumo = payload.resumo || {};
  const revisoes = resumo.revisoes_por_status || {};

  if (studentsEl) studentsEl.textContent = resumo.alunos ?? alunos.length ?? 0;
  if (reviewEl) reviewEl.textContent = revisoes.em_revisao ?? 0;
  if (approvedEl) approvedEl.textContent = revisoes.aprovado ?? 0;

  if (statusEl) {
    statusEl.innerHTML = `
      <strong>${resumo.revisoes ?? 0}</strong>
      <span>revisões registradas</span>
    `;
  }

  if (selectEl) {
    if (!alunos.length) {
      selectEl.innerHTML = `<option value="">Nenhum aluno encontrado. Crie um treino no MVP-01.</option>`;
    } else {
      selectEl.innerHTML = alunos.map((aluno) => `
        <option value="${escapeHtml(aluno.treino_id)}">
          ${escapeHtml(aluno.nome)} · ${escapeHtml(aluno.objetivo)} · ${escapeHtml(aluno.modalidade)}
        </option>
      `).join("");
    }
  }
}

function renderReview(record) {
  currentReviewId = record.id;
  const blocos = record.treino?.blocos || [];
  const audit = record.auditoria_lgpd || [];

  resultEl.innerHTML = `
    <div class="result-head">
      <div>
        <small>${escapeHtml(record.aluno?.nome)} · ${escapeHtml(record.treino?.objetivo)}</small>
        <h2>Revisão do professor</h2>
        <p>${escapeHtml(record.revisao?.observacoes || "Sem observações.")}</p>
      </div>
      <span class="status-pill">${escapeHtml(statusLabel(record.status))}</span>
    </div>

    <div class="workout-days">
      ${blocos.map((bloco, diaIndex) => `
        <article class="workout-review-card">
          <small>${escapeHtml(bloco.dia || `Dia ${diaIndex + 1}`)}</small>
          <h3>${escapeHtml(bloco.foco || "Treino")}</h3>
          <p>${escapeHtml(bloco.aquecimento || "")}</p>
          <div class="exercise-list">
            ${(bloco.exercicios || []).map((exercicio, exercicioIndex) => `
              <div class="exercise-row exercise-row-learning">
                <div class="exercise-review-body">
                  <div class="exercise-title-block">
                    <strong>${escapeHtml(exercicio.nome)}</strong>
                    <span>${escapeHtml(exercicio.parte_do_corpo)} · ${escapeHtml(exercicio.equipamento)} · foco: ${escapeHtml(exercicio.foco)}</span>
                  </div>
                  ${exerciseLearningHtml(exercicio)}
                </div>
                <div class="exercise-tools">
                  <input data-search="${diaIndex}-${exercicioIndex}" placeholder="Ex: remada, puxada, peito, agachamento" />
                  <button type="button" data-replace="${diaIndex}-${exercicioIndex}">Trocar</button>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>

    <button class="approve-button" type="button" id="approve-review">Aprovar treino</button>

    <div class="mvp03-card" style="margin-top: 16px;">
      <span>Auditoria da revisão</span>
      <h2>Eventos registrados</h2>
      <div class="audit-list">
        ${audit.map((event) => `
          <span>${escapeHtml(event.criado_em)} · ${escapeHtml(event.tipo)} · ${escapeHtml(event.papel)} · ${escapeHtml(statusLabel(event.status))}</span>
        `).join("")}
      </div>
    </div>
  `;

  for (const button of resultEl.querySelectorAll("[data-replace]")) {
    button.addEventListener("click", async () => {
      const [diaIndex, exercicioIndex] = button.getAttribute("data-replace").split("-").map(Number);
      const input = resultEl.querySelector(`[data-search="${diaIndex}-${exercicioIndex}"]`);
      const buscaDigitada = input?.value?.trim() || "agachamento";
      const busca = normalizeReplacementSearch(buscaDigitada);
      button.disabled = true;
      button.textContent = "Trocando...";
      try {
        const updated = await api(`/api/mvp-03/professor/reviews/${currentReviewId}/exercises`, {
          method: "PATCH",
          body: JSON.stringify({ dia_index: diaIndex, exercicio_index: exercicioIndex, busca, papel: "professor" }),
        });
        renderReview(updated);
        showInlineMessage("Exercício alterado", `Busca usada: ${buscaDigitada} → ${busca}.`);
        loadHistory();
      } catch (error) {
        showInlineMessage(
          "Não foi possível trocar o exercício",
          "Tente termos como remada, puxada, costas, peito, supino, agachamento, halter, barra, cabo ou abdominal."
        );
        button.disabled = false;
        button.textContent = "Trocar";
      }
    });
  }

  $("#approve-review")?.addEventListener("click", async () => {
    try {
      const updated = await api(`/api/mvp-03/professor/reviews/${currentReviewId}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ papel: "professor", observacoes: "Treino aprovado para execução do aluno." }),
      });
      renderReview(updated);
      loadContext();
      loadHistory();
    } catch (error) {
      showInlineMessage("Não foi possível aprovar o treino", error.message);
    }
  });
}

function renderHistory(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!historyEl) return;

  if (!items.length) {
    historyEl.innerHTML = `<p>Nenhuma revisão salva ainda.</p>`;
    return;
  }

  historyEl.innerHTML = items.map((item) => `
    <article class="review-card">
      <small>${escapeHtml(statusLabel(item.status))}</small>
      <strong>${escapeHtml(item.aluno?.nome)} · ${escapeHtml(item.treino?.objetivo)}</strong>
      <span>${escapeHtml(item.professor?.nome)} · ${escapeHtml(item.atualizado_em)}</span>
      <span>${(item.revisao?.ajustes || []).length} ajuste(s) registrados</span>
    </article>
  `).join("");
}

async function loadContext() {
  try {
    const payload = await api("/api/mvp-03/professor/contexto");
    renderContext(payload);
  } catch (error) {
    if (statusEl) {
      statusEl.innerHTML = `<strong>--</strong><span>${escapeHtml(error.message)}</span>`;
    }
  }
}

async function loadHistory() {
  try {
    const payload = await api("/api/mvp-03/professor/reviews?limit=10");
    renderHistory(payload);
  } catch (error) {
    if (historyEl) historyEl.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

formEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(formEl).entries());
  const button = formEl.querySelector("button");
  button.disabled = true;
  button.textContent = "Abrindo revisão...";

  try {
    const record = await api("/api/mvp-03/professor/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
    renderReview(record);
    await loadContext();
    await loadHistory();
  } catch (error) {
    resultEl.innerHTML = `
      <div class="mvp03-card">
        <h2>Não foi possível abrir a revisão.</h2>
        <p>${escapeHtml(error.message)}</p>
        <p>Crie primeiro um aluno e treino no MVP-01.</p>
      </div>
    `;
  } finally {
    button.disabled = false;
    button.textContent = "Abrir revisão do treino";
  }
});

refreshEl?.addEventListener("click", loadHistory);

loadContext();
loadHistory();
