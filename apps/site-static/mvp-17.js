const els = {
  role: document.querySelector("#nav-role"),
  source: document.querySelector("#nav-source"),
  allowed: document.querySelector("#allowed-list"),
  hidden: document.querySelector("#hidden-list"),
  policy: document.querySelector("#policy-output"),
};

function safe(value, fallback = "não informado") {
  return String(value || fallback).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function getJson(path) {
  const response = await fetch(`${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store", credentials: "include" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.mensagem || data.erro || `HTTP ${response.status}`);
  return data;
}

function renderList(target, items, empty, hidden = false) {
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<div class="muted-box">${empty}</div>`;
    return;
  }
  target.innerHTML = items.map((item) => `
    <div class="item">
      <div><strong>${safe(item.label)}</strong><span>${safe(item.href)} · ${safe(item.section || item.reason)}</span></div>
      <span class="pill">${hidden ? "oculto" : "visível"}</span>
    </div>
  `).join("");
}

async function load() {
  try {
    const nav = await getJson("/api/mvp-17/navigation");
    els.role.textContent = nav.actor_role || "--";
    els.source.textContent = nav.role_from_db ? "papel vindo do banco" : nav.source;
    renderList(els.allowed, nav.items || [], "Nenhum item permitido.");
    renderList(els.hidden, nav.hidden_items || [], "Nenhum item oculto para este papel.", true);
    els.policy.textContent = JSON.stringify({
      session_signed: nav.session_signed,
      role_from_db: nav.role_from_db,
      headers_trusted: nav.headers_trusted,
      policy: nav.policy,
    }, null, 2);
  } catch (error) {
    els.role.textContent = "Login necessário";
    els.source.textContent = "sessão assinada obrigatória";
    els.policy.textContent = JSON.stringify({ ok: false, erro: error.message }, null, 2);
  }
}

window.addEventListener("fitcore:navigation-ready", load, { once: true });
document.addEventListener("DOMContentLoaded", () => setTimeout(load, 300), { once: true });
