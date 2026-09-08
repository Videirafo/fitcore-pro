# 01 - Arquitetura

O FitCore Pro usa o wger como base fitness e cria uma camada própria ao redor.

```txt
wger
  -> treinos
  -> exercícios
  -> dieta
  -> peso
  -> medidas
  -> evolução

FitCore Pro
  -> academias
  -> alunos
  -> planos
  -> pagamentos
  -> WhatsApp
  -> IA
  -> jurídico
  -> dashboard
  -> white-label
```

## Decisão inicial

Começar com monólito modular em `services/api`.

Não criar microsserviços prematuros.

## Por quê?

Menos erro, menos Docker, menos deploy, menos confusão e mais velocidade para o MVP.
