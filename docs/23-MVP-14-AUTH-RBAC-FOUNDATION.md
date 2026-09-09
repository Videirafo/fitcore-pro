# MVP-14 — Auth/RBAC foundation

## Objetivo

Preparar o FitCore Pro para autenticação real, separação de papéis e escopo por tenant sem quebrar a operação já validada em PostgreSQL.

O MVP-14 ainda não é login final. Ele cria o contrato operacional que o login real vai usar:

```txt
request → access context → tenant_slug + actor_role + capabilities → API
```

## Papéis

```txt
gestor    → dashboard, alunos, treinos, revisões, check-ins, auditoria e configuração
professor → dashboard, alunos, treinos, revisões e check-ins
aluno     → meu treino e meus check-ins
```

## Arquivos

```txt
services/api/security/access-context.mjs
infra/scripts/apply-mvp-14-access-control.sh
infra/scripts/verify-mvp-14-access-control.sh
apps/site-static/mvp-14.html
apps/site-static/mvp-14.css
apps/site-static/mvp-14.js
docs/23-MVP-14-AUTH-RBAC-FOUNDATION.md
```

## Endpoints

```txt
GET /api/mvp-14/access-context
GET /api/health
```

O endpoint aceita headers de validação controlada:

```txt
x-fitcore-tenant: demo
x-fitcore-role: gestor | professor | aluno
x-fitcore-actor: nome-operacional
```

## Modo de segurança

Nesta fase o RBAC entra em modo `soft` por padrão. Isso evita quebrar os MVPs 01–13 enquanto o login real ainda não existe.

Para uma fase futura:

```txt
FITCORE_RBAC_ENFORCEMENT=strict
```

## Verificação

```bash
cd /opt/fitcore-pro

git pull --ff-only origin main
chmod +x infra/scripts/apply-mvp-14-access-control.sh infra/scripts/verify-mvp-14-access-control.sh
bash infra/scripts/apply-mvp-14-access-control.sh
node --check services/api/server.mjs
node --check services/api/security/access-context.mjs
node --check apps/site-static/mvp-14.js
systemctl restart fitcore-api
bash infra/scripts/switch-fitcore-to-own-ui.sh
bash infra/scripts/verify-mvp-14-access-control.sh
curl -I https://fitcore.marcaia.app/mvp-14.html
```

## Critério de pronto

O MVP-14 só está pronto quando:

- PostgresStore continua ativo;
- `/api/mvp-14/access-context` responde para gestor, professor e aluno;
- `/api/health` expõe `mvp_14`;
- `/mvp-14.html` responde HTTP 200;
- nenhuma informação sensível nova é coletada;
- rollback de persistência continua preservado.

## Próximo gate

MVP-15:

```txt
login real mínimo
→ sessão assinada
→ usuário vinculado a tenant
→ papel vindo do banco
→ headers deixam de ser fonte final de confiança
→ rotas protegidas por sessão
```
