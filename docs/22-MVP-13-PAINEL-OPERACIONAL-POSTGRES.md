# MVP-13 — Painel operacional com dados reais do PostgreSQL

## Objetivo

Criar o primeiro painel operacional do FitCore Pro usando os dados reais gerados pelo `PostgresStore`.

Depois dos gates anteriores, o fluxo validado é:

```txt
MVP-01/02/03 → API própria → PersistenceAdapter → PostgresStore → PostgreSQL dedicado
```

O MVP-13 transforma essa base em uma tela de operação para gestor/professor acompanhar o sistema sem precisar abrir terminal.

## Arquivos

```txt
apps/site-static/mvp-13.html
apps/site-static/mvp-13.css
apps/site-static/mvp-13.js
infra/scripts/verify-mvp-13-operational-dashboard.sh
docs/22-MVP-13-PAINEL-OPERACIONAL-POSTGRES.md
```

## O que a tela mostra

A página `/mvp-13.html` lê APIs existentes e mostra:

- store ativo;
- total de alunos/treinos;
- revisões do professor;
- check-ins/execuções;
- últimos treinos criados;
- fila técnica de revisão;
- check-ins recentes;
- diagnóstico de persistência e política LGPD.

## APIs usadas

```txt
GET /api/mvp-10/postgres-store
GET /api/mvp-01/aluno-treino?limit=8
GET /api/mvp-02/checkins?limit=8
GET /api/mvp-03/professor/contexto
```

Como o `PostgresStore` já está ativo, essas leituras passam pelo banco real.

## Verificação

```bash
cd /opt/fitcore-pro

git pull --ff-only origin main
chmod +x infra/scripts/verify-mvp-13-operational-dashboard.sh

node --check apps/site-static/mvp-13.js
bash infra/scripts/verify-mvp-13-operational-dashboard.sh
bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -I https://fitcore.marcaia.app/mvp-13.html
```

## Critério de pronto

O MVP-13 só está pronto quando:

- `/api/mvp-10/postgres-store` confirma `active_store: PostgresStore`;
- APIs dos MVPs 01, 02 e 03 respondem JSON válido;
- `/mvp-13.html` responde HTTP 200;
- a tela mostra dados criados no smoke do MVP-12;
- nenhuma informação sensível nova é exposta.

## Próximo gate

MVP-14:

```txt
Autenticação e papéis reais
→ separar gestor, professor e aluno
→ preparar login real
→ aplicar tenant_id por sessão
→ proteger rotas sensíveis
→ manter política LGPD
```
