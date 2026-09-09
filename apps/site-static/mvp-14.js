const state = { role: "gestor" };

const roleEl = document.querySelector("#role");
const tenantEl = document.querySelector("#tenant");
const modeEl = document.querySelector("#mode");
const outputEl = document.querySelector("#output");
const capabilitiesEl = document.querySelector("#capabilities");
const matrixEl = document.querySelector("#matrix");
const buttons = Array.from(document.querySelectorAll("button[data-role]"));

function setText(el, value) {
  if (el) el.textContent = value;
}

function pill(text) {
  return `<span class="pill">${String(text).replace(/[<>]/g, "")}</span>`;
}

function render(data) {
  setText(roleEl, data.actor_role || "--");
  setText(tenantEl, data.tenant_slug || "--");
  setText(modeEl, data.enforcement || "--");
  setText(outputEl, JSON.stringify(data, null, 2));

  capabilitiesEl.innerHTML = (data.capabilities || []).map(pill).join("") || pill("sem permissões");
  matrixEl.innerHTML = Object.entries(data.matrix || {}).map(([role, capabilities]) => `
    <div class="matrix-row">
      <strong>${role}</strong>
      <span>${capabilities.join(" · ")}</span>
    </div>
  `).join("");

  buttons.forEach((button) => button.classList.toggle("active", button.dataset.role === data.actor_role));
}

async function loadRole(role) {
  state.role = role;
  const response = await fetch(`/api/mvp-14/access-context?v=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "x-fitcore-role": role,
      "x-fitcore-tenant": "demo",
      "x-fitcore-actor": `painel-${role}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  render(await response.json());
}

buttons.forEach((button) => {
  button.addEventListener("click", () => loadRole(button.dataset.role).catch((error) => {
    setText(outputEl, JSON.stringify({ ok: false, erro: error.message }, null, 2));
  }));
});

loadRole(state.role).catch((error) => {
  setText(roleEl, "pendente");
  setText(tenantEl, "demo");
  setText(modeEl, "soft");
  setText(outputEl, JSON.stringify({
    ok: false,
    mensagem: error.message,
    acao: "rodar infra/scripts/apply-mvp-14-access-control.sh e reiniciar a API",
  }, null, 2));
});
