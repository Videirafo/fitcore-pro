const $ = (selector) => document.querySelector(selector);

const form = $("#mvp-form");
const result = $("#mvp-result");
const statusBox = $("#mvp-status");
const recentBox = $("#mvp-recent");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formPayload() {
  const data = new FormData(form);
  return {
    aluno_nome: data.get("aluno_nome"),
    modalidade: data.get("modalidade"),
    objetivo: data.get("objetivo"),
    nivel: data.get("nivel"),
    foco: data.get("foco"),
    dias_semana: Number(data.get("dias_semana") || 3),
    observacoes: data.get("observacoes"),
  };
}

function renderWorkout(record) {
  const blocos = record?.treino?.blocos || [];
  return `
    <article class="mvp-result-card">
      <div class="result-head">
        <div>
          <small>${escapeHtml(record.status)}</small>
          <h2>${escapeHtml(record.aluno?.nome)} · ${escapeHtml(record.treino?.objetivo_nome)}</h2>
          <p>${escapeHtml(record.treino?.dias_semana)} dia(s) por semana · ${escapeHtml(record.aluno?.nivel)} · ${escapeHtml(record.treino?.modalidade)}</p>
        </div>
        <span>Rascunho criado</span>
      </div>
      <div class="workout-days">
        ${blocos.map((bloco) => `
          <section class="workout-day">
            <small>${escapeHtml(bloco.dia)}</small>
            <h3>${escapeHtml(bloco.foco)}</h3>
            <p>${escapeHtml(bloco.aquecimento)}</p>
            <ul>
              ${(bloco.exercicios || []).slice(0, 4).map((exercicio) => `
                <li>
                  <strong>${escapeHtml(exercicio.nome)}</strong>
                  <span>${escapeHtml(exercicio.equipamento)} · ${escapeHtml(exercicio.musculo_principal)}</span>
                </li>
              `).join("")}
            </ul>
            <em>${escapeHtml(bloco.orientacao)}</em>
          </section>
        `).join("")}
      </div>
      <div class="next-steps">
        ${(record.proximos_passos || []).map((passo) => `<span>${escapeHtml(passo)}</span>`).join("")}
      </div>
    </article>
  `;
}

async function loadStatus() {
  try {
    const res = await fetch("/api/mvp-01/status", { cache: "no-store" });
    const data = await res.json();
    statusBox.innerHTML = `
      <strong>${data.registros || 0}</strong>
      <span>rascunho(s) de aluno + treino salvos nesta validação</span>
    `;
  } catch {
    statusBox.innerHTML = `<strong>--</strong><span>não foi possível ler o status do MVP</span>`;
  }
}

async function loadRecent() {
  try {
    const res = await fetch("/api/mvp-01/aluno-treino?limit=3", { cache: "no-store" });
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      recentBox.innerHTML = `<p>Nenhum rascunho criado ainda. Preencha o formulário para gerar o primeiro treino.</p>`;
      return;
    }
    recentBox.innerHTML = items.map((item) => `
      <div class="recent-item">
        <strong>${escapeHtml(item.aluno?.nome)}</strong>
        <span>${escapeHtml(item.treino?.objetivo_nome)} · ${escapeHtml(item.treino?.dias_semana)} dia(s)</span>
      </div>
    `).join("");
  } catch {
    recentBox.innerHTML = `<p>Não foi possível carregar os rascunhos recentes.</p>`;
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.innerHTML = `<article class="mvp-result-card"><h2>Gerando treino...</h2><p>Buscando exercícios e montando blocos iniciais.</p></article>`;

  try {
    const res = await fetch("/api/mvp-01/aluno-treino", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formPayload()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensagem || "Erro ao criar treino");
    result.innerHTML = renderWorkout(data);
    await loadStatus();
    await loadRecent();
  } catch (error) {
    result.innerHTML = `
      <article class="mvp-result-card error">
        <h2>Não foi possível criar o treino.</h2>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
  }
});

loadStatus();
loadRecent();
