# 11 - MVP-03 Painel do Professor

## Decisão

O terceiro MVP funcional do FitCore Pro é a tela do professor para revisão e aprovação de treinos.

A meta desta etapa é validar o fluxo:

```txt
aluno + treino criado no MVP-01
→ professor seleciona o aluno
→ professor revisa o treino
→ professor altera exercício
→ professor aprova treino
→ histórico por aluno
→ auditoria por ação
```

## Escopo incluído

- Página `/mvp-03.html`.
- Contexto do professor com alunos do MVP-01, revisões e check-ins.
- Criação de revisão a partir de um rascunho de treino.
- Substituição de exercício por busca no catálogo normalizado.
- Aprovação de treino.
- Histórico das últimas revisões.
- Auditoria mínima por ação.
- Layout responsivo para desktop, tablet e celular.

## Endpoints

```txt
GET   /api/mvp-03/status
GET   /api/mvp-03/professor/contexto
GET   /api/mvp-03/professor/reviews
POST  /api/mvp-03/professor/reviews
GET   /api/mvp-03/professor/reviews/:id
PATCH /api/mvp-03/professor/reviews/:id/exercises
PATCH /api/mvp-03/professor/reviews/:id/approve
```

## Armazenamento local

```txt
storage/mvp-03/professor-reviews.json
```

Este armazenamento é temporário para validação. Antes de produção, migrar para banco multi-tenant com autenticação, RLS/permissões, auditoria persistente e política de retenção.

## Política LGPD

Nesta fase, o professor visualiza e altera somente dados mínimos:

- nome simples do aluno;
- nível;
- objetivo;
- modalidade;
- blocos do treino;
- exercícios;
- observações de revisão;
- status da revisão.

Não registrar CPF, telefone, e-mail, endereço, documentos, fotos, medidas corporais, limitações médicas, diagnósticos ou qualquer dado sensível nesta etapa.

## Auditoria mínima

Cada ação gera evento com:

- tipo;
- papel;
- status;
- ID do registro;
- detalhe mínimo;
- data/hora;
- regra LGPD da fase.

## Próximos passos

1. Criar autenticação e papéis reais.
2. Relacionar aluno, treino, revisão e check-in por ID persistente.
3. Criar painel do aluno.
4. Criar painel do gestor.
5. Migrar armazenamento para PostgreSQL.
6. Adicionar permissões por tenant.
7. Adicionar logs de auditoria persistentes.
