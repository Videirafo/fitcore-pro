# FitCore Mobile

Aplicativo Flutter canônico do FitCore para Android e iOS, focado em execução rápida de treino e operação offline-first.

## Stack

- Flutter / Dart;
- Riverpod para estado;
- API própria FitCore como autoridade;
- SharedPreferences para sessão, cache e fila offline;
- Flutter Secure Storage para cookie de sessão;
- notificações locais para descanso.

## Fluxo

`Login → Hoje → Treino → séries/descanso → conclusão → Evolução`

Navegação: `Hoje / Treino / Corpo / Evolução / Perfil`.

O app não cria backend paralelo. Login, prescrições, execuções, evolução e séries usam contratos canônicos do FitCore.

## Rodar no VS Code

```bash
cd apps/mobile
flutter pub get
flutter run --dart-define=FITCORE_API_URL=https://fitcore.marcaia.app
```

## Offline e sincronização

A fila preserva a ordem:

`startWorkout → upsertSet(s) → completeExercise → finishWorkout`

Cada série é persistida primeiro no aparelho e depois sincronizada. O backend usa chave idempotente por tenant, execução, exercício e índice da série para que replay offline não duplique dados.

O timer de descanso continua em foreground e agenda uma notificação local cancelável para o término do intervalo.

## Gates

```bash
npm run mvp44:check
npm run mvp46:check
npm run mvp46:db:gate
npm run mobile:analyze
npm run mobile:test
npm run mobile:release:verify
```

O gate PostgreSQL 17 roda em banco descartável e testa migration, replay idempotente, ownership, RLS, rollback destrutivo de teste e reapply.

## Release Android

A assinatura release vem de `apps/mobile/android/key.properties`, que é ignorado pelo Git e deve apontar para um upload keystore externo.

```bash
npm run mobile:build:apk:signed
npm run mobile:build:aab:signed
```

Use `FITCORE_REQUIRE_RELEASE_SIGNING=true` para impedir build release sem material de assinatura.

O `applicationId` permanece configurável por `fitcoreApplicationId`; o valor atual é `app.fitcore.fitcore_mobile`. Não publique o primeiro bundle na Play Console até confirmar o identificador definitivo.

## Dependências externas de release

- teste físico Android: exige aparelho real/ADB;
- Google Play: exige conta Play Console e decisão final de package ID;
- upload key: exige backup externo seguro antes do primeiro upload;
- política de privacidade: `/legal/privacy` existe, mas o canal público de contato ainda precisa de definição comercial;
- iOS: signing e provisioning exigem macOS/Xcode e conta Apple Developer.
