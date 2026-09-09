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

## Orientação visual e mídia

Os cards usam orientação visual source-owned do FitCore por padrão. Mídia publicada em `/media/exercises/*` só pode ser exibida quando a proveniência e a licença comercial estiverem aprovadas. Os cards mostram o que fazer no treino:

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
