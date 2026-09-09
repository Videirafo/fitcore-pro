# MVP-34 — Super Premium Console

Status: implementação canônica da Issue #9.

## Objetivo

Transformar a entrada e o workspace do FitCore em uma experiência premium de produto, sem criar um segundo design system e sem mascarar dados inexistentes.

## Arquitetura de interface

- `globals.css`: base histórica e contratos de compatibilidade.
- `premium-console.css`: composição visual premium, responsividade e motion seguro.
- `FitCoreAppShell`: shell único.
- `FitCoreNavClient`: navegação por papel e por domínio.
- `FitCoreRouteClient`: superfícies operacionais, IA, Coach e entrada principal.

## Entrada principal

Visitante recebe uma landing operacional própria com CTA para cadastro/login e preview do sistema. Usuário autenticado recebe centro de comando com dados reais da unidade, Coach, IA e ações por papel.

## Coach + IA

MVP-32 permanece como Agent Workspace. MVP-33 permanece como Evidence-First Coach. O MVP-34 apenas organiza e expõe essas capacidades no shell premium.

## Mídia e licenças

A UI não referencia GIFs do `hasaneyldrm/exercises-dataset`. A política do projeto continua bloqueando mídia externa sem licença comercial/proveniência aprovada. Os cards usam orientação visual source-owned do FitCore.

## Dados

Não exibir retenção, receita, aderência ou esforço inventados. Quando uma fonte real não existe, a interface mostra `—`, `A configurar` ou uma mensagem equivalente.

## Responsividade

Desktop, tablet e mobile usam as mesmas rotas e hierarquia. Ângulos e composições decorativas são removidos/reduzidos em telas pequenas e em `prefers-reduced-motion`.

## Gate

Local e CI usam o mesmo contrato:

```bash
npm run mvp34:verify
npm audit --prefix apps/site --audit-level=high
```

Workflow: `.github/workflows/fitcore-ci.yml`.
