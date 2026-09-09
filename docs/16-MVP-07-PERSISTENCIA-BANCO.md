# MVP-07 — Persistência real + banco mínimo

## Objetivo

Tirar o FitCore Pro da validação puramente em arquivo local e preparar a base para PostgreSQL multi-tenant, sem quebrar os MVPs anteriores.

O MVP-07 não força migração imediata da API. Ele cria a estrutura de banco, valida o caminho de aplicação e mantém fallback seguro quando `FITCORE_DATABASE_URL` ainda não estiver configurado.

## Escopo implementado

- Estrutura de banco para alunos.
- Estrutura de banco para treinos.
- Estrutura de banco para dias/blocos do treino.
- Estrutura de banco para exercícios prescritos.
- Estrutura de banco para revisões do professor.
- Estrutura de banco para execuções/check-ins.
- Estrutura de banco para itens executados pelo aluno.
- Tabela de auditoria LGPD.
- `tenant_id` em todas as tabelas operacionais.
- `papel`/`actor_role` para gestor, professor, aluno e sistema.
- RLS habilitado nas tabelas.
- Fallback seguro quando o banco não está configurado.

## Arquivos

```txt
infra/sql/001-mvp-07-core.sql
infra/scripts/apply-mvp-07-db.sh
infra/scripts/verify-mvp-07-db.sh
apps/site-static/mvp-07.html
apps/site-static/mvp-07.css
apps/site-static/mvp-07.js
docs/16-MVP-07-PERSISTENCIA-BANCO.md
```

## Modelo mínimo

| Tabela | Responsabilidade |
| --- | --- |
| `fitcore_tenants` | Tenant/empresa/unidade do cliente |
| `fitcore_users` | Usuários e papéis: gestor, professor, aluno |
| `fitcore_students` | Alunos com dados mínimos |
| `fitcore_workouts` | Treinos por aluno, objetivo e status |
| `fitcore_workout_days` | Dias/blocos do treino |
| `fitcore_workout_exercises` | Exercícios prescritos |
| `fitcore_professor_reviews` | Revisões e aprovação do professor |
| `fitcore_workout_executions` | Execuções/check-ins do treino |
| `fitcore_exercise_execution_items` | Marcação de exercícios feitos |
| `fitcore_audit_events` | Auditoria LGPD mínima por ação |

## Política LGPD

Nesta fase, o FitCore deve continuar evitando dados sensíveis desnecessários.

Não armazenar nesta fase:

- documento;
- telefone;
- e-mail;
- foto;
- medidas corporais;
- dado médico;
- laudo;
- informação clínica.

A auditoria registra apenas o mínimo necessário:

- tenant;
- ator;
- papel;
- recurso;
- ação;
- status;
- data;
- detalhe operacional limitado.

## Aplicação na VPS

Sem banco configurado:

```bash
cd /opt/fitcore-pro
chmod +x infra/scripts/apply-mvp-07-db.sh infra/scripts/verify-mvp-07-db.sh
bash infra/scripts/apply-mvp-07-db.sh
```

Resultado esperado:

```txt
MVP-07 em fallback seguro: banco não configurado.
```

Com banco configurado:

```bash
cd /opt/fitcore-pro
export FITCORE_DATABASE_URL='postgres://usuario:senha@host:5432/fitcore'
bash infra/scripts/apply-mvp-07-db.sh
bash infra/scripts/verify-mvp-07-db.sh
```

## Fallback seguro

Se `FITCORE_DATABASE_URL` não existir, o script cria:

```txt
storage/mvp-07/db-status.json
```

Nesse modo:

- a API atual continua funcionando;
- os MVPs 01 a 06 continuam usando JSON local;
- nenhum dado é perdido;
- nenhuma migration parcial é aplicada;
- o próximo passo fica explícito.

## Próximo passo técnico

O MVP-08 deve criar o adaptador de persistência da API:

```txt
API → PersistenceAdapter → PostgresStore | JsonFileStore
```

Regra:

- se `FITCORE_DATABASE_URL` existir, usar PostgreSQL;
- se não existir, usar JSON local;
- manter a mesma resposta pública da API;
- registrar auditoria em todos os fluxos sensíveis;
- não expor tabela, SQL, credencial ou estrutura interna na UI do cliente.
