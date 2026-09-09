# MVP-18 — Perfis reais e convite de usuário

## Objetivo

Permitir que o gestor crie usuários reais por convite, sem depender de botões demo para professor e aluno.

Fluxo validado:

```txt
gestor com sessão assinada → cria convite → link/token → professor/aluno aceita → sessão assinada → papel do banco
```

## Escopo

- criar usuário por gestor;
- convite por link/token;
- token salvo apenas como hash no PostgreSQL;
- professor/aluno recebem papel sem botão demo;
- sessão real criada após aceite do convite;
- tenant `demo`, RBAC e auditoria preservados;
- rollback seguro pelo modo soft do MVP-15.

## Arquivos

```txt
services/api/security/invite-users.mjs
infra/sql/004-mvp-18-user-invites.sql
infra/scripts/apply-mvp-18-user-invites.sh
infra/scripts/verify-mvp-18-user-invites.sh
infra/scripts/rollback-mvp-18-soft-login.sh
apps/site-static/mvp-18.html
apps/site-static/mvp-18.css
apps/site-static/mvp-18.js
```

## Endpoints

```txt
GET  /api/mvp-18/status
GET  /api/mvp-18/users
POST /api/mvp-18/users/invite
GET  /api/mvp-18/invites/inspect?token=...
POST /api/mvp-18/invites/accept
```

## Critério de pronto

- sem sessão, gestão de usuários retorna 401;
- gestor cria convite para professor/aluno;
- token pode ser inspecionado sem login demo;
- aceite cria sessão assinada real;
- sessão indica `login_source=mvp18_invite`;
- professor não acessa gestão de usuários;
- gestor vê usuário criado;
- auditoria de convite é persistida.

## Próximo gate

MVP-19:

```txt
Cadastro/login com credencial mínima
→ usuário define senha ou código de acesso
→ convite deixa de ser a única entrada
→ troca de sessão demo por credencial real
→ recuperação/revogação controlada
→ auditoria de autenticação
```
