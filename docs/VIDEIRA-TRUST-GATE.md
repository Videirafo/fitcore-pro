# VIDEIRA TRUST GATE v1

O Trust Gate é um gate de release fail-closed para sistemas que processam dados, executam automações ou delegam ações a agentes.

## Cadeia de confiança

Human / Agent / Service
→ Identity / Auth
→ Tenant Boundary
→ RBAC + Capability
→ RLS ou autorização por registro
→ Data / API / Tools
→ Audit + Privacy/LGPD + Retention
→ Backup + Restore + Evidence

## Regras obrigatórias

1. Identidade individual: nenhuma credencial humana compartilhada como autoridade.
2. Autorização server-side: esconder UI nunca conta como controle.
3. Tenant boundary: tenant/resource vem da identidade autenticada e do servidor, nunca de input confiado do cliente.
4. Least privilege: humanos, agentes e serviços recebem somente capabilities necessárias.
5. Record scope: RLS ou autorização equivalente impede leitura/escrita fora do escopo.
6. Sessão: logout/revogação deve invalidar o caminho server-side; refresh deve ser limitado/rotacionado quando aplicável.
7. CSRF/origin: mutações autenticadas por cookie exigem same-origin ou defesa equivalente.
8. Secrets: nenhum secret/token/chave privada no bundle, logs ou Git.
9. Audit: registrar ator, tenant/escopo, ação, recurso, resultado e correlação sem registrar credenciais.
10. Privacy/LGPD: minimizar dados enviados a terceiros/IA, controlar retenção e suportar exportação/correção/exclusão quando aplicável.
11. Recovery: backup não é suficiente; restore deve ser verificável e produzir evidência.
12. AI safety: agentes não podem ampliar privilégios, escolher tenant arbitrariamente ou contornar approval/policy.

## Evidência

O arquivo `security/trust-gate.json` declara controles bloqueantes e evidências versionadas. `npm run trust:gate` valida:
- todos os controles bloqueantes em estado `enforced`;
- existência das evidências declaradas;
- ausência de arquivos sensíveis versionados;
- ausência de padrões óbvios de wildcard CORS ou chaves privadas nas superfícies de runtime declaradas.

Controles ainda não comprovados devem ficar em `advisory_controls` com estado `partial` ou `planned`; nunca devem ser marcados como `enforced` apenas por existir documentação.

## Release

Nenhuma mudança sensível deve ir para produção somente porque compila. O fluxo continua:
Issue → branch → implementação → Trust Gate + testes → PR → CI → merge → deploy por SHA → health/smoke → evidência → rollback conhecido.
