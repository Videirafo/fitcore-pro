# MVP-27 — Shell Next real e rotas limpas

Status: concluído e validado em produção.

## Objetivo

Substituir a experiência de páginas soltas por um shell Next.js real com rotas limpas e layout único.

## Rotas públicas do produto

- `/`
- `/login`
- `/onboarding`
- `/equipe`
- `/alunos`
- `/treinos`
- `/execucao`
- `/evolucao`

## Entrega

- Layout único em Next.
- Sidebar profissional.
- Header operacional.
- Rotas limpas para os módulos principais.
- API, sessão assinada, RBAC e PostgreSQL preservados.
- Compatibilidade temporária com `/mvp-xx.html` preservada para rollback e validação.
- Nginx roteando produto principal para Next e API para `fitcore-api`.

## Deploy

Serviço systemd:

```bash
systemctl status fitcore-next
```

Script canônico:

```bash
bash infra/scripts/switch-fitcore-to-next-shell.sh
```

Verificação:

```bash
bash infra/scripts/verify-mvp-27-next-shell.sh
```
