# Open-Source Capability Layer — Issue #14

## Objetivo

Evoluir o FitCore com capacidades auditadas de seis projetos sem criar um segundo core, sem colocar processamento pesado no Flutter e sem ampliar permissões de agentes implicitamente.

## Upstreams adotados

| Upstream | Uso no FitCore | Política |
| --- | --- | --- |
| Stirling-PDF 2.14.3 | OCR e processamento documental server-side | serviço isolado em loopback; core MIT; diretórios restritos não são copiados |
| Crawl4AI 0.9.3 | preview de conhecimento web curado | serviço isolado em loopback; token + allowlist + review obrigatório |
| OpenHands | workspace/sandbox/event/approval boundaries | referência arquitetural; sem Agent Canvas embutido |
| agency-agents | especialistas, runbooks, handoffs e gates | catálogo próprio curado, máximo de sete agentes |
| awesome-n8n-templates | padrões de automação | concept-only; nenhum JSON de terceiro copiado |
| thefuck | UX de correção de comandos | suggest-only; autoexecução proibida |

## Fronteiras de runtime

Crawl4AI e Stirling-PDF são processos auxiliares. A API FitCore só aceita URLs-base HTTP em `127.0.0.1`, `localhost` ou `::1`. Eles nunca recebem uma porta pública criada pelo FitCore.

A ingestão web usa `POST /api/mvp-32/knowledge/preview`. A rota exige sessão assinada pelo RBAC existente e, adicionalmente, o manager aceita somente `gestor` ou `professor`. O conteúdo retornado é preview: `review_required=true` e `auto_apply=false`.

## Agent runtime

A arquitetura inspirada no OpenHands é implementada como contrato first-party:

- host filesystem: proibido;
- execução privilegiada: proibida;
- rede: deny-by-default, apenas allowlist interna;
- escrita em workspace: exige workspace e aprovação;
- ações externas: exigem aprovação;
- evidência de etapas anteriores é carregada por handoff, não por catálogo inteiro em contexto.

## Automação e Command Assist

Os templates n8n servem somente como fonte de ideias. O runtime continua sendo o FitCore/MarcaIA Automation OS quando uma automação compartilhada fizer sentido. Cada padrão local carrega risco, trigger, actions e política de aprovação.

O Command Assist usa o modelo `erro observado -> regra -> sugestão`, mas nunca executa a sugestão. Ele bloqueia classes destrutivas/privilegiadas e não converte erro de permissão em elevação automática.

## Stage gates

1. `npm run capability:check`
2. `npm run all:ui-gates`
3. `npm run site:next:build`
4. checks/API existentes afetados por MVP-32/MVP-33
5. PR/CI verde
6. merge por SHA
7. deploy canônico da VPS
8. smoke público e API

Feature flags ficam `false` até os serviços auxiliares estarem instalados, autenticados e saudáveis na VPS.
