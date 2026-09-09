# MVP-20 — Hardening de autenticação

## Objetivo

Fechar a entrada real do FitCore para operação: login por credencial, demo bloqueado em produção, rate limit, sessões revogáveis e logs de segurança por tenant.

## Escopo entregue

```txt
home → /mvp-19.html → credencial real → cookie HttpOnly assinado → RBAC → operação
```

- login demo bloqueado quando `FITCORE_ENV=production` e `FITCORE_DEMO_LOGIN_ENABLED=false`;
- rate limit por `ip_hash + user_agent_hash + ação`;
- política de senha/código em modo strict;
- limpeza/revogação de sessões expiradas;
- logs de segurança por tenant em `fitcore_security_events`;
- home aponta para entrada real, não para telas soltas;
- páginas protegidas seguem usando sessão assinada, RBAC e auditoria.

## Arquivos

```txt
services/api/security/auth-hardening.mjs
infra/sql/006-mvp-20-auth-hardening.sql
infra/scripts/apply-mvp-20-auth-hardening.sh
infra/scripts/verify-mvp-20-auth-hardening.sh
infra/scripts/rollback-mvp-20-auth-hardening.sh
infra/scripts/seed-mvp-20-admin-credential.sh
apps/site-static/mvp-20.html
apps/site-static/mvp-20.css
apps/site-static/mvp-20.js
```

## Endpoints

```txt
GET  /api/mvp-20/security/status
GET  /api/mvp-20/security/logs
POST /api/mvp-20/security/cleanup-sessions
```

## Critério de pronto

- `/` direciona entrada para `/mvp-19.html`;
- `/api/mvp-15/session/login` retorna 403 com demo bloqueado;
- `/api/mvp-19/login` aceita credencial real;
- rate limit retorna 429 depois de tentativas excessivas;
- logs de segurança são listados por gestor;
- limpeza de sessões expiradas funciona;
- `/mvp-20.html` responde 200.

## Rollback

```bash
bash infra/scripts/rollback-mvp-20-auth-hardening.sh
```

O rollback reativa o modo menos rígido sem remover dados de usuários, sessões, credenciais ou logs.

## Próximo gate

MVP-21:

```txt
Onboarding real do tenant
→ criar academia/estúdio/box
→ gestor proprietário
→ slug/domínio interno
→ primeiro professor/aluno
→ sair do tenant demo como único fluxo
```
