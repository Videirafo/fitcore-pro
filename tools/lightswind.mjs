#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PINNED_VERSION = '3.2.4';
const root = process.cwd();
const explicitProject = process.env.LIGHTSWIND_PROJECT_DIR;
const fitcoreSite = resolve(root, 'apps/site');
const projectDir = resolve(root, explicitProject || (existsSync(resolve(fitcoreSite, 'package.json')) ? 'apps/site' : '.'));
const packagePath = resolve(projectDir, 'package.json');

function fail(message, code = 1) {
  console.error(`[lightswind] ${message}`);
  process.exit(code);
}

function readProjectPackage() {
  if (!existsSync(packagePath)) return null;
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch (error) {
    fail(`cannot read ${packagePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function deps(pkg) {
  return { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
}

function doctor() {
  const pkg = readProjectPackage();
  const all = deps(pkg);
  const report = {
    lightswindCli: PINNED_VERSION,
    projectDir,
    package: pkg?.name || null,
    react: all.react || null,
    next: all.next || null,
    tailwindcss: all.tailwindcss || null,
    compatible: Boolean(all.react && all.tailwindcss),
    proLicenseConfigured: Boolean(process.env.LIGHTSWIND_LICENSE_KEY),
    policy: 'source-first; local components only; init is blocked by this wrapper',
  };
  console.log(JSON.stringify(report, null, 2));
  if (!pkg) return 2;
  return report.compatible ? 0 : 3;
}

function assertInstallReady() {
  const pkg = readProjectPackage();
  const all = deps(pkg);
  if (!pkg) fail(`no package.json found in ${projectDir}`);
  if (!all.react) fail('React is not configured in the target project.');
  if (!all.tailwindcss) {
    fail('Tailwind CSS is not configured in the target project. Establish the project design-system foundation before importing Lightswind components.');
  }
}

function run(args) {
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(bin, ['--yes', `lightswind@${PINNED_VERSION}`, ...args], {
    cwd: projectDir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 1);
}

const [command = 'help', ...args] = process.argv.slice(2);

switch (command) {
  case 'doctor':
    process.exit(doctor());
  case 'list':
    run(['list', ...args]);
    break;
  case 'add':
    assertInstallReady();
    if (!args.length) fail('usage: ui:lightswind -- add <component>');
    run(['add', ...args]);
    break;
  case 'add-category':
    assertInstallReady();
    if (!args.length) fail('usage: ui:lightswind -- add-category <category>');
    run(['add', '--category', args[0], ...args.slice(1)]);
    break;
  case 'auth-status':
    run(['auth', 'status']);
    break;
  case 'mcp':
    run(['mcp', ...args]);
    break;
  case 'mcp-init':
    if (process.env.LIGHTSWIND_ALLOW_MCP_INIT !== '1') {
      fail('mcp init writes editor configuration. Re-run with LIGHTSWIND_ALLOW_MCP_INIT=1 after review.');
    }
    run(['mcp', 'init', ...args]);
    break;
  case 'init':
    fail('init is intentionally blocked. Existing projects must preserve their current tokens, Tailwind setup, and design system. Import components selectively with add.');
    break;
  case 'help':
  default:
    console.log(`Lightswind UI guarded wrapper (pinned ${PINNED_VERSION})\n\nCommands:\n  doctor\n  list\n  add <component>\n  add-category <category>\n  auth-status\n  mcp\n  mcp-init   (requires LIGHTSWIND_ALLOW_MCP_INIT=1)\n\nEnvironment:\n  LIGHTSWIND_PROJECT_DIR=<relative-or-absolute-path>\n  LIGHTSWIND_LICENSE_KEY=<pro-key> (never commit this value)\n`);
    process.exit(command === 'help' ? 0 : 1);
}
