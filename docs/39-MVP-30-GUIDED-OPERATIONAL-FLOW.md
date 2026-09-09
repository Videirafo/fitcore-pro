# MVP-30 — Dados operacionais guiados por fluxo

Status: concluído e validado em produção.

## Objetivo

Transformar as rotas Next operacionais em um fluxo de produto: criar negócio, configurar equipe, cadastrar aluno, prescrever treino, executar e acompanhar evolução sem copiar IDs manualmente.

## Entrega funcional

- Gestor cria o negócio e é direcionado para o setup guiado de equipe.
- Criação de professor e aluno acontece dentro do tenant atual.
- Cadastro operacional de aluno permite selecionar professor responsável por dropdown.
- Cadastro de aluno avança para a prescrição com o aluno já selecionado.
- Prescrição escolhe aluno real por dropdown.
- Execução do aluno lista treinos liberados e sessões em andamento sem exigir ID manual.
- Evolução abre com dados corretos conforme sessão e papel.
- Blocos de JSON cru foram removidos da interface; ações mostram resumo humano.

## Segurança preservada

- Sessão assinada continua obrigatória nas rotas operacionais.
- RBAC continua definindo visibilidade de ações.
- API própria, PostgreSQL e auditoria por tenant permanecem ativos.

## Validação

```bash
npm run mvp30:check
bash infra/scripts/verify-mvp-30-guided-operational-flow.sh
```
