# MVP-32 — Workspace premium com IA, GIFs e papéis

Status: concluído e validado em produção.

## Objetivo

Transformar o shell operacional em uma experiência mais próxima de SaaS fitness real: navegação lateral completa, dashboard visual, módulo de IA/agents, biblioteca de exercícios com GIFs e telas por papel.

## Entregue

- Sidebar expandida com Dashboard, Agenda, Onboarding, Equipe, Alunos, Treinos, Biblioteca, Execução, Evolução, IA & Agents, Relatórios, Financeiro, Segurança, Auditoria e Configurações.
- Logout visível no header e na lateral.
- Home em formato de central de comando.
- Cards de exercícios com GIF interno em treinos, execução e biblioteca.
- Assistente operacional em `/agents` e dentro da execução.
- Endpoint `/api/mvp-32/agent` com resposta por papel e registro de auditoria.
- Tabela `fitcore_agent_events` com RLS por tenant.
- Rotas Next novas: `/agents`, `/biblioteca`, `/seguranca`, `/auditoria`, `/configuracoes`, `/agenda`, `/relatorios`, `/financeiro`.

## Papéis

- Dono/Gestor: operação completa, setup, equipe, alunos, treinos, evolução, agentes, segurança, auditoria e módulos executivos.
- Professor: alunos, treinos, execução, evolução, biblioteca e IA de apoio à prescrição.
- Aluno: treino do dia, biblioteca de apoio, execução, evolução, IA de orientação e segurança.

## GIFs

Os cards usam a mídia interna publicada em `/media/exercises/*.gif` e mostram o que fazer no treino:

- agachamento;
- supino;
- remada;
- puxada;
- core;
- pullover.

## Validação

Script canônico:

```bash
bash infra/scripts/verify-mvp-32-premium-agent-workspace.sh
```

## Integração Hermes Provider Gateway — 2026-09-12

O Assistente IA do FitCore usa o gateway compartilhado do MarcaIA como engine principal, sem carregar credenciais de modelo no browser ou no app Flutter.

Fluxo canônico:

`FitCore /api/mvp-32/agent → contexto tenant-scoped → Hermes Provider Gateway → provider/model configurado no MarcaIA`.

Guardrails preservados:

- RBAC e sessão assinada antes da chamada ao gateway;
- contexto limitado ao tenant autenticado;
- prompt Evidence-First, sem inventar fatos ausentes;
- revisão humana para carga, volume, dor, lesão e risco;
- sem autonomia médica ou alteração automática de treino;
- timeout e fallback determinístico local quando o gateway estiver indisponível;
- auditoria com engine, provider, model e indicador de fallback;
- token `FITCORE_HERMES_GATEWAY_TOKEN` estritamente server-side.

Gate de contrato e fallback: `npm run mvp32:check`.
