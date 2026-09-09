# MVP-29 — UX operacional premium por papel

Status: concluído e validado em produção.

## Objetivo

Transformar as rotas Next em uma experiência operacional por papel, sem excesso visual, com ações corretas para gestor, professor e aluno.

## Entrega

- Gestor vê dashboard executivo com equipe, alunos, treinos, execução e evolução.
- Professor vê foco em alunos, treinos pendentes, execução e progresso.
- Aluno vê treino do dia, execução e evolução própria.
- Visitante vê apenas criação de negócio e login.
- Navegação ativa por rota.
- Navegação filtrada por papel.
- Header com ações coerentes com o papel logado.
- Estados profissionais de carregamento, erro, vazio e sucesso.
- Mobile refinado com navegação horizontal e layout responsivo.
- Ações não permitidas ficam escondidas na UI, mantendo RBAC no backend como autoridade final.

## Validação

```bash
bash infra/scripts/verify-mvp-29-role-premium-ux.sh
```

O verificador confirma contrato Next, UX por papel, build, serviço Next, API própria, PostgreSQL, sessão/RBAC, rotas limpas e mídia preservada.
