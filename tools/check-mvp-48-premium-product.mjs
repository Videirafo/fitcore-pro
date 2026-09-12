#!/usr/bin/env node
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("infra/sql/020-mvp-48-premium-product.sql");
const onboarding = read("services/api/security/tenant-onboarding.mjs");
const users = read("services/api/security/tenant-user-management.mjs");
const client = read("apps/site/components/FitCoreRouteClient.tsx");
const css = read("apps/site/app/mvp-48-premium-product.css");
const layout = read("apps/site/app/layout.tsx");

const checks = [
  [migration.includes("ADD COLUMN IF NOT EXISTS email text"), "canonical email column"],
  [migration.includes("ADD COLUMN IF NOT EXISTS telefone text"), "canonical phone column"],
  [migration.includes("aceitou_termos_em") && migration.includes("aceitou_privacidade_em"), "consent timestamps"],
  [migration.includes("email_contato") && migration.includes("cidade") && migration.includes("estado"), "business contact profile"],
  [migration.includes("idx_fitcore_users_tenant_email"), "tenant email uniqueness"],
  [onboarding.includes("owner_email") && onboarding.includes("owner_phone"), "email-first owner onboarding"],
  [onboarding.includes("consentimento_obrigatorio"), "consent validation"],
  [onboarding.includes("10 caracteres") && onboarding.includes("/[A-Z]/"), "strong owner password"],
  [users.includes("const email = normalizeEmail") && users.includes("telefone"), "team email/phone identity"],
];

checks.push(
  [client.includes('name="owner_email"') && client.includes('type="email"'), "premium email signup UI"],
  [client.includes('name="owner_phone"') && client.includes('name="confirm_secret"'), "profile and password confirmation UI"],
  [client.includes('name="accept_terms"') && client.includes('name="accept_privacy"'), "legal consent UI"],
  [client.includes('name="email"') && client.includes('WhatsApp / telefone'), "team email-first UI"],
  [css.includes("background: transparent !important") && css.includes("box-shadow: none !important"), "transparent official lockup"],
  [css.includes(".premium-signup-grid") && css.includes(".signup-section"), "premium responsive signup"],
  [layout.includes('mvp-48-premium-product.css'), "premium stylesheet wired"],
);

let failed = false;
for (const [ok, label] of checks) {
  if (!ok) { failed = true; console.error(`FAIL ${label}`); }
  else console.log(`PASS ${label}`);
}
if (failed) process.exit(1);
console.log("MVP-48 premium product contract OK");
