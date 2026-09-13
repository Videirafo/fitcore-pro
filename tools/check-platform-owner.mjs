import { readFileSync } from "node:fs";

const files = {
  migration: readFileSync("infra/sql/021-platform-owner.sql", "utf8"),
  manager: readFileSync("services/api/security/platform-owner.mjs", "utf8"),
  server: readFileSync("services/api/server.mjs", "utf8"),
  client: readFileSync("apps/site/components/FitCoreRouteClient.tsx", "utf8"),
  console: readFileSync("apps/site/components/PlatformOwnerConsole.tsx", "utf8"),
  bootstrap: readFileSync("infra/scripts/bootstrap-platform-owner.sh", "utf8"),
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(files.migration.includes("fitcore_platform_admins"), "platform admin table missing");
check(files.migration.includes("fitcore_platform_admin_bridges"), "bridge table missing");
check(files.migration.includes("fitcore_platform_admin_audit_events"), "audit table missing");
check(files.manager.includes('FITCORE_PLATFORM_OWNER_ENABLED || "false"'), "platform owner must default off");
check(files.manager.includes("globalLogin"), "global owner login missing");
check(files.manager.includes("switchTenant"), "tenant switch missing");
check(files.server.includes('/api/platform-owner/tenants'), "tenant list endpoint missing");
check(files.server.includes('/api/platform-owner/switch'), "tenant switch endpoint missing");
check(files.client.includes('result?.platform_owner ? "/admin"'), "platform owner redirect missing");
check(files.console.includes('/api/platform-owner/tenants'), "admin console tenant source missing");
check(files.bootstrap.includes('FITCORE_PLATFORM_OWNER_EMAIL'), "operator email input missing");
check(files.bootstrap.includes('FITCORE_PLATFORM_OWNER_SECRET'), "operator secret input missing");
check(files.bootstrap.includes('FITCORE_PLATFORM_OWNER_RESET_SECRET'), "idempotent reset guard missing");
check(!/marcaia2026@outlook\.com/i.test(Object.values(files).join("\n")), "owner email must not be hardcoded");
check(!/FITCORE_PLATFORM_OWNER_SECRET\s*=\s*["'][^"']+["']/i.test(Object.values(files).join("\n")), "temporary secret must not be hardcoded");

console.log("platform-owner #62 contract: OK");
