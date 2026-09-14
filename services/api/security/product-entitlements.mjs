export const FITCORE_COMMERCIAL_PLANS = Object.freeze([
  "essencial",
  "profissional",
  "business",
  "enterprise",
]);

export function normalizeInternalProductMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "full") return "full";
  return FITCORE_COMMERCIAL_PLANS.includes(mode) ? mode : "full";
}

export function modeFromLoginSource(value) {
  const source = String(value || "");
  for (const prefix of ["platform_owner_bridge:", "platform_delegate_bridge:", "platform_owner_login:", "platform_delegate_login:"]) {
    if (source.startsWith(prefix)) return normalizeInternalProductMode(source.slice(prefix.length));
  }
  return "full";
}

export function resolveProductEntitlements({
  tenantPlan = "trial",
  platformInternalRole = null,
  internalVerified = false,
  internalMode = "full",
} = {}) {
  const role = ["platform_owner", "platform_delegate"].includes(platformInternalRole)
    ? platformInternalRole
    : null;
  if (!internalVerified || !role) {
    return {
      source: "tenant_plan", internal_testing: false, billing_exempt: false,
      bypass_commercial_checkout: false, effective_plan: tenantPlan || "trial",
      preview_mode: null, all_features: false, unlimited_commercial_quotas: false,
    };
  }
  const previewMode = normalizeInternalProductMode(internalMode);
  const full = previewMode === "full";
  return {
    source: role,
    internal_testing: true,
    billing_exempt: true,
    bypass_commercial_checkout: true,
    effective_plan: full ? "enterprise" : previewMode,
    preview_mode: previewMode,
    all_features: full || previewMode === "enterprise",
    unlimited_commercial_quotas: full,
  };
}
