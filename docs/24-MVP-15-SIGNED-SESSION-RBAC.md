# MVP-15 — Sessão assinada e RBAC real

## Objetivo

Trocar o controle de acesso baseado em headers/defaults por sessão assinada, vinculada ao tenant `demo` e a um usuário real da tabela `fitcore_users`.

Fluxo validado:

```txt
browser/API client → cookie HttpOnly assinado → fitcore_signed_sessions → fitcore_users → papel do banco
```

## Escopo

- sessão assinada por HMAC;
- usuário vinculado ao tenant `demo`;
- papel final vindo do PostgreSQL;
- headers deixam de ser fonte final de confiança no modo assinado;
- APIs operacionais protegidas por sessão;
- logout com revogação da sessão no banco;
- rollback seguro para modo soft.

## Arquivos

```txt
services/api/security/signed-session.mjs
infra/sql/003-mvp-15-signed-sessions.sql
infra/scripts/apply-mvp-15-signed-session.sh
infra/scripts/verify-mvp-15-signed-session.sh
infra/scripts/rollback-mvp-15-soft-auth.sh
apps/site-static/mvp-15.html
apps/site-static/mvp-15.css
apps/site-static/mvp-15.js
```

## Endpoints

```txt
GET  /api/mvp-15/session
POST /api/mvp-15/session/login
POST /api/mvp-15/session/logout
```

Rotas protegidas no modo assinado:

```txt
/api/mvp-01/aluno-treino
/api/mvp-02/checkins
/api/mvp-03/professor/*
```

## Aplicar

```bash
cd /opt/fitcore-pro

bash infra/scripts/apply-mvp-15-signed-session.sh
bash infra/scripts/verify-mvp-15-signed-session.sh
bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -I https://fitcore.marcaia.app/mvp-15.html
```

## Rollback

```bash
bash infra/scripts/rollback-mvp-15-soft-auth.sh
```

O rollback remove apenas o drop-in de sessão. O PostgreSQL dedicado e o PostgresStore continuam intactos.

## Critério de pronto

- rota protegida sem sessão retorna 401;
- login cria cookie assinado;
- sessão consulta papel no banco;
- rota protegida abre com cookie válido;
- logout revoga sessão;
- rota protegida volta a 401 após logout;
- página `/mvp-15.html` responde 200.
