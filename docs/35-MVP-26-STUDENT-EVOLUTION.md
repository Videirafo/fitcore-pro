# MVP-26 — Histórico e evolução do aluno

Status: concluído e validado em produção.

## Objetivo

Entregar histórico e evolução real do aluno a partir das execuções de treino já gravadas no PostgreSQL.

## Entrega funcional

- Histórico de execuções por aluno.
- Evolução por treino.
- Esforço médio.
- Duração média.
- Frequência semanal.
- Painel do professor e gestor com progresso dos alunos.
- Gráfico semanal e tabela de alunos por unidade.
- Aluno vê somente a própria evolução.
- Professor vê alunos sob responsabilidade dele.
- Gestor vê a operação completa da própria unidade.
- Bloqueio de acesso cruzado entre unidades.
- Auditoria por unidade em PostgreSQL.

## Front profissional

Além do MVP-26, este gate reorganiza a apresentação visual do produto:

- shell visual compartilhado em `apps/site-static/fitcore-system.css`;
- home reescrita com linguagem de produto, sem termos técnicos internos;
- logo corrigido para `FC`, sem duplicação visual;
- navegação compacta e alinhada;
- fundo sem grade interferindo na leitura;
- cards, botões, espaçamentos e tabelas padronizados;
- CSS/JS conectados e verificados nos módulos operacionais.

## Endpoints

- `GET /api/mvp-26/status`
- `GET /api/mvp-26/evolution`
- `GET /api/mvp-26/my-evolution`
- `GET /api/mvp-26/students/:id/evolution`

## Segurança

O acesso depende de sessão real. A API usa o papel e a unidade da sessão assinada para filtrar dados.

- Aluno: própria evolução.
- Professor: alunos vinculados.
- Gestor: visão completa da unidade.

## Validação

Script canônico:

```bash
bash infra/scripts/verify-mvp-26-student-evolution.sh
```

O verificador cria um cenário real usando os gates anteriores, executa treino, consulta evolução, confirma bloqueios de acesso e valida publicação da home e da página de evolução.
