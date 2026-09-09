# 13 - MVP-05 Papéis e Navegação

## Objetivo

Validar a primeira camada de navegação por perfil dentro do FitCore Pro.

O MVP-05 organiza três papéis iniciais:

```txt
gestor
professor
aluno
```

A proposta é separar o que cada perfil vê antes de implementar autenticação real, tenant, RLS e banco persistente.

## Fluxo consolidado

```txt
MVP-01 -> cria aluno + rascunho de treino
MVP-03 -> professor revisa e aprova treino
MVP-04 -> aluno executa treino aprovado
MVP-02 -> registra check-in e histórico
MVP-05 -> organiza navegação, permissões simuladas e auditoria unificada
```

## Arquivos criados

```txt
apps/site-static/mvp-05.html
apps/site-static/mvp-05.css
apps/site-static/mvp-05.js
```

## Escopo do MVP-05

A tela entrega:

- alternância entre perfil gestor, professor e aluno;
- menu por perfil;
- permissões simuladas;
- matriz de acesso;
- resumo de alunos, treinos aprovados, check-ins e eventos;
- auditoria unificada a partir dos MVPs anteriores;
- layout flexível para desktop e mobile.

## Permissões simuladas

### Gestor

Pode:

- ver indicadores gerais;
- criar aluno e rascunho de treino;
- acompanhar revisões do professor;
- ver check-ins de alunos;
- consultar auditoria mínima consolidada.

### Professor

Pode:

- ver alunos com treino gerado;
- abrir revisão de treino;
- trocar exercício quando necessário;
- aprovar treino para execução;
- acompanhar check-ins relacionados à prescrição.

### Aluno

Pode:

- ver somente treino aprovado;
- iniciar treino liberado;
- marcar exercícios como feitos;
- concluir treino;
- ver histórico pessoal simples.

Não pode:

- revisar treino;
- trocar exercício;
- aprovar treino;
- acessar auditoria operacional completa.

## Auditoria unificada

Nesta fase, a auditoria é montada na interface usando os eventos já gerados pelos MVPs anteriores:

```txt
/api/mvp-01/aluno-treino
/api/mvp-02/checkins
/api/mvp-03/professor/reviews
```

Os eventos continuam mínimos e sem dados sensíveis desnecessários.

## Regra LGPD desta fase

O MVP-05 não adiciona CPF, telefone, e-mail, foto, medidas ou dados médicos.

A separação por papel é apenas uma simulação de produto. Antes de produção, será necessário implementar:

- autenticação real;
- usuário vinculado a tenant;
- papéis persistentes;
- permissões no backend;
- RLS no banco;
- auditoria persistente;
- consentimento e política LGPD formal;
- logs e retenção configuráveis.

## Próximo passo

MVP-06 deve iniciar a migração da base temporária em JSON para um modelo persistente:

```txt
tenants
users
roles
students
workouts
workout_reviews
workout_checkins
audit_events
```

A partir do MVP-06, as permissões precisam começar a sair do front e entrar na API/banco.
