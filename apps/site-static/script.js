const marker = {
  product: "FitCore Pro",
  ecosystem: "MarcaIA",
  ui: "fitcore-owned-shell",
  engine: "wger-internal",
  media_policy: "textual_only",
};

window.__FITCORE_PUBLIC_SHELL__ = marker;
console.info("FitCore public shell loaded", marker);
