# 04 - FitCore Orchestrator

O `services/orchestrator` é a camada interna de coordenação e verificação do FitCore Pro. Ele deve crescer sobre a arquitetura existente, sem criar um segundo core e sem substituir o wger como engine interna de exercícios.

## FitCore Doctor

Primeiras checagens:

- estrutura do projeto
- Docker instalado
- wger online
- API online
- PostgreSQL online
- Redis online
- PowerSync online
- backup existente
- variáveis de ambiente
- portas expostas
- uso de disco
- uso de memória

Resultado esperado:

```txt
PASS
WARNING
CRITICAL
```

## Curated Agency

O FitCore adota o padrão auditado do material `The Agency: 273 agentes, 18 divisões e os 7 que valem` como política de execução, não como importação do catálogo inteiro.

Regra:

```text
catálogo amplo
→ seleção mínima
→ um especialista por vez
→ handoff/evidência
→ Reality Checker
→ AI Code Auditor
→ conclusão
```

O limite canônico é de **7 agentes ativos por ciclo**, e tarefas menores devem usar menos. O runtime materializa somente o contrato do agente atual para evitar desperdício de contexto e sobreposição de instruções.

### Papéis curados

1. `agents-orchestrator` — seleciona o conjunto mínimo e coordena a sequência.
2. `frontend-developer` — implementa o slice funcional reutilizando a arquitetura existente.
3. `ui-designer` — melhora UX/UI web e mobile depois da função existir.
4. `reality-checker` — prova o funcionamento real; gate obrigatório para mudança executável.
5. `ai-code-auditor` — audita segurança, auth, isolamento multi-tenant, validação e dependências; gate obrigatório para mudança executável.
6. `community-builder` — distribui capacidades já verificadas para comunidades relevantes.
7. `creative-strategist` — define hipótese e ângulo de mídia paga com claims verificáveis.

### Contrato de cada agente

Cada definição contém:

- `role` — responsabilidade;
- `process` — sequência de trabalho;
- `deliverable` — handoff esperado;
- `doesNot` — fronteiras explícitas;
- `gate` — quando o papel é um gate obrigatório.

### Invariantes

- nunca carregar o catálogo externo completo no contexto;
- máximo de sete agentes selecionados;
- nenhuma duplicata;
- nenhum agente desconhecido;
- `frontend-developer` exige `reality-checker` + `ai-code-auditor` no ciclo de entrega;
- especialistas rodam sequencialmente por padrão;
- outputs anteriores viram evidência de handoff, não prompts concatenados;
- nenhum agente pode contornar autenticação, autorização, tenant scope ou aprovação humana;
- wger continua como engine interna e não é duplicado por essa camada.

### Arquivos

- `services/orchestrator/src/agency.ts` — catálogo curado, contratos e builder do plano;
- `services/orchestrator/src/agency-check.ts` — validação executável dos invariantes;
- `services/orchestrator/src/doctor.ts` — verificações operacionais do ambiente.

### Validar no VS Code/terminal

A partir do repositório:

```bash
cd services/orchestrator
npm install
npm run agency:check
npm run doctor
```

O primeiro comando de validação deve encerrar com:

```txt
FITCORE AGENCY CHECK: PASS
```

## Segurança e proveniência

Arquivos de agente de terceiros devem receber a mesma diligência de uma dependência: leitura, licença, proveniência, escopo e revisão antes de adoção. O FitCore não copia os 273 prompts do repositório externo. Mantém contratos próprios, curados e versionados no repositório canônico.

## Fluxo de entrega

```text
Issue → branch → implementação → validação → PR → CI/revisão → merge → deploy por SHA
```
