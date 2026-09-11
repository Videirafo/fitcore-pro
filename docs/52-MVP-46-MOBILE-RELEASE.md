# MVP-46 — Mobile release

Issue: #26

## Objetivo

Transformar o foundation offline-first do MVP-44 em release Android tecnicamente distribuível, sem criar backend paralelo e mantendo a API FitCore como autoridade.

## Entregas

- sync canônico de séries com reps, carga e RPE;
- replay idempotente da fila offline;
- RLS, ownership do aluno e auditoria mínima;
- timer de descanso com notificação local cancelável;
- launcher icon, adaptive icon e splash alinhados à identidade FitCore;
- signing Android externo ao Git;
- APK e AAB release assináveis;
- páginas legais públicas para preparação de loja;
- gate PostgreSQL 17.6 descartável com rollback/reapply.

## Segurança

`FITCORE_WORKOUT_SET_SYNC_ENABLED` permanece desligado por padrão no código. Produção só ativa a feature após migration e smoke.

O upload keystore e `key.properties` nunca entram no Git. O rollback operacional de produção remove a feature flag e preserva as séries persistidas.

## Google Play readiness

Antes do primeiro upload definitivo:

1. confirmar o package/application ID final;
2. guardar backup externo do upload key;
3. definir o canal público de contato da política de privacidade;
4. revisar o formulário Data Safety contra os dados realmente coletados;
5. fornecer screenshots e textos da ficha da loja;
6. executar teste em aparelho Android real;
7. enviar o AAB assinado à trilha interna antes de produção.

Rotas públicas preparadas:

- `/legal/privacy`;
- `/legal/security`;
- `/legal/terms`;
- `/legal/open-source`;
- `/legal/exclusao-conta`.

O app móvel atual não cria contas diretamente; usuários são provisionados pela unidade. A página de exclusão ainda existe para dar ao titular um caminho explícito de solicitação.

## iOS

O projeto iOS, AppIcon, splash e inicialização de notificações estão preparados no repositório. Assinatura, provisioning profile, bundle identifier definitivo e validação TestFlight continuam bloqueados até execução em macOS/Xcode com Apple Developer.

## Gates automatizados

```bash
npm run mvp46:check
npm run mvp46:db:gate
npm run mobile:release:verify
npm run all:ui-gates
npm run site:next:build
```

Os artefatos Android devem ser verificados com `apksigner`/certificado e hash SHA-256 depois do build final.

## Estado externo

- hardware Android: BLOCKED até aparelho real;
- Play Console: BLOCKED até acesso e decisões comerciais finais;
- Apple signing/TestFlight: BLOCKED até macOS/Xcode + conta Apple.

Esses bloqueios externos não são tratados como falha dos gates automatizados e não devem ser marcados como VERIFIED sem evidência real.
