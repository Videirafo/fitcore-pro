# 10 - MVP-02 Check-in do Treino + Auditoria

## Decisão

O segundo MVP funcional do FitCore Pro é o fluxo **Check-in do Treino**.

A meta desta etapa é validar o caminho mínimo depois do MVP-01:

```txt
rascunho de treino
→ treino planejado
→ treino em execução
→ treino concluído
→ histórico por aluno
→ evento de auditoria LGPD
```

## Escopo incluído

- Página pública de validação em `/mvp-02.html`.
- Registro de check-in de treino.
- Status do treino: `planejado`, `em_execucao`, `concluido`.
- Papel de quem registrou: `gestor`, `professor`, `aluno`.
- Histórico dos check-ins recentes.
- Atualização rápida de status.
- Auditoria mínima embutida no registro.
- Layout responsivo para celular, tablet e desktop.

## Endpoints

```txt
GET   /api/mvp-02/status
GET   /api/mvp-02/checkins
POST  /api/mvp-02/checkins
GET   /api/mvp-02/checkins/:id
PATCH /api/mvp-02/checkins/:id/status
```

## Armazenamento local

```txt
storage/mvp-02/checkins.json
```

Este armazenamento é temporário para validação. Antes de produção comercial, migrar para banco com multi-tenant, permissões, auditoria, trilha de consentimento e política de retenção.

## Política LGPD

Nesta fase, o MVP-02 registra apenas:

- nome simples do aluno para validação;
- identificador do treino ou rascunho;
- dia do treino;
- status;
- papel de quem registrou;
- duração aproximada;
- percepção de esforço;
- observações simples.

Não registrar CPF, documento, telefone, e-mail, fotos, medidas corporais, limitações médicas, diagnósticos ou dados sensíveis nesta fase.

## Auditoria mínima

Cada criação ou atualização de check-in gera evento com:

- tipo do evento;
- papel responsável;
- status aplicado;
- ID do registro;
- data/hora;
- regra LGPD da fase.

## Próximos passos

1. Relacionar check-in diretamente ao treino criado no MVP-01.
2. Criar tela do aluno com histórico de execução.
3. Criar tela do professor com revisão e ajustes.
4. Criar painel do gestor com presença, retenção e conclusão.
5. Migrar armazenamento para banco multi-tenant.
6. Criar auditoria persistente por tenant e usuário autenticado.
