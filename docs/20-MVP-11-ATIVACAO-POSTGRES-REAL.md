# MVP-11 — Ativação controlada do PostgreSQL real

## Objetivo

Ativar persistência real do FitCore Pro em um PostgreSQL dedicado, sem misturar com o banco interno do wger, Supabase, Evolution ou Alma.

A regra deste gate é:

```txt
FitCore API → PersistenceAdapter → PostgresStore → PostgreSQL dedicado FitCore
```

Rollback preservado:

```txt
remover FITCORE_PERSISTENCE_STORE=postgres → voltar para JsonFileStore
```

## Decisão técnica

Criar um PostgreSQL dedicado para o FitCore:

```txt
container: fitcore_postgres
host: 127.0.0.1
porta: 55435
database: fitcore
user: fitcore_app
```

Motivo:

- não acoplar o SaaS FitCore ao banco interno do wger;
- não reutilizar bancos de outros sistemas já em produção;
- reduzir risco de migração acidental;
- permitir backup, restore e rollback próprios;
- preparar multi-tenant real.

## Arquivos

```txt
infra/docker/fitcore-postgres.compose.yml
infra/scripts/setup-mvp-11-fitcore-postgres.sh
infra/scripts/activate-mvp-11-postgres-store.sh
infra/scripts/rollback-mvp-11-json-store.sh
infra/scripts/verify-mvp-11-postgres-activation.sh
docs/20-MVP-11-ATIVACAO-POSTGRES-REAL.md
```

## Execução segura

### 1. Subir banco dedicado e aplicar migrations

```bash
cd /opt/fitcore-pro

git pull --ff-only origin main
chmod +x infra/scripts/setup-mvp-11-fitcore-postgres.sh \
  infra/scripts/activate-mvp-11-postgres-store.sh \
  infra/scripts/rollback-mvp-11-json-store.sh \
  infra/scripts/verify-mvp-11-postgres-activation.sh

bash infra/scripts/setup-mvp-11-fitcore-postgres.sh
```

Esse passo:

- cria segredo local em `storage/secrets/fitcore-postgres.env`;
- sobe `fitcore_postgres`;
- aplica `infra/sql/001-mvp-07-core.sql`;
- aplica `infra/sql/002-mvp-10-postgres-store.sql`;
- valida tabelas e tenant `demo`.

### 2. Ativar PostgresStore na API

```bash
bash infra/scripts/activate-mvp-11-postgres-store.sh
```

Esse passo:

- cria drop-in systemd em `/etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf`;
- define `FITCORE_DATABASE_URL`;
- define `FITCORE_PERSISTENCE_STORE=postgres`;
- reinicia `fitcore-api`;
- valida se `/api/mvp-10/postgres-store` mostra `active_store: PostgresStore`;
- faz rollback automático se a ativação falhar.

### 3. Verificar

```bash
bash infra/scripts/verify-mvp-11-postgres-activation.sh

curl -s https://fitcore.marcaia.app/api/mvp-10/postgres-store
curl -s https://fitcore.marcaia.app/api/health | grep -E "PostgresStore|mvp_10|fallback_seguro" -n
```

## Critério de pronto

O MVP-11 só está pronto quando:

- `fitcore_postgres` está healthy;
- migrations MVP-07 e MVP-10 foram aplicadas;
- tenant `demo` existe;
- `fitcore-api` está ativa;
- `/api/mvp-10/postgres-store` retorna `active_store: PostgresStore`;
- `/api/health` confirma PostgresStore;
- rollback para JsonFileStore está disponível.

## Rollback manual

```bash
bash infra/scripts/rollback-mvp-11-json-store.sh
```

Ou manualmente:

```bash
rm -f /etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf
systemctl daemon-reload
systemctl restart fitcore-api
```

## Política LGPD

O MVP-11 mantém a política de dados mínimos:

```txt
sem documento, telefone, e-mail, foto, medidas corporais ou dado médico nesta fase
```

A auditoria persistida registra ação, papel, recurso, status e detalhe mínimo.

## Próximo gate

MVP-12:

```txt
Smoke real de escrita/leitura no PostgresStore
→ criar aluno
→ criar treino
→ criar revisão professor
→ aprovar treino
→ iniciar check-in
→ concluir execução
→ conferir tabelas
→ conferir auditoria LGPD
```
