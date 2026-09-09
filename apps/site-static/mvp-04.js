const $ = (selector) => document.querySelector(selector);

const statusEl = $("#mvp04-status");
const approvedEl = $("#summary-approved");
const availableEl = $("#summary-available");
const runningEl = $("#summary-running");
const doneEl = $("#summary-done");
const selectEl = $("#approved-review-select");
const formEl = $("#student-panel-form");
const studentNameEl = $("#student-name");
const effortEl = $("#effort-score");
const notesEl = $("#student-notes");
const workoutEl = $("#student-workout");
const historyEl = $("#student-history");
const refreshEl = $("#refresh-history");

let approvedReviews = [];
let checkins = [];
let activeReview = null;
let activeCheckin = null;
let doneExercises = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(value) {
  const map = {
    planejado: "planejado",
    em_execucao: "em execução",
    concluido: "concluído",
    em_revisao: "em revisão",
    ajustes_solicitados: "ajustes solicitados",
    aprovado: "aprovado",
  };
  return map[value] || value || "não informado";
}

function safeDate(value) {
  if (!value) return "data não informada";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
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
    throw new Error(payload.mensagem || payload.erro || `Erro HTTP ${response.status}`);
  }

  return payload;
}

function setMessage(title, message) {
  if (!workoutEl) return;
  workoutEl.innerHTML = `
    <div class="inline-message">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function selectedReview() {
  const id = selectEl?.value || "";
  return approvedReviews.find((item) => item.id === id) || null;
}

function countWorkoutExercises(review) {
  return (review?.treino?.blocos || []).reduce((total, bloco) => total + (bloco.exercicios || []).length, 0);
}

function updateSummary() {
  const running = checkins.filter((item) => item.status === "em_execucao").length;
  const done = checkins.filter((item) => item.status === "concluido").length;

  if (approvedEl) approvedEl.textContent = String(approvedReviews.length);
  if (availableEl) availableEl.textContent = String(approvedReviews.length);
  if (runningEl) runningEl.textContent = String(running);
  if (doneEl) doneEl.textContent = String(done);
  if (statusEl) statusEl.textContent = approvedReviews.length ? "aluno pronto" : "aguardando aprovação";
}

function renderSelect() {
  if (!selectEl) return;

  if (!approvedReviews.length) {
    selectEl.innerHTML = `<option value="">Nenhum treino aprovado ainda</option>`;
    setMessage(
      "Nenhum treino liberado para o aluno",
      "Aprove um treino no MVP-03 antes de abrir o painel do aluno. O aluno só deve ver treinos aprovados pelo professor."
    );
    return;
  }

  selectEl.innerHTML = approvedReviews.map((review) => {
    const aluno = review.aluno?.nome || "Aluno";
    const objetivo = review.treino?.objetivo || review.treino?.objetivo_nome || "treino";
    const modalidade = review.treino?.modalidade || "modalidade";
    return `<option value="${escapeHtml(review.id)}">${escapeHtml(aluno)} · ${escapeHtml(objetivo)} · ${escapeHtml(modalidade)}</option>`;
  }).join("");

  const first = approvedReviews[0];
  if (studentNameEl && first?.aluno?.nome) studentNameEl.value = first.aluno.nome;
}

function renderHistory() {
  if (!historyEl) return;

  if (!checkins.length) {
    historyEl.textContent = "Nenhuma execução registrada para o aluno nesta fase.";
    return;
  }

  historyEl.innerHTML = checkins
    .slice()
    .reverse()
    .slice(0, 8)
    .map((item) => `
      <article class="history-item">
        <strong>${escapeHtml(item.aluno_nome || "Aluno")} · ${escapeHtml(item.dia_treino || "Treino")}</strong>
        <span>${escapeHtml(statusLabel(item.status))} · ${escapeHtml(item.duracao_minutos || "--")} min · esforço ${escapeHtml(item.percepcao_esforco || "--")}/10</span><br />
        <span>${escapeHtml(safeDate(item.atualizado_em || item.criado_em))}</span>
      </article>
    `).join("");
}

async function loadData() {
  try {
    const [context, checkinPayload] = await Promise.all([
      api("/api/mvp-03/professor/reviews?limit=50"),
      api("/api/mvp-02/checkins?limit=50"),
    ]);

    approvedReviews = (context.items || []).filter((item) => item.status === "aprovado");
    checkins = checkinPayload.items || [];

    renderSelect();
    renderHistory();
    updateSummary();
  } catch (error) {
    if (statusEl) statusEl.textContent = "erro";
    setMessage("Não foi possível carregar o painel", error.message);
  }
}

function renderWorkout(review) {
  if (!workoutEl) return;

  activeReview = review;
  activeCheckin = null;
  doneExercises = new Set();

  const aluno = review.aluno?.nome || studentNameEl?.value || "Aluno";
  const objetivo = review.treino?.objetivo || review.treino?.objetivo_nome || "treino";
  const total = countWorkoutExercises(review);
  const blocos = review.treino?.blocos || [];

  workoutEl.innerHTML = `
    <div class="workout-head">
      <div>
        <p class="eyebrow">Treino aprovado</p>
        <h2>${escapeHtml(aluno)} · ${escapeHtml(objetivo)}</h2>
        <p>Marque os exercícios conforme forem executados. Ao concluir, o histórico pessoal será atualizado.</p>
      </div>
      <span class="status-pill" id="execution-status">planejado</span>
    </div>

    ${blocos.map((bloco, diaIndex) => `
      <article class="day-card">
        <span class="day-pill">${escapeHtml(bloco.dia || `Dia ${diaIndex + 1}`)}</span>
        <h3>${escapeHtml(bloco.foco || "Treino do dia")}</h3>
        <p>${escapeHtml(bloco.aquecimento || "Aquecimento conforme orientação do professor.")}</p>
        <div class="exercise-list">
          ${(bloco.exercicios || []).map((exercicio, exercicioIndex) => {
            const key = `${diaIndex}-${exercicioIndex}`;
            return `
              <label class="exercise-row" data-exercise-row="${key}">
                <input type="checkbox" data-exercise-check="${key}" />
                <span>
                  <strong>${escapeHtml(exercicio.nome || "Exercício")}</strong>
                  <span>${escapeHtml(exercicio.parte_do_corpo || "")}${exercicio.equipamento ? " · " : ""}${escapeHtml(exercicio.equipamento || "")} · foco: ${escapeHtml(exercicio.foco || "não informado")}</span>
                </span>
              </label>
            `;
          }).join("")}
        </div>
      </article>
    `).join("")}

    <div class="student-actions">
      <button type="button" id="start-workout">Iniciar treino</button>
      <button type="button" class="secondary-button" id="finish-workout" disabled>Concluir treino</button>
    </div>
    <p class="danger-note" id="progress-note">0 de ${total} exercício(s) marcados.</p>
  `;

  for (const checkbox of workoutEl.querySelectorAll("[data-exercise-check]")) {
    checkbox.addEventListener("change", () => {
      const key = checkbox.getAttribute("data-exercise-check");
      const row = workoutEl.querySelector(`[data-exercise-row="${key}"]`);
      if (checkbox.checked) {
        doneExercises.add(key);
        row?.classList.add("is-done");
      } else {
        doneExercises.delete(key);
        row?.classList.remove("is-done");
      }
      updateProgress();
    });
  }

  $("#start-workout")?.addEventListener("click", startWorkout);
  $("#finish-workout")?.addEventListener("click", finishWorkout);
  updateProgress();
}

function updateProgress() {
  const total = countWorkoutExercises(activeReview);
  const note = $("#progress-note");
  const finish = $("#finish-workout");
  if (note) note.textContent = `${doneExercises.size} de ${total} exercício(s) marcados.`;
  if (finish) finish.disabled = !activeCheckin || doneExercises.size === 0;
}

async function startWorkout() {
  if (!activeReview) return;
  const button = $("#start-workout");
  button.disabled = true;
  button.textContent = "Iniciando...";

  try {
    const payload = await api("/api/mvp-02/checkins", {
      method: "POST",
      body: JSON.stringify({
        aluno_nome: studentNameEl?.value || activeReview.aluno?.nome || "Aluno",
        treino_id: activeReview.treino_id || activeReview.id,
        dia_treino: "Treino aprovado",
        status: "em_execucao",
        papel: "aluno",
        percepcao_esforco: Number(effortEl?.value || 5),
        duracao_minutos: 0,
        observacoes: notesEl?.value || "Execução iniciada pelo painel do aluno.",
      }),
    });

    activeCheckin = payload;
    const status = $("#execution-status");
    if (status) status.textContent = "em execução";
    button.textContent = "Treino iniciado";
    checkins.push(payload);
    updateSummary();
    renderHistory();
    updateProgress();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Iniciar treino";
    setMessage("Não foi possível iniciar o treino", error.message);
  }
}

async function finishWorkout() {
  if (!activeCheckin) return;
  const button = $("#finish-workout");
  button.disabled = true;
  button.textContent = "Concluindo...";

  try {
    const updated = await api(`/api/mvp-02/checkins/${activeCheckin.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "concluido", papel: "aluno" }),
    });

    activeCheckin = updated;
    const status = $("#execution-status");
    if (status) status.textContent = "concluído";
    button.textContent = "Treino concluído";

    checkins = checkins.map((item) => item.id === updated.id ? updated : item);
    updateSummary();
    renderHistory();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Concluir treino";
    setMessage("Não foi possível concluir o treino", error.message);
  }
}

formEl?.addEventListener("submit", (event) => {
  event.preventDefault();
  const review = selectedReview();
  if (!review) {
    setMessage("Treino ainda não aprovado", "Volte ao MVP-03, aprove um treino e atualize esta página.");
    return;
  }
  renderWorkout(review);
});

refreshEl?.addEventListener("click", loadData);

loadData();
