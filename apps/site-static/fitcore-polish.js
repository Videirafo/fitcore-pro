(() => {
  const doc = document;
  const root = doc.documentElement;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function setActiveNav() {
    const path = location.pathname || "/";
    doc.querySelectorAll(".nav a, header nav a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;
      const clean = href.split("?")[0];
      const active = clean === "/" ? path === "/" : path === clean || path.startsWith(clean.replace(/\.html$/, ""));
      if (active) link.setAttribute("aria-current", "page");
    });
  }

  function revealOnScroll() {
    const targets = doc.querySelectorAll(".hero-product, .card, .panel, .modality-card, .status-strip > div, .section-card, .fc-kpi");
    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    targets.forEach((el, index) => {
      el.style.transitionDelay = `${Math.min(index * 18, 180)}ms`;
      observer.observe(el);
    });
  }

  function pointerGlow() {
    window.addEventListener("pointermove", (event) => {
      root.style.setProperty("--mx", `${clamp((event.clientX / window.innerWidth) * 100, 0, 100)}%`);
      root.style.setProperty("--my", `${clamp((event.clientY / window.innerHeight) * 100, 0, 100)}%`);
    }, { passive: true });
    doc.querySelectorAll(".hero-product, .card, .panel, form, .product-grid article, .status-strip > div, .modality-card, .section-card, .fc-kpi").forEach((el) => {
      el.addEventListener("pointermove", (event) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
        el.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
      }, { passive: true });
    });
  }

  function boot() {
    doc.body.dataset.fitcoreUi = "polished";
    setActiveNav();
    revealOnScroll();
    pointerGlow();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
