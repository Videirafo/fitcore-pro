# 12 - MVP-04 Painel do Aluno

## Objetivo

Validar o primeiro fluxo de execução pelo aluno dentro do FitCore Pro.

O aluno deve conseguir:

- visualizar apenas treinos aprovados pelo professor;
- abrir o treino liberado;
- iniciar a execução;
- marcar exercícios como feitos;
- concluir o treino;
- gerar histórico pessoal simples;
- manter privacidade por papel nesta fase do MVP.

## Escopo implementado

Arquivos públicos:

```txt
apps/site-static/mvp-04.html
apps/site-static/mvp-04.css
apps/site-static/mvp-04.js
```

Fluxo usado:

```txt
MVP-01 cria aluno + rascunho de treino
MVP-03 professor revisa e aprova treino
MVP-04 aluno visualiza treino aprovado
MVP-02 registra check-in / execução / conclusão
```

## Endpoints reutilizados

O MVP-04 reutiliza endpoints já existentes, sem criar novo backend paralelo:

```txt
GET  /api/mvp-03/professor/reviews?limit=50
GET  /api/mvp-02/checkins?limit=50
POST /api/mvp-02/checkins
PATCH /api/mvp-02/checkins/:id/status
```

## Regra de privacidade por papel

Nesta fase:

- o aluno só vê treinos com status `aprovado`;
- o aluno não vê tela de revisão do professor;
- o aluno não troca exercícios;
- o aluno registra apenas execução;
- os dados continuam mínimos;
- não há CPF, telefone, e-mail, foto, medidas ou dados médicos;
- histórico é usado apenas para validação do MVP.

## Status de execução

O painel usa os status já definidos no MVP-02:

```txt
planejado
em_execucao
concluido
```

No fluxo da tela:

1. aluno abre treino aprovado;
2. clica em `Iniciar treino`;
3. sistema cria check-in com status `em_execucao`;
4. aluno marca exercícios executados;
5. aluno clica em `Concluir treino`;
6. sistema atualiza check-in para `concluido`;
7. histórico pessoal é atualizado.

## Limitação assumida

O armazenamento ainda é local e temporário em JSON.

Antes de produção real, migrar para banco com:

- tenant;
- usuário autenticado;
- papéis reais;
- RLS/permissões;
- auditoria persistente;
- consentimento e política LGPD formal;
- logs operacionais;
- backup/restore.

## Próximo passo

MVP-05 deve consolidar a base multi-papel:

```txt
gestor
professor
aluno
```

com navegação por perfil, permissões explícitas e trilha de auditoria unificada.
