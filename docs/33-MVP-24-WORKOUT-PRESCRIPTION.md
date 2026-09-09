# MVP-24 — Prescrição real de treino vinculada ao aluno

## Objetivo

Criar o fluxo operacional de prescrição de treino a partir do aluno real do tenant, com professor responsável, revisão, visão restrita do aluno e auditoria por tenant.

## Fluxo entregue

```txt
gestor/professor logado
→ seleciona aluno real do tenant
→ cria prescrição de treino
→ professor responsável revisa/aprova ou solicita ajustes
→ aluno logado vê somente o próprio treino
→ status e auditoria ficam vinculados ao tenant_id
```

## Escopo

- treino nasce vinculado a `fitcore_students.id`;
- prescrição usa `fitcore_workouts` com `payload` estruturado;
- revisão usa `fitcore_professor_reviews`;
- eventos operacionais entram em `fitcore_workout_prescription_events`;
- auditoria entra em `fitcore_audit_events`;
- gestor vê prescrições do tenant;
- professor vê prescrições atribuídas a ele;
- aluno vê somente treinos ligados ao próprio `user_id`;
- acesso cruzado entre tenants fica bloqueado;
- `/mvp-24.html` tem CSS/JS próprios conectados;
- `apps/site/app/mvp-24/page.tsx` prepara a migração Next.

## Endpoints

```txt
GET  /api/mvp-24/status
GET  /api/mvp-24/prescriptions
POST /api/mvp-24/prescriptions
GET  /api/mvp-24/prescriptions/:id
POST /api/mvp-24/prescriptions/:id/review
GET  /api/mvp-24/my-workouts
```

## Critério de pronto

- MVP-24 ativo em `/api/mvp-24/status`;
- tenant novo criado por onboarding;
- aluno real criado e vinculado a usuário aluno;
- prescrição nasce a partir do aluno real;
- professor responsável consegue aprovar;
- aluno logado vê somente o próprio treino;
- outro aluno não vê treino que não pertence a ele;
- gestor vê dados do tenant sem cruzamento;
- auditoria por tenant é persistida;
- home, health, front estático e shell Next estão atualizados.

## Próximo gate

MVP-25:

```txt
Execução real do treino pelo aluno
→ aluno inicia treino aprovado
→ marca exercícios como feitos
→ registra esforço/duração
→ professor acompanha evolução
→ auditoria por tenant
```
