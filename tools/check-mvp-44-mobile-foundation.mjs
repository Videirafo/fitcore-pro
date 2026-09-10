import { readFileSync, existsSync } from 'node:fs';

const required = [
  'apps/mobile/pubspec.yaml',
  'apps/mobile/lib/main.dart',
  'apps/mobile/lib/src/data/sync_engine.dart',
  'apps/mobile/lib/src/data/workout_repository.dart',
  'apps/mobile/lib/src/features/today/today_screen.dart',
  'apps/mobile/lib/src/features/workout/workout_screen.dart',
  'apps/mobile/lib/src/features/body/body_screen.dart',
  'apps/mobile/lib/src/features/evolution/evolution_screen.dart',
  'apps/mobile/lib/src/features/profile/profile_screen.dart',
  'apps/mobile/android/app/build.gradle.kts',
  'apps/mobile/ios/Runner.xcodeproj/project.pbxproj',
];

for (const file of required) {
  if (!existsSync(file)) throw new Error(`MVP-44 arquivo obrigatório ausente: ${file}`);
}

const api = readFileSync('apps/mobile/lib/src/data/fitcore_api.dart', 'utf8');
const sync = readFileSync('apps/mobile/lib/src/data/sync_engine.dart', 'utf8');
const shell = readFileSync('apps/mobile/lib/src/features/shell/app_shell.dart', 'utf8');
const androidManifest = readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
for (const endpoint of [
  '/api/mvp-19/login',
  '/api/mvp-24/my-workouts',
  '/api/mvp-25/executions/start',
  '/api/mvp-26/my-evolution',
]) {
  if (!api.includes(endpoint)) throw new Error(`MVP-44 endpoint canônico ausente: ${endpoint}`);
}

for (const token of ['startWorkout', 'completeExercise', 'finishWorkout', 'mapExecutionId']) {
  if (!sync.includes(token)) throw new Error(`MVP-44 sync incompleto: ${token}`);
}

for (const label of ['Hoje', 'Treino', 'Corpo', 'Evolução', 'Perfil']) {
  if (!shell.includes(`label: '${label}'`)) throw new Error(`MVP-44 navegação ausente: ${label}`);
}

if (!androidManifest.includes('android.permission.INTERNET')) {
  throw new Error('MVP-44 Android release sem permissão INTERNET.');
}

const forbidden = ['package:gymmane', 'Z-Anatomy', 'thebuggeddev/anatomy'];
const mobileSources = [api, sync, shell].join('\n');
for (const token of forbidden) {
  if (mobileSources.includes(token)) throw new Error(`MVP-44 acoplamento proibido detectado: ${token}`);
}

console.log('MVP-44 mobile foundation OK');
