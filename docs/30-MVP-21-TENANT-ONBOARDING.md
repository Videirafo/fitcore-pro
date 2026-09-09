# MVP-21 — Onboarding real do tenant

## Objetivo

Sair do tenant `demo` como único fluxo e permitir criação real de academia, estúdio, box ou personal trainer com gestor proprietário.

## Fluxo entregue

```txt
home → /mvp-21.html → cria negócio → tenant real → gestor proprietário → credencial → sessão assinada → RBAC → operação
```

## Escopo

- criar tenant de academia, estúdio, box ou personal;
- gerar slug único e domínio interno `slug.fitcore.local`;
- criar gestor proprietário com credencial real;
- criar primeiro professor;
- criar primeiro aluno e registro mínimo em `fitcore_students`;
- criar sessão assinada do gestor após onboarding;
- permitir login por credencial usando `tenant_slug`;
- manter RBAC, rate limit, logs e auditoria;
- manter `demo` somente como tenant legado/demo, não como único caminho.

## Arquivos

```txt
services/api/security/tenant-onboarding.mjs
infra/sql/007-mvp-21-tenant-onboarding.sql
infra/scripts/apply-mvp-21-tenant-onboarding.sh
infra/scripts/verify-mvp-21-tenant-onboarding.sh
infra/scripts/rollback-mvp-21-tenant-onboarding.sh
apps/site-static/mvp-21.html
apps/site-static/mvp-21.css
apps/site-static/mvp-21.js
```

## Endpoints

```txt
GET  /api/mvp-21/status
POST /api/mvp-21/onboarding
GET  /api/mvp-21/tenant
```

## Critério de pronto

- `/api/mvp-21/status` ativo;
- onboarding cria tenant não-demo;
- tenant recebe gestor proprietário com senha/código real;
- sessão criada aponta para o novo tenant;
- login posterior por credencial funciona com `tenant_slug`;
- navegação e rotas operacionais abrem com sessão do novo tenant;
- escrita operacional usa `tenant_id` da sessão;
- auditoria e logs de segurança registram onboarding;
- `/mvp-21.html` publicado.

## Próximo gate

MVP-22:

```txt
Gestão real de usuários do tenant
→ gestor cria professor/aluno dentro do próprio tenant
→ convite e credencial com tenant_slug
→ listagem por tenant
→ bloqueio de acesso cruzado
→ auditoria por tenant
```
