# MVP-28 — UI operacional real em Next

Status: concluído.

## Objetivo

Substituir a experiência visual baseada nas telas HTML antigas por uma UI operacional real em Next/React nas rotas limpas do produto.

## Rotas operacionais

- `/login`
- `/onboarding`
- `/equipe`
- `/alunos`
- `/treinos`
- `/execucao`
- `/evolucao`

## Entrega

- Formulários nativos em React para login, onboarding, equipe, alunos, treinos, execução e evolução.
- Estados de carregamento, erro, sucesso e feedback de ação.
- Dashboard único por papel.
- Shell com sidebar e header únicos.
- Nenhuma rota limpa depende visualmente de `/mvp-xx.html`.
- APIs existentes preservadas.
- Sessão assinada, RBAC e PostgreSQL preservados.

## Componentes principais

- `apps/site/components/FitCoreRouteClient.tsx`
- `apps/site/components/FitCoreAppShell.tsx`
- `apps/site/app/globals.css`

## Validação

```bash
bash infra/scripts/verify-mvp-28-next-operational-ui.sh
```

O verificador confirma build Next, rotas limpas, headers do shell Next, API própria, sessão/RBAC, PostgreSQL e mídia de exercícios.
