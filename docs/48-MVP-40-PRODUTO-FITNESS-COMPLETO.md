# MVP-40 — Produto fitness completo por necessidade real

## Objetivo

Transformar o FitCore Pro em uma operação fitness completa, não apenas uma interface de treinos.

O sistema deve atender três perfis principais:

- **Dono/gestor:** operação, equipe, receita, retenção, agenda, relatórios e segurança.
- **Professor:** alunos, prescrições, execuções, evolução, pendências e apoio de IA.
- **Aluno:** treino aprovado, execução com GIF, histórico, evolução e portal simples.

## Módulos adicionados à experiência pública

A landing passa a apresentar módulos sérios e alinhados ao nicho:

1. Agenda, aulas e avaliações.
2. Planos, pagamentos e inadimplência.
3. CRM de leads e alunos inativos.
4. WhatsApp, email e automações.
5. Ficha física e anamnese.
6. Fotos, medidas e evolução.
7. Portal do aluno.
8. IA de prescrição e retenção.

## Diretriz visual

- Não usar glyph solto como elemento principal.
- Não usar ilustração genérica sem contexto operacional.
- Preferir miniaturas de produto, gráficos, calendário, ficha, pagamento, CRM, automação e portal.
- Logo FC deve ser legível, próprio e consistente com o shell.
- Landing pública deve continuar separada do console interno.

## Gates

- `npm run mvp38:check`
- `npm run mvp40:check`
- `npm run all:ui-gates`
- `npm --prefix apps/site run build`
- `bash infra/scripts/switch-fitcore-to-next-shell.sh`

## Observação

Os GIFs de exercícios continuam servidos como mídia operacional no servidor em `/media/exercises/*.gif`. Eles não devem ser copiados para o Git quando houver risco de licença/tamanho.
