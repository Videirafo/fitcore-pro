# FitCore Pro

FitCore Pro é uma fundação profissional para um sistema fitness baseado em wger, com foco em academias, personal trainers, alunos, treinos, séries, check-ins, pagamentos, documentos digitais, WhatsApp, IA e app mobile.

## Objetivo

Criar um sistema fitness real, organizado e expansível, usando o wger como base open source para treino, nutrição, medidas e evolução, e adicionando uma camada própria chamada FitCore Pro.

## Estrutura

```txt
apps/          # Frontend, site público, protótipo estático e mobile
services/      # Backend principal e orquestrador interno
packages/      # Código compartilhado
content/       # Conteúdo educacional de treinos e séries
assets/        # Imagens próprias, ícones e materiais visuais
infra/         # Docker, Nginx, scripts, backups e monitoramento
docs/          # Documentação técnica
legal/         # LGPD, termos, políticas e open source
upstream/      # Projetos open source externos, como wger
```

## Stack inicial

- Frontend: Next.js + TypeScript
- Backend: Node.js + TypeScript + Fastify
- Mobile: Flutter
- Banco: PostgreSQL
- Cache/fila: Redis
- Base fitness: wger
- Deploy: Docker
- Orquestrador: FitCore Doctor

## Regra principal

Não misturar código próprio do FitCore Pro dentro do wger sem necessidade.

O wger entra em `upstream/` como base fitness.

A camada própria fica em `apps/`, `services/` e `packages/`.
