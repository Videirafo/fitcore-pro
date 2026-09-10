# MVP-37 — Dados reais no dashboard por perfil

## Objetivo
Centralizar o dashboard operacional em um endpoint de API, em vez de montar a tela inicial do console com múltiplas chamadas soltas no cliente.

## Entregue
- `GET /api/mvp-37/status`
- `GET /api/mvp-37/dashboard`
- dashboard consolidado por papel: gestor, professor e aluno
- KPIs reais por tenant
- treino aprovado automático para aluno
- fila operacional real para professor
- resumo executivo real para gestor
- contexto de IA filtrado por tenant e papel
- fallback visual reduzido quando já existem dados reais

## Segurança
O dashboard exige sessão assinada e usa o contexto resolvido pela API: `tenant_id`, `actor_id` e `actor_role`. A UI não decide o papel final.

## Gates
```bash
cd /opt/fitcore-pro
npm run mvp37:check
bash infra/scripts/verify-mvp-37-real-role-dashboard.sh
```
