const state = {
  exercises: [],
  status: new Map(),
  selected: null,
  licenseAudit: loadLicenseAudit(),
};

const els = {
  search: document.querySelector("#search"),
  areaFilter: document.querySelector("#area-filter"),
  mediaFilter: document.querySelector("#media-filter"),
  loadButton: document.querySelector("#load-button"),
  refreshMedia: document.querySelector("#refresh-media"),
  list: document.querySelector("#exercise-list"),
  total: document.querySelector("#summary-total"),
  ready: document.querySelector("#summary-ready"),
  withMedia: document.querySelector("#summary-with-media"),
  withoutMedia: document.querySelector("#summary-without-media"),
  license: document.querySelector("#summary-license"),
  selectedEmpty: document.querySelector("#selected-empty"),
  selectedContent: document.querySelector("#selected-content"),
  selectedName: document.querySelector("#selected-name"),
  selectedMeta: document.querySelector("#selected-meta"),
  selectedStatus: document.querySelector("#selected-status"),
  selectedPurpose: document.querySelector("#selected-purpose"),
  selectedMuscles: document.querySelector("#selected-muscles"),
  selectedCare: document.querySelector("#selected-care"),
  mediaPreview: document.querySelector("#media-preview"),
  windowsPath: document.querySelector("#windows-path"),
  targetSlug: document.querySelector("#target-slug"),
  powershellCommand: document.querySelector("#powershell-command"),
  serverCommand: document.querySelector("#server-command"),
  licenseSource: document.querySelector("#license-source"),
  licenseType: document.querySelector("#license-type"),
  licenseNote: document.querySelector("#license-note"),
  saveLicense: document.querySelector("#save-license"),
  licenseRecord: document.querySelector("#license-record"),
};

function loadLicenseAudit() {
  try {
    return JSON.parse(localStorage.getItem("fitcore:mvp06:license-audit") || "{}");
  } catch {
    return {};
  }
}

