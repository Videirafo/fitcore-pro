# 05 - SparkyFitness como referência controlada

Fonte analisada: `git@github.com:CodeWithCJ/SparkyFitness.git`.

## Decisão

O SparkyFitness pode ser usado como **referência de produto, arquitetura, organização de funcionalidades e ideias de experiência fitness**, mas **não deve ser copiado** para dentro do FitCore Pro.

## Motivo

O próprio README do SparkyFitness informa que o projeto é uma plataforma self-hosted para acompanhar nutrição, exercícios, métricas corporais e dados de saúde, com backend, frontend web e apps nativos para iOS/Android.

O projeto também declara explicitamente que é **source-available, não open source**, com licença não comercial e exigência de permissão para uso comercial.

## O que podemos aprender

- Organização de produto fitness self-hosted.
- Integrações de saúde e wearables.
- Histórico, métricas e relatórios.
- Check-ins diários.
- UX para acompanhamento de nutrição, exercício, hidratação, sono, jejum, humor e medidas.
- Separação entre backend, frontend e mobile.
- Ideia de IA conversacional para registro e revisão de progresso.
- Comparativos transparentes com outros produtos do mercado.

## O que não fazer

- Não copiar código.
- Não copiar imagens.
- Não copiar textos comerciais.
- Não copiar identidade visual.
- Não usar assets em produto comercial sem permissão escrita do autor.
- Não tratar a licença como MIT, Apache ou open source permissiva.

## Aplicação no FitCore Pro

O FitCore Pro continua tendo como base técnica fitness principal o wger, que já está rodando na VPS em `upstream/wger-docker`.

SparkyFitness entra apenas como referência de inteligência de produto, principalmente para:

- evolução de dashboard;
- app do aluno;
- relatórios;
- check-ins;
- integração com dados de saúde;
- módulos futuros de nutrição;
- UX de histórico e progresso;
- IA para registro assistido.

## Regra de licença

Antes de qualquer uso comercial de código, imagens ou material derivado do SparkyFitness, obter permissão formal do autor.

Sem permissão, usar apenas como estudo e inspiração conceitual.
