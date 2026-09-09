# MVP-09 — Server conectado ao PersistenceAdapter

## Objetivo

Conectar `services/api/server.mjs` ao `PersistenceAdapter`, mantendo o JSON local como fallback seguro enquanto o banco real ainda não está ativo.

A regra do MVP-09 é simples:

```txt
server.mjs → PersistenceAdapter → JsonFileStore
```

O `PostgresStore` continua preparado para o MVP-10, mas não é ativado automaticamente só porque `FITCORE_DATABASE_URL` existe.

## Arquivos

```txt
services/api/persistence/server-adapter-glue.mjs
infra/scripts/apply-mvp-09-adapter.sh
infra/scripts/verify-mvp-09-adapter.sh
docs/18-MVP-09-SERVER-PERSISTENCE-ADAPTER.md
```

## O que muda no servidor

O `server.mjs` deixa de chamar diretamente os arquivos JSON nos wrappers de domínio e passa a chamar o adapter:

```txt
readMvpRecords()          → persistenceAdapter.readArray("studentsAndWorkouts")
writeMvpRecords(records)  → persistenceAdapter.writeArray("studentsAndWorkouts", records)
readCheckins()            → persistenceAdapter.readArray("checkins")
writeCheckins(records)    → persistenceAdapter.writeArray("checkins", records)
readProfessorReviews()    → persistenceAdapter.readArray("professorReviews")
writeProfessorReviews()   → persistenceAdapter.writeArray("professorReviews", records)
```

## Endpoint de diagnóstico

Depois de aplicar o MVP-09, a API deve expor:

```txt
GET /api/mvp-09/persistence
```

Resposta esperada nesta fase:

```json
{
  "ok": true,
  "mvp": "MVP-09 Server Persistence Adapter",
  "server_connected": true,
  "selected_store": "JsonFileStore",
  "active_store": "JsonFileStore",
  "fallback_seguro": true
}
```

## Aplicação na VPS

```bash
cd /opt/fitcore-pro

git pull --ff-only origin main
chmod +x infra/scripts/apply-mvp-09-adapter.sh infra/scripts/verify-mvp-09-adapter.sh

bash infra/scripts/apply-mvp-09-adapter.sh
node --check services/api/server.mjs
node --check services/api/persistence/server-adapter-glue.mjs

systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

bash infra/scripts/verify-mvp-09-adapter.sh
curl -s https://fitcore.marcaia.app/api/mvp-09/persistence
curl -s https://fitcore.marcaia.app/api/health | grep -E "mvp_09|PersistenceAdapter|JsonFileStore" -n
```

## Critério de pronto

O MVP-09 só está pronto quando:

- `server.mjs` passa em `node --check`;
- `server-adapter-glue.mjs` passa em `node --check`;
- o serviço `fitcore-api` reinicia sem erro;
- `/api/mvp-09/persistence` retorna `server_connected: true`;
- `/api/health` mostra `mvp_09` e `persistence`;
- MVPs 01, 02 e 03 continuam usando JSON local via adapter;
- nenhum dado sensível novo é coletado nesta fase.

## Próximo gate

MVP-10:

```txt
PostgresStore controlado
→ usar FITCORE_DATABASE_URL
→ verificar migration MVP-07 antes de ativar
→ leitura/gravação real nas tabelas mínimas
→ fallback JSON mantido para rollback
→ auditoria LGPD persistida em tabela
```
