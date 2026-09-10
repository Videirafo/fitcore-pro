# FitCore Mobile

Aplicativo Flutter canônico do FitCore para Android e iOS, com foco em execução de treino rápida no celular e operação offline-first.

## Stack

- Flutter / Dart
- Riverpod para estado
- API própria FitCore como autoridade
- SharedPreferences para sessão de treino, cache e fila offline
- Flutter Secure Storage para cookie de sessão

## Fluxo

`Login → Hoje → Treino → séries/descanso → conclusão → Evolução`

Navegação principal: `Hoje / Treino / Corpo / Evolução / Perfil`.

O app não cria backend paralelo. Login, prescrições, execuções e evolução usam os contratos MVP-19, MVP-24, MVP-25 e MVP-26 do FitCore.

## Rodar no VS Code

Abra o diretório `apps/mobile` e execute:

```bash
flutter pub get
flutter run --dart-define=FITCORE_API_URL=https://fitcore.marcaia.app
```
## Gates locais

```bash
flutter analyze
flutter test
flutter build apk --release \
  --dart-define=FITCORE_API_URL=https://fitcore.marcaia.app
```

No monorepo também existem:

```bash
npm run mvp44:check
npm run mobile:verify
npm run mobile:build:apk
```

## Offline

Sessão ativa, planos e fila de sincronização permanecem no aparelho. A fila preserva a ordem `startWorkout → completeExercise → finishWorkout` e retoma quando a API volta a responder.

O detalhamento de cada série (carga/repetições/RPE) permanece local nesta etapa porque o backend atual ainda não expõe contrato canônico por série. Não é enviado a um endpoint inventado.

## Release

O APK atual serve para validação técnica. Publicação na Google Play exige keystore de produção e configuração de signing própria; iOS exige assinatura/provisionamento Apple em ambiente macOS/Xcode.
