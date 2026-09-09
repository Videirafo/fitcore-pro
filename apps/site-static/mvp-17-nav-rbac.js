// FITCORE PRO — MVP-17
// Substitui menus estáticos por navegação calculada pelo papel da sessão assinada.
(() => {
  const originalFetch = window.fetch.bind(window);
  const fetchWithCookie = (input, init = {}) => originalFetch(input, { credentials: "include", ...init });

  function ensureSystemStyles() {
    if (!document.querySelector('link[href*="fitcore-system.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/fitcore-system.css?v=fitcore-pro-ux-26";
      document.head.appendChild(link);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeFor(href) {
    const path = window.location.pathname || "/";
    if (href === "/") return path === "/";
    return path === href || path.startsWith(href.replace(/\.html$/, ""));
  }

  function targetNav() {
    return document.querySelector("header nav") || document.querySelector(".nav");
  }

  async function getNavigation() {
    const res = await fetchWithCookie(`/api/mvp-17/navigation?v=${Date.now()}`, { cache: "no-store" });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.mensagem || data.erro || `HTTP ${res.status}`);
    return data;
  }

  function render(nav, payload) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) {
      nav.innerHTML = `<span class="fitcore-role-menu-error">Sem itens de menu para este papel.</span>`;
      return;
    }
    nav.classList.add("fitcore-role-menu");
    nav.dataset.roleLabel = `menu · ${payload.actor_role || "papel"}`;
    nav.innerHTML = items.map((item) => {
      const active = activeFor(item.href) ? ' aria-current="page"' : "";
      return `<a href="${escapeHtml(item.href)}" data-fitcore-nav-id="${escapeHtml(item.id)}" data-fitcore-section="${escapeHtml(item.section)}"${active}>${escapeHtml(item.label)}</a>`;
    }).join("");
  }

  async function init() {
    ensureSystemStyles();
    const nav = targetNav();
    if (!nav) return;
    try {
      const payload = await getNavigation();
      render(nav, payload);
      window.FitCoreRoleNavigation = payload;
      document.dispatchEvent(new CustomEvent("fitcore:navigation-ready", { detail: payload }));
    } catch (error) {
      nav.innerHTML = `<span class="fitcore-role-menu-error">Menu aguardando login.</span>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init, { once: true });
})();
