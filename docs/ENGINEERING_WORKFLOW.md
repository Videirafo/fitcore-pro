# Engineering Workflow — FitCore Pro

Este repositório adota **Programação Vibe + Videira Master Context** como padrão de engenharia.

## Perfil
**Plataforma fitness multi-tenant, mobile-first e orientada por evidências — nível completo.**

## Fluxo
Ideia → pesquisa → usuário → requisito → arquitetura → UX → regras → tarefas → implementação → testes → segurança → review → preview/QA → produção → métricas → iteração.

Por funcionalidade:
**Ler → Compreender → Planejar → Implementar → Testar → Revisar → Corrigir → Commit → Atualizar documentação.**

## Fontes de verdade
- `docs/00-MAPA-DO-PROJETO.md`
- `docs/01-ARQUITETURA.md`
- `docs/02-ROADMAP.md`
- documentos MVP numerados em `docs/`
- `docs/08-LGPD-SECURITY.md`
- `docs/design/` e `docs/brand/`
- `AGENTS.md`
- `tests/` e `playwright.config.mjs`
- `.env.example`

## Regras específicas
- Todo dado deve respeitar tenant, papel e autorização do servidor.
- Fluxos de treino devem ser verificáveis ponta a ponta: prescrição → execução → persistência → evolução.
- Mobile é requisito de primeira classe: toque, estados offline/erro, tamanhos mínimos e performance.
- Decisões inteligentes devem separar decisão, confiança, explicação e ação.
- Dados e métricas não devem ser inventados quando a fonte real estiver indisponível.
- Mudanças de esquema exigem migration, compatibilidade e teste de autorização.

## Gate mínimo
Lint/typecheck/testes/unit/integration/E2E aplicáveis → build → segurança → QA mobile/desktop → preview → merge → deploy por SHA → smoke → evidência.

## Quando usar cada parte
- Nova tela → UX/design + E2E responsivo.
- Nova regra de treino → requisito + domínio + testes.
- Auth/RBAC/tenant → arquitetura + segurança + testes negativos.
- Persistência/Postgres → ADR/migration + integração + rollback.
- IA/Decision Intelligence → contrato tipado + avaliação + confiança + observabilidade.
- Release mobile → checklist de plataforma + performance + compatibilidade + smoke.
