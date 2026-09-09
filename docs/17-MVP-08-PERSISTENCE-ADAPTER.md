# MVP-08 — Adapter de persistência

## Objetivo

Criar a camada de transição entre a API atual e o banco real, sem quebrar os MVPs já validados.

O FitCore passa a ter um contrato explícito:

```txt
API pública → PersistenceAdapter → JsonFileStore | PostgresStore
```

## Regra principal

- Sem `FITCORE_DATABASE_URL`: usar `JsonFileStore`.
- Com `FITCORE_DATABASE_URL`: preparar `PostgresStore`, mas só ativar depois da migration do MVP-07 ser verificada.
- A resposta pública da API deve continuar estável.
- A UI não deve expor tabela, SQL, credencial, storage interno ou detalhe técnico desnecessário.

## Arquivos implementados

```txt
services/api/persistence/adapter-contract.mjs
apps/site-static/mvp-08.html
apps/site-static/mvp-08.css
apps/site-static/mvp-08.js
infra/scripts/verify-mvp-08-adapter.sh
docs/17-MVP-08-PERSISTENCE-ADAPTER.md
```

## Recursos controlados pelo adapter

| Recurso | Origem atual | Destino real |
| --- | --- | --- |
| Alunos | `storage/mvp-01/aluno-treino.json` | `fitcore_students` |
| Treinos | `storage/mvp-01/aluno-treino.json` | `fitcore_workouts`, `fitcore_workout_days`, `fitcore_workout_exercises` |
| Revisões | `storage/mvp-03/professor-reviews.json` | `fitcore_professor_reviews` |
| Execuções | `storage/mvp-02/checkins.json` | `fitcore_workout_executions`, `fitcore_exercise_execution_items` |
| Auditoria | arrays locais por registro | `fitcore_audit_events` |

## Fallback seguro

O fallback é parte da arquitetura, não gambiarra.

Enquanto o banco não estiver ativo:

- os MVPs 01 a 06 continuam funcionando;
- o MVP-07 permanece documentado e verificável;
- o MVP-08 mostra o modo atual;
- a migração real fica preparada, mas não força risco operacional.

## Validação na VPS

```bash
cd /opt/fitcore-pro
git pull --ff-only origin main
chmod +x infra/scripts/verify-mvp-08-adapter.sh
bash infra/scripts/verify-mvp-08-adapter.sh
node --check apps/site-static/mvp-08.js
bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -I https://fitcore.marcaia.app/mvp-08.html
```

## Próximo passo

O MVP-09 deve conectar o adapter na API real:

```txt
server.mjs → PersistenceAdapter → JsonFileStore primeiro
```

Depois disso, o MVP-10 pode ativar `PostgresStore` com `FITCORE_DATABASE_URL`, migration aplicada, verificação de tabelas e política de rollback.

## Critério de pronto

O MVP-08 só é considerado pronto quando:

- `adapter-contract.mjs` passa em `node --check`;
- `mvp-08.js` passa em `node --check`;
- `verify-mvp-08-adapter.sh` passa;
- `/mvp-08.html` retorna HTTP 200;
- a home mostra navegação limpa, sem quebrar em desktop ou mobile;
- a marca aparece apenas como `FitCore Pro`, sem subtítulo duplicado no topo.
