# FitCore Platform Root Admin

A identidade raiz canônica do FitCore é **mavrk2026@outlook.com**.

## Direitos operacionais

Quando autenticado e confirmado em `fitcore_platform_admins` com `role='platform_owner'`, esse usuário pode:

- acessar o control plane global;
- selecionar qualquer tenant/unidade ativa;
- testar **Acesso Total, Essencial, Profissional, Business e Enterprise** sem checkout;
- usar todas as features internas equivalentes ao Enterprise em modo `full`;
- criar convites temporários para outros e-mails de teste;
- revogar delegates internos;
- operar como `gestor` dentro do tenant selecionado, preservando tenant scope e auditoria.

## Segurança

O e-mail sozinho nunca concede acesso. O fluxo exige credencial válida, sessão assinada, registro ativo em `fitcore_platform_admins` e bridge auditado para o tenant.

O segredo do proprietário não deve ser salvo no Git. Para reconciliar a identidade em uma instalação, use:

```bash
export FITCORE_PLATFORM_ROOT_EMAIL='mavrk2026@outlook.com'
export FITCORE_PLATFORM_OWNER_EMAIL="$FITCORE_PLATFORM_ROOT_EMAIL"
read -s FITCORE_PLATFORM_OWNER_SECRET
export FITCORE_PLATFORM_OWNER_SECRET
npm run platform-owner:bootstrap
unset FITCORE_PLATFORM_OWNER_SECRET
```

Para migrar somente o e-mail do único proprietário raiz preservando o hash da credencial:

```bash
export FITCORE_PLATFORM_ROOT_EMAIL='mavrk2026@outlook.com'
npm run platform-owner:root-email:migrate
```
