# 09 - MVP-01 Aluno + Treino

## Decisão

O primeiro MVP funcional do FitCore Pro é o fluxo **Aluno + Treino**.

A meta desta etapa é validar o caminho mínimo:

```txt
cadastro mínimo do aluno
→ objetivo e nível
→ frequência semanal
→ foco do treino
→ rascunho de rotina
→ revisão do professor
→ check-in e evolução futura
```

## Escopo incluído

- Página pública de validação em `/mvp-01.html`.
- Formulário de cadastro mínimo do aluno.
- Seleção de modalidade: academia, estúdio, personal, box funcional ou funcional/cross training.
- Seleção de objetivo: saúde, hipertrofia, emagrecimento, condicionamento ou força.
- Seleção de nível e dias por semana.
- Geração de rascunho de treino com exercícios do catálogo normalizado.
- API própria com persistência local simples em arquivo JSON.
- Mensagem de LGPD para evitar dados sensíveis desnecessários nesta fase.

## Endpoints

```txt
GET  /api/mvp-01/status
GET  /api/mvp-01/aluno-treino
POST /api/mvp-01/aluno-treino
GET  /api/mvp-01/aluno-treino/:id
```

## Armazenamento local

```txt
storage/mvp-01/aluno-treino.json
```

Este armazenamento é temporário para validação. Antes de produção comercial, migrar para banco com multi-tenant, permissões, auditoria e políticas de retenção.

## Política LGPD

Nesta fase, usar somente dados mínimos:

- nome do aluno para validação;
- objetivo;
- nível;
- modalidade;
- dias por semana;
- foco do treino;
- observações não sensíveis.

Não cadastrar CPF, documento, telefone, e-mail, foto, medida corporal, limitação médica ou dado sensível sem fluxo jurídico e autorização adequada.

## Próximos passos

1. Criar autenticação e papéis: gestor, professor e aluno.
2. Criar modelo persistente multi-tenant.
3. Criar check-in de execução de treino.
4. Criar histórico de evolução.
5. Criar auditoria de operações sensíveis.
6. Conectar com WhatsApp/MarcaIA para lembretes e acompanhamento.
