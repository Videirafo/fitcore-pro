# 00 - Mapa do Projeto

Este documento explica onde cada parte do FitCore Pro fica.

## apps/admin

Painel administrativo usado por academias, personal trainers e equipe interna.

## apps/site

Site comercial principal do FitCore Pro.

## apps/site-static

Protótipo simples em HTML, CSS e JavaScript.

Serve para:

- testar layout rápido
- estudar estrutura
- apresentar ideia
- não depender ainda do Next.js

## apps/mobile

Aplicativo Android/iOS.

## services/api

Backend principal do FitCore Pro.

Responsável por:

- academias
- alunos
- profissionais
- planos
- check-ins
- relatórios
- integração com wger
- integração com pagamentos
- integração com WhatsApp
- integração com IA

## services/orchestrator

Organizador interno do sistema.

Também chamado de FitCore Doctor.

Responsável por:

- verificar erros
- checar serviços
- validar ambiente
- avisar problemas
- futuramente usar IA para diagnóstico

## packages/sdk-wger

Cliente interno para conversar com a API do wger.

## content/workout-series

Conteúdo educacional sobre séries de academia.

## upstream

Projetos open source externos.

Exemplo:

```txt
upstream/wger-docker
upstream/wger-mobile
upstream/wger-mcp
```
