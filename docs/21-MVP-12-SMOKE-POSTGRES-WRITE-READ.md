# MVP-12 — Smoke real de escrita/leitura no PostgreSQL

## Objetivo

Validar que o FitCore Pro saiu do fallback JSON e está escrevendo/lendo dados reais pelo ciclo:

```txt
UI/API → server.mjs → PersistenceAdapter → PostgresStore → fitcore_postgres
```

O MVP-12 não cria produto novo. Ele é um gate de confiança operacional.

## Pré-condições

- MVP-11 aplicado.
- `fitcore_postgres` healthy.
- `fitcore-api` ativa.
- `/api/mvp-10/postgres-store` retornando `active_store: PostgresStore`.
- Migrations MVP-07 e MVP-10 aplicadas.

## Arquivos

```txt
infra/scripts/smoke-mvp-12-postgres-write-read.sh
infra/scripts/verify-mvp-12-smoke.sh
apps/site-static/mvp-12.html
apps/site-static/mvp-12.css
apps/site-static/mvp-12.js
docs/21-MVP-12-SMOKE-POSTGRES-WRITE-READ.md
```

## Fluxo testado

O script de smoke executa:

1. Confirma que o store ativo é `PostgresStore`.
2. Cria aluno + treino via `POST /api/mvp-01/aluno-treino`.
3. Cria revisão do professor via `POST /api/mvp-03/professor/reviews`.
4. Aprova revisão via `PATCH /api/mvp-03/professor/reviews/:id/approve`.
5. Cria check-in via `POST /api/mvp-02/checkins`.
6. Conclui check-in via `PATCH /api/mvp-02/checkins/:id/status`.
7. Lê novamente pela API.
8. Consulta diretamente o PostgreSQL.
9. Verifica registros em:
   - `fitcore_workouts`;
   - `fitcore_professor_reviews`;
   - `fitcore_workout_executions`;
   - `fitcore_audit_events`.

## Execução

```bash
cd /opt/fitcore-pro

git pull --ff-only origin main
chmod +x infra/scripts/smoke-mvp-12-postgres-write-read.sh infra/scripts/verify-mvp-12-smoke.sh

node --check apps/site-static/mvp-12.js
bash infra/scripts/smoke-mvp-12-postgres-write-read.sh
bash infra/scripts/verify-mvp-12-smoke.sh

bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -I https://fitcore.marcaia.app/mvp-12.html
```

## Resultado esperado

O smoke deve terminar com:

```txt
MVP-12 OK: escrita/leitura real no PostgreSQL validada via API + psql.
```

E deve gerar:

```txt
storage/mvp-12/latest-smoke.json
```

com os IDs do treino, revisão e check-in validados.

## Critério de pronto

O MVP-12 só está pronto quando:

- API pública confirma `PostgresStore` ativo;
- aluno/treino são criados via API;
- revisão é criada e aprovada;
- check-in é criado e concluído;
- a leitura por API retorna o treino criado;
- `psql` confirma registros no PostgreSQL;
- auditoria LGPD existe em `fitcore_audit_events`;
- página `/mvp-12.html` responde HTTP 200.

## Próximo gate

MVP-13:

```txt
Interface real ligada ao PostgresStore
→ confirmar dados nos painéis MVP-01 a MVP-05 usando Postgres
→ remover linguagem de protótipo da UI
→ organizar fluxo professor/aluno como produto
→ preparar login/RBAC real
```
