# MVP-31 — Setup guiado pós-criação do negócio

Status: concluído e validado em produção.

## Objetivo

Depois de criar uma unidade fitness, o gestor entra em um setup guiado com etapas reais da operação:

1. Criar professor.
2. Criar aluno.
3. Prescrever treino.
4. Executar treino.
5. Ver evolução.

## Entrega funcional

- Rota Next `/setup`.
- Rota Next `/convite` para aceite de convite.
- Progresso salvo por `tenant_id` em PostgreSQL.
- Checklist calculado por dados reais da unidade.
- Convite agora aponta para rota limpa `/convite`.
- Dashboard deixa de depender de páginas soltas.
- API, sessão assinada, RBAC e PostgreSQL preservados.

## Endpoints

- `GET /api/mvp-31/status`
- `GET /api/mvp-31/setup`
- `POST /api/mvp-31/setup/event`

## Tabelas

- `fitcore_tenant_setup_progress`
- `fitcore_tenant_setup_events`

## Validação

```bash
bash infra/scripts/verify-mvp-31-guided-setup.sh
```

O verificador valida build Next, rotas limpas, setup, convite, progresso 100% em cenário real e persistência/auditoria no PostgreSQL.
