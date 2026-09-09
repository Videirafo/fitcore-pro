# MVP-23 — Cadastro operacional de aluno real

## Objetivo

Transformar o aluno em entidade operacional completa do tenant, e não apenas em payload de rascunho de treino.

## Fluxo entregue

```txt
gestor/professor logado
→ cria aluno no tenant atual
→ aluno recebe código interno, objetivo, frequência, status e vínculos
→ listagem mostra apenas alunos do tenant da sessão
→ acesso cruzado é bloqueado
→ auditoria fica vinculada ao tenant_id
```

## Escopo

- cadastro real em `fitcore_students`;
- vínculo opcional com usuário aluno (`fitcore_users.papel='aluno'`);
- vínculo opcional com professor do tenant;
- objetivo, modalidade preferida, frequência semanal, nível, etiquetas e status;
- listagem por tenant, busca e filtro por status;
- detalhe por ID com bloqueio por tenant;
- alteração de status;
- auditoria em `fitcore_student_events` e `fitcore_audit_events`;
- proteção por sessão assinada: gestor/professor;
- tela `/mvp-23.html` com CSS/JS próprios;
- página Next `apps/site/app/mvp-23/page.tsx` pronta para migração gradual.

## Arquivos

```txt
services/api/security/student-management.mjs
infra/sql/009-mvp-23-student-management.sql
infra/scripts/apply-mvp-23-student-management.sh
infra/scripts/verify-mvp-23-student-management.sh
infra/scripts/rollback-mvp-23-student-management.sh
apps/site-static/mvp-23.html
apps/site-static/mvp-23.css
apps/site-static/mvp-23.js
apps/site/app/mvp-23/page.tsx
```

## Endpoints

```txt
GET  /api/mvp-23/status
GET  /api/mvp-23/students
POST /api/mvp-23/students
GET  /api/mvp-23/students/:id
POST /api/mvp-23/students/:id/status
PATCH /api/mvp-23/students/:id/status
```

## Critério de pronto

- MVP-23 ativo em `/api/mvp-23/status`;
- gestor/professor criam aluno no tenant atual;
- aluno logado não acessa gestão de alunos;
- listagem não permite `tenant_slug` diferente da sessão;
- detalhe por ID retorna só dados do próprio tenant;
- alteração de status persiste no PostgreSQL;
- auditoria de aluno e auditoria geral persistem;
- `/mvp-23.html` responde 200;
- contrato de assets estáticos e Next passa.

## Próximo gate

MVP-24:

```txt
Prescrição real de treino vinculada ao aluno
→ treino nasce a partir do aluno real
→ professor responsável revisa
→ aluno vê somente o próprio treino
→ status e auditoria por tenant
```
