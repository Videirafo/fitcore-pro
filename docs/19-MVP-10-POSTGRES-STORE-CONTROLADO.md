# MVP-10 — PostgresStore controlado

## Objetivo

Conectar a persistência real em PostgreSQL sem quebrar os MVPs já validados em JSON local.

O MVP-10 não remove o `JsonFileStore`. Ele adiciona o `PostgresStore` como opção controlada e reversível.

## Escopo

- Usar `FITCORE_DATABASE_URL` para localizar o banco.
- Exigir ativação explícita com `FITCORE_PERSISTENCE_STORE=postgres`.
- Verificar a migration antes de ativar o banco como store ativo.
- Manter `JsonFileStore` como fallback seguro.
- Mapear os recursos mínimos:
  - alunos e treinos;
  - revisões do professor;
  - execuções/check-ins;
  - eventos de auditoria LGPD.
- Preparar `tenant_id` e política por papel.
- Expor diagnóstico público seguro em `/api/mvp-10/postgres-store`.

## Arquivos principais

```txt
services/api/persistence/postgres-store.mjs
services/api/persistence/server-adapter-glue.mjs
infra/sql/002-mvp-10-postgres-store.sql
infra/scripts/apply-mvp-10-postgres-store.sh
infra/scripts/verify-mvp-10-postgres-store.sh
apps/site-static/mvp-10.html
```

## Regra de segurança

O PostgresStore só fica ativo quando todas as condições forem verdadeiras:

```txt
FITCORE_DATABASE_URL presente
FITCORE_PERSISTENCE_STORE=postgres
migration MVP-07 aplicada
migration MVP-10 aplicada
PostgresStore.checkReady() retorna ready=true
```

Se qualquer condição falhar, a API continua usando `JsonFileStore`.

## Migration MVP-10

A migration `002-mvp-10-postgres-store.sql` adiciona:

- `source_mvp_id` para rastrear IDs dos MVPs de validação;
- `payload jsonb` para preservar a forma original dos registros;
- índices únicos por `tenant_id + source_mvp_id`;
- `fitcore_schema_migrations` para registrar evolução de schema;
- campos auxiliares de auditoria em `fitcore_audit_events`.

Isso permite migração progressiva: o sistema grava dados úteis no modelo relacional, mas ainda consegue retornar o payload no formato esperado pelas telas atuais.

## Ativação

Preparar sem banco:

```bash
cd /opt/fitcore-pro
bash infra/scripts/apply-mvp-10-postgres-store.sh
```

Aplicar migration com banco:

```bash
cd /opt/fitcore-pro
export FITCORE_DATABASE_URL='postgres://usuario:senha@host:5432/banco?sslmode=require'
bash infra/scripts/apply-mvp-10-postgres-store.sh
```

Ativar no serviço somente depois do verify:

```bash
sudo systemctl edit fitcore-api
```

Adicionar:

```ini
[Service]
Environment=FITCORE_PERSISTENCE_STORE=postgres
Environment=FITCORE_TENANT_SLUG=demo
Environment=FITCORE_DATABASE_URL=postgres://usuario:senha@host:5432/banco?sslmode=require
```

Depois:

```bash
sudo systemctl daemon-reload
sudo systemctl restart fitcore-api
bash infra/scripts/verify-mvp-10-postgres-store.sh
curl -s http://127.0.0.1:8091/api/mvp-10/postgres-store
```

## Rollback

Remover ou comentar:

```txt
FITCORE_PERSISTENCE_STORE=postgres
```

Depois reiniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl restart fitcore-api
```

A API volta para `JsonFileStore`.

## Política LGPD

Nesta fase, o banco recebe somente os dados mínimos já usados pelos MVPs:

- nome visível do aluno;
- nível;
- objetivo/modalidade/foco do treino;
- status de revisão/execução;
- esforço percebido e duração simples;
- eventos mínimos de auditoria.

Não entram nesta fase:

- documento;
- telefone;
- e-mail;
- foto;
- medidas corporais;
- histórico médico;
- dados sensíveis sem base legal.

## Gate de aceite

O MVP-10 só passa quando:

```bash
node --check services/api/persistence/postgres-store.mjs
node --check services/api/persistence/server-adapter-glue.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-10.js
bash infra/scripts/verify-mvp-10-postgres-store.sh
curl -s https://fitcore.marcaia.app/api/mvp-10/postgres-store
curl -I https://fitcore.marcaia.app/mvp-10.html
```
