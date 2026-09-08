# 06 - Exercises Dataset

Fonte externa avaliada: `hasaneyldrm/exercises-dataset`.

## Decisão

Usar este repositório como fonte complementar de catálogo de exercícios para o FitCore Pro, sem copiar mídia para o repositório principal e sem substituir o wger.

O wger continua sendo o motor fitness principal. O `exercises-dataset` entra como camada de enriquecimento para:

- catálogo de exercícios;
- filtros por parte do corpo;
- equipamento;
- músculo alvo;
- músculos secundários;
- instruções passo a passo;
- normalização futura para busca, RAG e recomendação de séries.

## Status validado em 2026-09-08

Sincronização local validada na VPS:

```txt
/opt/fitcore-pro/upstream/exercises-dataset
/opt/fitcore-pro/storage/exercises-dataset
```

Arquivos gerados:

```txt
LICENSE.upstream.txt
NOTICE.upstream.md
SOURCE.txt
SOURCE_SHA.txt
exercises.raw.json
exercises.schema.json
```

Fonte registrada localmente:

```txt
source=hasaneyldrm/exercises-dataset
url=https://github.com/hasaneyldrm/exercises-dataset.git
sha=7455efae41b330c265e7cd4b78dfa848e7ce5ebd
policy=textual_only
media=not_downloaded_by_default_do_not_use_without_gym_visual_license
```

## O que a fonte entrega

O repositório contém:

- `data/exercises.json` com a base principal de exercícios;
- `data/exercises.schema.json` com JSON Schema;
- `images/` com miniaturas;
- `videos/` com GIFs;
- `index.html` para navegação local;
- `setup.html` para integração.

## Licença e restrição importante

A parte de código, estrutura, dados textuais e instruções é MIT.

A mídia em `images/` e `videos/` não é MIT. Ela pertence à Gym visual e exige termos próprios, atribuição e respeito ao limite de resolução informado na fonte.

## Regra FitCore Pro

Nesta fase, usar somente os dados textuais:

- `id`;
- `name`;
- `category`;
- `body_part`;
- `equipment`;
- `target`;
- `muscle_group`;
- `secondary_muscles`;
- `instructions`;
- `instruction_steps`;
- `created_at`.

Não usar imagens ou GIFs comercialmente sem licença própria da Gym visual.

## Caminho local recomendado

```txt
/opt/fitcore-pro/upstream/exercises-dataset
```

Este clone local deve ficar ignorado pelo Git.

## Estratégia de integração

1. Clonar a fonte em `upstream/exercises-dataset`.
2. Validar presença de `data/exercises.json` e `data/exercises.schema.json`.
3. Copiar apenas os arquivos de dados para área local de trabalho.
4. Criar normalizador FitCore.
5. Mapear exercícios para o modelo interno.
6. Futuramente relacionar com wger por nome, equipamento, músculo alvo e categoria.

## Modelo canônico interno futuro

```txt
fitcore_exercises
├── source
├── source_id
├── name
├── body_part
├── equipment
├── target
├── primary_muscle
├── secondary_muscles
├── instructions_pt_br
├── instructions_en
├── difficulty
├── safety_notes
├── media_policy
└── created_at
```

## Política de mídia

Enquanto não houver licença própria:

```txt
media_policy = textual_only
```

Isso evita risco jurídico no SaaS comercial.
