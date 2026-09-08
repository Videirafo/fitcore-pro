# Módulo Exercises

Módulo responsável pelo catálogo interno de exercícios do FitCore Pro.

## Fonte inicial

- wger: motor fitness principal.
- hasaneyldrm/exercises-dataset: fonte complementar textual para enriquecimento do catálogo.

## Regra de uso

Nesta fase, usar apenas dados textuais do `exercises-dataset`.

Não usar imagens ou GIFs do dataset em produto comercial sem licença própria da Gym visual.

## Campos previstos

```txt
source
source_id
name
category
body_part
equipment
target
muscle_group
secondary_muscles
instructions
instruction_steps
media_policy
created_at
```

## Próximas etapas

1. Criar normalizador JSON.
2. Criar validação Zod.
3. Criar tabela ou coleção interna.
4. Mapear equivalências com exercícios do wger.
5. Criar busca por nome, equipamento, grupo muscular e objetivo.
6. Criar conteúdo educacional em português brasileiro.
