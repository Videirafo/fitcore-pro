# MVP-25 — Execução real do treino pelo aluno

## Objetivo

Permitir que o aluno execute um treino aprovado, com progresso por exercício, esforço, duração, conclusão e acompanhamento por gestor/professor.

## Fluxo entregue

```txt
aluno com sessão assinada
→ lista treinos aprovados do próprio usuário
→ inicia execução
→ marca exercícios como feitos
→ registra esforço/duração
→ conclui treino
→ gestor/professor acompanha execução no tenant
→ auditoria fica vinculada ao tenant_id
```

## Endpoints

```txt
GET  /api/mvp-25/status
GET  /api/mvp-25/executions
GET  /api/mvp-25/my-executions
POST /api/mvp-25/executions/start
GET  /api/mvp-25/executions/:id
POST /api/mvp-25/executions/:id/exercises/:index/done
POST /api/mvp-25/executions/:id/finish
```

## Critério de pronto

- aluno inicia apenas treino aprovado e pertencente ao próprio usuário;
- aluno marca exercício como feito;
- aluno registra esforço e duração ao concluir;
- outro aluno não vê execução que não pertence a ele;
- gestor/professor acompanha execuções do tenant;
- bloqueio de tenant cruzado retorna 403;
- eventos ficam em `fitcore_workout_execution_events` e `fitcore_audit_events`;
- `/mvp-25.html` tem CSS/JS conectados;
- página Next `/mvp-25` existe para migração gradual.

## Próximo gate

MVP-26 — histórico e evolução do aluno.
