import { existsSync, readFileSync } from 'node:fs';

const required = [
  'infra/sql/019-mvp-46-mobile-release.sql',
  'infra/sql/rollback-019-mvp-46-mobile-release.sql',
  'services/api/security/workout-set-sync.mjs',
  'tools/test-mvp-46-set-sync.mjs',
  'infra/scripts/gate-mvp-46-postgres17.sh',
  'infra/scripts/apply-mvp-46-mobile-release.sh',
  'infra/scripts/rollback-mvp-46-mobile-release.sh',
  'infra/scripts/generate-mobile-upload-keystore.sh',
  'apps/mobile/lib/src/services/rest_notification_service.dart',
  'apps/mobile/assets/branding/fitcore-app-icon.png',
  'apps/mobile/assets/branding/fitcore-splash.png',
  'apps/site/app/legal/privacy/page.tsx',
  'apps/site/app/legal/exclusao-conta/page.tsx',
  'docs/52-MVP-46-MOBILE-RELEASE.md',
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`MVP-46 arquivo obrigatório ausente: ${file}`);
}

const read = (file) => readFileSync(file, 'utf8');
const sql = read(required[0]);
const api = read('services/api/server.mjs');
const manager = read('services/api/security/workout-set-sync.mjs');
const sync = read('apps/mobile/lib/src/data/sync_engine.dart');
const repo = read('apps/mobile/lib/src/data/workout_repository.dart');
const notifications = read('apps/mobile/lib/src/services/rest_notification_service.dart');
const manifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
const gradle = read('apps/mobile/android/app/build.gradle.kts');
const pubspec = read('apps/mobile/pubspec.yaml');
const ignore = read('.gitignore');

const checks = [
  ['tenant RLS', sql.includes('ENABLE ROW LEVEL SECURITY') && sql.includes('current_setting(\'app.tenant_id\'')],
  ['idempotent set key', sql.includes('UNIQUE (tenant_id, execution_id, exercise_index, set_index)')],
  ['feature defaults off', manager.includes('FITCORE_WORKOUT_SET_SYNC_ENABLED, false')],
  ['MVP-46 API routes', api.includes('/api/mvp-46/status') && api.includes('mvp-46\\/executions')],
  ['offline set sync', sync.includes('SyncOperationType.upsertSet') && repo.includes('type: SyncOperationType.upsertSet')],
  ['rest notifications', notifications.includes('zonedSchedule') && notifications.includes('inexactAllowWhileIdle')],
  ['boot reschedule receiver', manifest.includes('RECEIVE_BOOT_COMPLETED') && manifest.includes('ScheduledNotificationBootReceiver')],
  ['notification receiver', manifest.includes('ScheduledNotificationReceiver')],
  ['release signing external', gradle.includes('key.properties') && gradle.includes('FITCORE_REQUIRE_RELEASE_SIGNING')],
  ['no debug release signing', !gradle.includes('signingConfigs.getByName("debug")')],
  ['signing ignored', ignore.includes('apps/mobile/android/key.properties')],
  ['launcher branding', pubspec.includes('flutter_launcher_icons:') && pubspec.includes('fitcore-app-icon.png')],
  ['native splash branding', pubspec.includes('flutter_native_splash:') && pubspec.includes('fitcore-splash.png')],
  ['Play legal surface', existsSync('apps/site/app/legal/privacy/page.tsx') && existsSync('apps/site/app/legal/exclusao-conta/page.tsx')],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
if (failed.length) process.exit(1);

console.log('MVP-46 mobile release contract OK');