function saveLicenseAudit() {
  localStorage.setItem("fitcore:mvp06:license-audit", JSON.stringify(state.licenseAudit, null, 2));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mediaInfo(exercise) {
  const fallback = {
    gif: `/media/exercises/${exercise.slug}.gif`,
    objetivo: "demonstração técnica do exercício",
    serve_para: "treinar o grupo muscular indicado, reforçar técnica e apoiar a progressão do aluno.",
    como_executar: [
      "Observe a demonstração antes de iniciar.",
      "Execute com controle, amplitude segura e ritmo constante.",
      "Interrompa se houver dor, tontura ou perda de técnica."
    ],
    cuidado: "Ajustar carga, amplitude e variação conforme nível, restrições e orientação do professor."
  };

  if (typeof window.fitcoreExerciseMedia === "function") {
    return { ...fallback, ...window.fitcoreExerciseMedia(exercise), gif: window.fitcoreExerciseMedia(exercise).gif || fallback.gif };
  }

  return fallback;
}

async function gifExists(url) {
  try {
    const response = await fetch(`${url}?probe=${Date.now()}`, { method: "HEAD", cache: "no-store" });
    const type = response.headers.get("content-type") || "";
    return response.ok && type.toLowerCase().includes("image/gif");
  } catch {
    return false;
  }
}

async function validateMedia() {
  const checks = state.exercises.map(async (exercise) => {
    const info = mediaInfo(exercise);
    const exists = await gifExists(info.gif);
    state.status.set(exercise.slug, { exists, url: info.gif });
  });

  await Promise.all(checks);
  render();
}

function queryForArea(area) {
  const map = {
    pernas: "agachamento",
    peito: "peito",
    costas: "costas",
    "abdômen": "abdômen",
    braços: "bíceps",
    ombros: "ombros",
    funcional: "burpee",
  };
  return map[area] || els.search.value.trim() || "agachamento";
}

async function loadExercises() {
  const area = els.areaFilter.value;
  const search = area === "todos" ? (els.search.value.trim() || "agachamento") : queryForArea(area);
  els.list.innerHTML = `<div class="empty-state">Carregando catálogo e verificando GIFs publicados...</div>`;

  const response = await fetch(`/api/exercises?search=${encodeURIComponent(search)}&limit=80`, { cache: "no-store" });
  const data = await response.json();
  state.exercises = Array.isArray(data.items) ? data.items : [];
  state.selected = state.exercises[0] || null;
  await validateMedia();
}

function filteredExercises() {
  const area = els.areaFilter.value;
  const media = els.mediaFilter.value;

  return state.exercises.filter((exercise) => {
    const current = state.status.get(exercise.slug);
    const hasGif = Boolean(current?.exists);

    if (area !== "todos") {
      const values = [
        exercise.categoria,
        exercise.parte_do_corpo,
        exercise.foco,
        exercise.musculo_principal,
        ...(exercise.musculos_auxiliares || []),
      ].map((value) => String(value || "").toLowerCase());

      if (area === "funcional") {
        const text = `${exercise.nome} ${exercise.equipamento} ${values.join(" ")}`.toLowerCase();
        if (!/burpee|kettlebell|peso corporal|cardio|corda/.test(text)) return false;
      } else if (!values.some((value) => value.includes(area))) {
        return false;
      }
    }

    if (media === "com-gif" && !hasGif) return false;
    if (media === "sem-gif" && hasGif) return false;
    return true;
  });
}

function updateSummary(items) {
  const withMedia = state.exercises.filter((exercise) => state.status.get(exercise.slug)?.exists).length;
  const withoutMedia = Math.max(state.exercises.length - withMedia, 0);
  const licenseCount = Object.keys(state.licenseAudit).length;

  els.total.textContent = String(state.exercises.length);
  els.ready.textContent = String(withMedia);
  els.withMedia.textContent = String(withMedia);
  els.withoutMedia.textContent = String(withoutMedia);
  els.license.textContent = String(licenseCount);

  if (!state.selected && items.length) state.selected = items[0];
}

function renderList(items) {
  if (!items.length) {
    els.list.innerHTML = `<div class="empty-state">Nenhum exercício encontrado com os filtros atuais.</div>`;
    return;
  }

  els.list.innerHTML = items.map((exercise) => {
    const current = state.status.get(exercise.slug);
    const hasGif = Boolean(current?.exists);
    const selected = state.selected?.slug === exercise.slug;
    const audit = state.licenseAudit[exercise.slug];

    return `
      <button class="exercise-card ${selected ? "selected" : ""}" type="button" data-slug="${escapeHtml(exercise.slug)}">
        <div>
          <h3>${escapeHtml(exercise.nome)}</h3>
          <p>Código ${escapeHtml(exercise.source_id)} · ${escapeHtml(exercise.parte_do_corpo)} · ${escapeHtml(exercise.equipamento)} · foco: ${escapeHtml(exercise.foco)}</p>
          <div class="card-tags">
            <span>${escapeHtml(exercise.categoria)}</span>
            <span>${escapeHtml(exercise.musculo_principal)}</span>
            <span>${audit ? "licença registrada" : "licença pendente"}</span>
          </div>
        </div>
        <span class="media-state ${hasGif ? "ok" : "pending"}">${hasGif ? "Com GIF" : "Sem GIF"}</span>
      </button>`;
  }).join("");
}

function renderSelected() {
  const exercise = state.selected;
  if (!exercise) {
    els.selectedEmpty.hidden = false;
    els.selectedContent.hidden = true;
    els.licenseRecord.textContent = "Nenhum exercício selecionado.";
    return;
  }

  const info = mediaInfo(exercise);
  const current = state.status.get(exercise.slug);
  const hasGif = Boolean(current?.exists);
  const audit = state.licenseAudit[exercise.slug];

  els.selectedEmpty.hidden = true;
  els.selectedContent.hidden = false;
  els.selectedName.textContent = exercise.nome;
  els.selectedMeta.textContent = `Código ${exercise.source_id} · ${exercise.parte_do_corpo} · ${exercise.equipamento} · foco: ${exercise.foco}`;
  els.selectedStatus.textContent = hasGif ? "GIF publicado" : "GIF pendente";
  els.selectedStatus.className = `badge ${hasGif ? "ok" : "pending"}`;
  els.selectedPurpose.textContent = info.serve_para;
  els.selectedMuscles.textContent = `${exercise.musculo_principal || "não informado"} · auxiliares: ${(exercise.musculos_auxiliares || []).join(", ") || "não informado"}`;
  els.selectedCare.textContent = info.cuidado;

  els.mediaPreview.innerHTML = hasGif
    ? `<img src="${escapeHtml(info.gif)}?v=${Date.now()}" alt="Demonstração em GIF de ${escapeHtml(exercise.nome)}" />`
    : `<div class="media-placeholder">GIF ainda não publicado.<br />Arquivo esperado: <strong>${escapeHtml(exercise.slug)}.gif</strong></div>`;

  els.targetSlug.value = `${exercise.slug}.gif`;
  updateCommands();
  renderLicenseRecord(audit);
}

function renderLicenseRecord(audit) {
  if (!state.selected) {
    els.licenseRecord.textContent = "Nenhum exercício selecionado.";
    return;
  }

  if (!audit) {
    els.licenseRecord.innerHTML = `
      <strong>Sem auditoria registrada</strong>
      <span>Registre origem, licença/autorização e observação antes de usar o GIF comercialmente.</span>`;
    return;
  }

  els.licenseSource.value = audit.origem || "";
  els.licenseType.value = audit.licenca || "";
  els.licenseNote.value = audit.observacao || "";
  els.licenseRecord.innerHTML = `
    <strong>Auditoria local salva</strong>
    <span>Origem: ${escapeHtml(audit.origem || "não informado")}<br />Licença: ${escapeHtml(audit.licenca || "não informado")}<br />Atualizado em: ${escapeHtml(audit.atualizado_em || "não informado")}</span>`;
}

function updateCommands() {
  const exercise = state.selected;
  if (!exercise) {
    els.powershellCommand.textContent = "Selecione um exercício.";
    els.serverCommand.textContent = "Selecione um exercício.";
    return;
  }

  const localPath = els.windowsPath.value.trim() || "C:\\Users\\Usuario\\Downloads\\meu-gif.gif";
  const fileName = `${exercise.slug}.gif`;

  els.powershellCommand.textContent = `scp -i "$env:USERPROFILE\\.ssh\\marcaia_admin_ed25519" "${localPath}" marcaiaadmin@144.91.99.6:/tmp/${fileName}`;
  els.serverCommand.textContent = `cd /opt/fitcore-pro\nmkdir -p apps/site-static/media/exercises\nmv /tmp/${fileName} apps/site-static/media/exercises/${fileName}\nchmod 644 apps/site-static/media/exercises/${fileName}\nbash infra/scripts/switch-fitcore-to-own-ui.sh\ncurl -I "https://fitcore.marcaia.app/media/exercises/${fileName}?cb=$(date +%s)"`;
}

function render() {
  const items = filteredExercises();
  updateSummary(items);
  renderList(items);
  renderSelected();
}

async function copyFromElement(id) {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  const text = element.textContent || "";

  try {
    await navigator.clipboard.writeText(text);
    const button = document.querySelector(`[data-copy="${id}"]`);
    const original = button?.textContent;
    if (button) button.textContent = "Copiado";
    window.setTimeout(() => {
      if (button) button.textContent = original || "Copiar";
    }, 1300);
  } catch {
    window.prompt("Copie o comando:", text);
  }
}

els.loadButton.addEventListener("click", loadExercises);
els.refreshMedia.addEventListener("click", validateMedia);
els.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadExercises();
});
els.areaFilter.addEventListener("change", loadExercises);
els.mediaFilter.addEventListener("change", render);
els.windowsPath.addEventListener("input", updateCommands);

for (const button of document.querySelectorAll("[data-query]")) {
  button.addEventListener("click", () => {
    els.search.value = button.dataset.query || "agachamento";
    els.areaFilter.value = "todos";
    loadExercises();
  });
}

els.list.addEventListener("click", (event) => {
  const card = event.target.closest("[data-slug]");
  if (!card) return;
  state.selected = state.exercises.find((exercise) => exercise.slug === card.dataset.slug) || null;
  render();
});

document.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (!copyButton) return;
  copyFromElement(copyButton.dataset.copy);
});

els.saveLicense.addEventListener("click", () => {
  if (!state.selected) return;
  const record = {
    slug: state.selected.slug,
    exercicio: state.selected.nome,
    origem: els.licenseSource.value.trim(),
    licenca: els.licenseType.value.trim(),
    observacao: els.licenseNote.value.trim(),
    atualizado_em: new Date().toISOString(),
    politica: "usar somente GIF autoral ou licenciado",
  };
  state.licenseAudit[state.selected.slug] = record;
  saveLicenseAudit();
  render();
});

loadExercises().catch((error) => {
  els.list.innerHTML = `<div class="empty-state">Não foi possível carregar a biblioteca visual: ${escapeHtml(error.message)}</div>`;
});
