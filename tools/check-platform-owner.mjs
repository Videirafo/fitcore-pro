import { readFileSync } from "node:fs";
import { resolveProductEntitlements } from "../services/api/security/product-entitlements.mjs";

const files = {
  migration: readFileSync("infra/sql/021-platform-owner.sql", "utf8"),
  delegateMigration: readFileSync("infra/sql/022-platform-internal-delegates.sql", "utf8"),
  manager: readFileSync("services/api/security/platform-owner.mjs", "utf8"),
  server: readFileSync("services/api/server.mjs", "utf8"),
  client: readFileSync("apps/site/components/FitCoreRouteClient.tsx", "utf8"),
  console: readFileSync("apps/site/components/PlatformOwnerConsole.tsx", "utf8"),
  accept: readFileSync("apps/site/components/PlatformDelegateAccept.tsx", "utf8"),
  bootstrap: readFileSync("infra/scripts/bootstrap-platform-owner.sh", "utf8"),
  rootMigration: readFileSync("infra/scripts/migrate-platform-root-email.sh", "utf8"),
  envExample: readFileSync(".env.example", "utf8"),
  rootDocs: readFileSync("docs/ROOT_ADMIN.md", "utf8"),
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(files.migration.includes("fitcore_platform_admins"), "platform admin table missing");
check(files.delegateMigration.includes("platform_delegate"), "platform delegate role missing");
check(files.delegateMigration.includes("fitcore_platform_admin_invites"), "internal invite table missing");
check(files.delegateMigration.includes("uq_fitcore_single_platform_owner"), "single root owner guard missing");
check(files.manager.includes("createInternalInvite"), "delegate invite creation missing");
check(files.manager.includes("acceptInternalInvite"), "delegate invite acceptance missing");
check(files.manager.includes("requireRootOwner"), "root-only invitation guard missing");
check(files.server.includes('/api/platform-owner/invites'), "internal invite endpoints missing");
check(files.client.includes('result?.platform_internal ? "/admin"'), "internal access redirect missing");
for (const label of ["Acesso Total", "Essencial", "Profissional", "Business", "Enterprise"]) {
  check(files.console.includes(label), `control plane missing ${label}`);
}
check(files.bootstrap.includes('FITCORE_PLATFORM_ROOT_EMAIL'), "root email operator guard missing");
check(files.bootstrap.includes('somente o e-mail raiz configurado'), "root-only bootstrap guard missing");
check(files.envExample.includes('FITCORE_PLATFORM_ROOT_EMAIL=mavrk2026@outlook.com'), "canonical root email missing from env contract");
check(files.envExample.includes('FITCORE_PLATFORM_OWNER_EMAIL=mavrk2026@outlook.com'), "owner email must match canonical root email");
check(files.rootDocs.includes('mavrk2026@outlook.com'), "root admin documentation missing");
check(files.rootDocs.includes('Acesso Total'), "root admin full access documentation missing");
check(files.rootDocs.includes('convites temporários'), "root admin invitation right documentation missing");

const full = resolveProductEntitlements({
  tenantPlan: "trial", platformInternalRole: "platform_owner", internalVerified: true, internalMode: "full",
});
check(full.billing_exempt === true, "root full access must be billing exempt");
check(full.bypass_commercial_checkout === true, "root full access must bypass checkout");
check(full.effective_plan === "enterprise" && full.all_features === true, "full mode must be enterprise-equivalent");

const delegate = resolveProductEntitlements({
  tenantPlan: "trial", platformInternalRole: "platform_delegate", internalVerified: true, internalMode: "full",
});
check(delegate.billing_exempt === true && delegate.source === "platform_delegate", "verified delegate must receive internal entitlement");

const runtimeSources = [
  files.manager,
  files.server,
  files.client,
  files.console,
  files.accept,
  files.bootstrap,
  files.rootMigration,
].join("\n");
check(!/mavrk2026@outlook\.com/i.test(runtimeSources), "root email must stay environment-driven in runtime code");
check(!/marcaia2026@outlook\.com/i.test(runtimeSources), "legacy owner email must not be hardcoded");
check(!/FITCORE_PLATFORM_OWNER_SECRET\s*=\s*["'][^"']+["']/i.test(joined), "temporary secret must not be hardcoded");

console.log("platform-owner #62 + internal-product-access #72 contract: OK");
