# MVP-36 — Console interno real por perfil

## Objetivo
Separar definitivamente a landing pública do console operacional e entregar uma experiência interna por papel.

## Entregue
- `/dashboard` como entrada do console autenticado.
- Dashboard do dono/gestor com setup, equipe, alunos, treinos, execuções, LGPD e próximos passos.
- Dashboard do professor com fila de treinos, alunos, progresso e IA contextual.
- Dashboard do aluno com treino do dia, GIFs, execução, evolução e segurança.
- Biblioteca com filtros por músculo/área e busca textual.
- Cards laterais úteis: sessão, próximas ações, IA e LGPD.
- Navegação interna apontando para `/dashboard` para usuários logados.
- Login redirecionando para `/dashboard`.

## Gates
`npm run mvp36:check` valida contrato de UI, navegação, filtros, IA e GIFs.
`infra/scripts/verify-mvp-36-role-console.sh` executa contratos, build, deploy e smoke público.
