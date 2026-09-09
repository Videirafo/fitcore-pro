# MVP-22 — Gestão real de usuários do tenant

## Objetivo

Permitir que o gestor administre usuários dentro do próprio tenant, sem depender do tenant `demo` e sem permitir acesso cruzado entre negócios.

## Fluxo entregue

```txt
gestor logado no tenant
→ cria professor/aluno diretamente
→ ou gera convite com tenant_slug
→ usuário aceita convite e define credencial
→ sessão assinada aponta para o tenant correto
→ RBAC libera somente o que o papel permite
→ auditoria fica vinculada ao tenant_id
```

## Escopo

- gestor cria professor/aluno no próprio tenant;
- convite carrega `tenant_slug` no link;
- aceite do convite exige `tenant_slug`, token, identificador e senha/código;
- login posterior por credencial usa `tenant_slug`;
- listagem mostra apenas usuários e convites do tenant da sessão;
- tentativa de listar outro tenant retorna bloqueio;
- auditoria operacional em `fitcore_tenant_user_events` e `fitcore_audit_events`;
- logs de segurança continuam em `fitcore_security_events`;
- tela `/mvp-22.html` publicada com CSS/JS conectados;
- estrutura Next em `apps/site` preparada para migração gradual do front.

## Arquivos

```txt
services/api/security/tenant-user-management.mjs
infra/sql/008-mvp-22-tenant-user-management.sql
infra/scripts/apply-mvp-22-tenant-user-management.sh
infra/scripts/verify-mvp-22-tenant-user-management.sh
infra/scripts/rollback-mvp-22-tenant-user-management.sh
apps/site-static/mvp-22.html
apps/site-static/mvp-22.css
apps/site-static/mvp-22.js
apps/site/*
tools/check-front-assets.mjs
tools/check-next-app.mjs
```

## Endpoints

```txt
GET  /api/mvp-22/status
GET  /api/mvp-22/users
POST /api/mvp-22/users
POST /api/mvp-22/users/invite
GET  /api/mvp-22/invites/inspect?tenant_slug=...&token=...
POST /api/mvp-22/invites/accept
GET  /api/mvp-22/cross-tenant-check?tenant_slug=...
```

## Critério de pronto

- MVP-22 ativo em `/api/mvp-22/status`;
- tenant novo cria gestor/professor/aluno pelo MVP-21;
- gestor cria professor/aluno dentro do próprio tenant;
- convite com `tenant_slug` é aceito e cria credencial real;
- login por credencial funciona fora do tenant demo;
- listagem retorna apenas dados do tenant da sessão;
- acesso cruzado retorna 403;
- dados operacionais gravam no `tenant_id` da sessão;
- auditoria por tenant fica persistida;
- front estático passa no contrato CSS/JS;
- shell Next passa no contrato estrutural.

## Próximo gate

MVP-23:

```txt
Cadastro operacional de aluno real
→ aluno vira entidade completa do tenant
→ vínculo com user aluno
→ professor responsável
→ tela Next/operacional consistente
→ auditoria e isolamento tenant
```
