const $ = (selector) => document.querySelector(selector);

const form = $("#checkin-form");
const result = $("#checkin-result");
const historyBox = $("#checkin-history");
const statusBox = $("#mvp02-status");
const refreshButton = $("#refresh-history");
const rpeInput = $("#rpe-input");
const rpeOutput = $("#rpe-output");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  const labels = {
    planejado: "Planejado",
    em_execucao: "Em execução",
    concluido: "Concluído",
  };
  return labels[status] || status || "Não informado";
}

function payloadFromForm() {
  const data = new FormData(form);
  return {
    aluno_nome: data.get("aluno_nome"),
    treino_id: data.get("treino_id") || "treino-manual",
    dia_treino: data.get("dia_treino"),
    status: data.get("status"),
    papel: data.get("papel"),
    percepcao_esforco: Number(data.get("percepcao_esforco") || 5),
    duracao_minutos: Number(data.get("duracao_minutos") || 45),
    observacoes: data.get("observacoes"),
  };
}

function updateCounters(resumo = {}, total = 0) {
  const planejado = $("#status-planejado");
  const execucao = $("#status-execucao");
  const concluido = $("#status-concluido");

  if (planejado) planejado.textContent = resumo.planejado || 0;
  if (execucao) execucao.textContent = resumo.em_execucao || 0;
  if (concluido) concluido.textContent = resumo.concluido || 0;

  if (statusBox) {
    statusBox.innerHTML = `
      <strong>${Number(total || 0).toLocaleString("pt-BR")}</strong>
      <span>check-in(s) registrados nesta validação</span>
    `;
  }
}

function renderCheckin(record) {
  const audit = Array.isArray(record.auditoria_lgpd) ? record.auditoria_lgpd : [];
  return `
    <article class="mvp02-card">
      <div class="result-head">
        <div>
          <small>${escapeHtml(record.id)}</small>
          <h2>${escapeHtml(record.aluno?.nome)} · ${escapeHtml(record.treino?.dia)}</h2>
          <p>${escapeHtml(record.treino?.objetivo)} · ${escapeHtml(record.treino?.modalidade)}</p>
        </div>
        <span class="status-pill">${escapeHtml(statusLabel(record.status))}</span>
      </div>
      <div class="checkin-meta">
        <div><small>Papel</small><strong>${escapeHtml(record.criado_por)}</strong></div>
        <div><small>Duração</small><strong>${escapeHtml(record.duracao_minutos)} min</strong></div>
        <div><small>Esforço</small><strong>${escapeHtml(record.percepcao_esforco)}/10</strong></div>
        <div><small>Atualizado</small><strong>${new Date(record.atualizado_em).toLocaleString("pt-BR")}</strong></div>
      </div>
      <p>${escapeHtml(record.observacoes || "Sem observações adicionais.")}</p>
      <div class="audit-list">
        ${audit.slice(-3).map((event) => `<span>${escapeHtml(event.tipo)} · ${escapeHtml(event.papel)} · ${escapeHtml(statusLabel(event.status))}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderHistory(items = []) {
  if (!historyBox) return;

  if (!items.length) {
    historyBox.innerHTML = `<p>Nenhum check-in registrado ainda.</p>`;
    return;
  }

  historyBox.innerHTML = items.map((item) => `
    <article class="checkin-card" data-id="${escapeHtml(item.id)}">
      <small>${escapeHtml(item.id)}</small>
      <strong>${escapeHtml(item.aluno?.nome)} · ${escapeHtml(item.treino?.dia)}</strong>
      <span>${escapeHtml(item.treino?.objetivo)} · ${escapeHtml(item.duracao_minutos)} min · esforço ${escapeHtml(item.percepcao_esforco)}/10</span>
      <span>Status atual: <b>${escapeHtml(statusLabel(item.status))}</b></span>
      <div class="status-actions">
        <button type="button" data-status="planejado">Planejado</button>
        <button type="button" data-status="em_execucao">Em execução</button>
        <button type="button" data-status="concluido">Concluído</button>
      </div>
    </article>
  `).join("");
}

async function loadStatusAndHistory() {
  try {
    const res = await fetch("/api/mvp-02/checkins?limit=8", { cache: "no-store" });
    const data = await res.json();
    updateCounters(data.resumo || {}, data.total || 0);
    renderHistory(Array.isArray(data.items) ? data.items : []);
  } catch (error) {
    if (statusBox) statusBox.innerHTML = `<strong>--</strong><span>não foi possível carregar status</span>`;
    if (historyBox) historyBox.innerHTML = `<p>Não foi possível carregar histórico.</p>`;
    console.warn("Falha ao carregar MVP-02", error);
  }
}

async function updateStatus(id, status) {
  const res = await fetch(`/api/mvp-02/checkins/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, papel: "professor" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.mensagem || "Não foi possível atualizar status.");
  if (result) result.innerHTML = renderCheckin(data);
  await loadStatusAndHistory();
}

rpeInput?.addEventListener("input", () => {
  if (rpeOutput) rpeOutput.textContent = rpeInput.value;
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (result) {
    result.innerHTML = `<article class="mvp02-card"><h2>Salvando check-in...</h2><p>Registrando status, papel e auditoria mínima.</p></article>`;
  }

  try {
    const res = await fetch("/api/mvp-02/checkins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadFromForm()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensagem || "Não foi possível salvar check-in.");
    if (result) result.innerHTML = renderCheckin(data);
    await loadStatusAndHistory();
  } catch (error) {
    if (result) {
      result.innerHTML = `
        <article class="mvp02-card">
          <h2>Erro ao salvar check-in.</h2>
          <p>${escapeHtml(error.message)}</p>
        </article>
      `;
    }
  }
});

historyBox?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-status]");
  if (!button) return;
  const card = button.closest(".checkin-card");
  const id = card?.getAttribute("data-id");
  const status = button.getAttribute("data-status");
  if (!id || !status) return;

  try {
    await updateStatus(id, status);
  } catch (error) {
    if (result) {
      result.innerHTML = `
        <article class="mvp02-card">
          <h2>Erro ao atualizar status.</h2>
          <p>${escapeHtml(error.message)}</p>
        </article>
      `;
    }
  }
});

refreshButton?.addEventListener("click", loadStatusAndHistory);

loadStatusAndHistory();
