# MVP-44 — FitCore Mobile offline-first

## Objetivo

Criar o app móvel canônico do FitCore para aluno/treinador, sem duplicar backend e preservando o web/coach existente.

## Arquitetura

O app Flutter consome a API própria do FitCore:

- MVP-19: login por credencial e sessão assinada;
- MVP-24: treinos prescritos/aprovados do aluno;
- MVP-25: início, progresso e conclusão da execução;
- MVP-26: histórico e evolução;
- MVP-33: coach baseado em evidências (próxima etapa de UI).

A camada móvel é offline-first: sessão ativa, planos e fila de sincronização ficam persistidos no aparelho. O servidor continua sendo a autoridade final.

## Fluxo entregue

`Login → Hoje → iniciar treino → registrar séries → descanso → concluir exercícios → finalizar → evolução`

Navegação principal: `Hoje / Treino / Corpo / Evolução / Perfil`.
## Offline e sincronização

A fila usa operações ordenadas e IDs locais estáveis:

1. `startWorkout` cria a execução remota e grava o mapeamento local→remoto;
2. `completeExercise` só executa após existir ID remoto;
3. `finishWorkout` permanece na fila até poder concluir no servidor.

Falhas de rede não apagam a fila; a operação permanece pendente com contador de tentativas.

## Licenciamento

GymMane e demais referências foram usados apenas como inteligência de produto/UX. Nenhum código GPL, ilustração CC BY-SA ou asset de terceiros foi incorporado ao app.

## Rodar no VS Code

```bash
cd apps/mobile
flutter pub get
flutter run --dart-define=FITCORE_API_URL=https://fitcore.marcaia.app
```

Gates:

```bash
flutter analyze
flutter test
flutter build apk --release --dart-define=FITCORE_API_URL=https://fitcore.marcaia.app
```
