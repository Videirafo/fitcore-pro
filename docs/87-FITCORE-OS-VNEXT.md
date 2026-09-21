# FitCore OS VNext — #87

## Direção

O FitCore passa a ser tratado como um **Fitness Operating System**. A transformação é incremental: a base existente de autenticação, multi-tenant, alunos, prescrição, execução, evolução, Hermes, Execution Kernel, analytics e deploy por SHA é preservada e evoluída.

A prioridade do VNext é remover complexidade visual e operacional antes de adicionar novos módulos.

## Princípios

1. **Aluno primeiro no mobile**: treino do dia, execução e progresso devem exigir o mínimo possível de navegação.
2. **Coach orientado a tarefas**: alunos, prescrições, avaliações e evolução aparecem por prioridade, não como um catálogo de telas.
3. **Gestor orientado ao negócio**: operação, agenda, financeiro, equipe e indicadores ficam separados do treino do aluno.
4. **IA contextual**: Hermes recebe contexto governado e sugere a próxima ação; a execução continua protegida pelo Execution Kernel.
5. **Uma fonte visual canônica**: `fitcore-vnext.css` é a camada de convergência enquanto os estilos MVP legados são aposentados progressivamente.
6. **Sem reescrita desnecessária**: APIs e componentes existentes são reutilizados sempre que atendem ao contrato.

## Arquitetura alvo

### App do Aluno
- Home
- Treino de hoje
- Sessão em tempo real
- Cronômetros
- Séries / reps / carga / RIR / RPE
- Check-in
- Histórico
- PRs
- Evolução
- Mapa corporal
- Avaliações físicas
- Plano alimentar
- Corrida/cardio
- Coach/IA

### Coach / Personal
- Dashboard
- Alunos
- Avaliações
- Biblioteca de exercícios
- Construtor de treino
- Templates
- Periodização
- Protocolos
- Evolução dos alunos
- Prescrição
- IA FitCore
- Analytics

### AI Coach
- Anamnese estruturada
- Gerar treino
- Ajustar treino
- Progressão automática
- Deload
- Substituição de exercício
- Análise de execução
- Next Best Action
- Hermes

### Execution Kernel
- start workout
- start exercise
- complete set
- complete exercise
- finish workout
- settlement
- idempotency
- retry
- audit
- analytics

### Fitness CRM
- aluno
- coach
- academia
- relacionamento
- protocolos
- histórico completo

### Business
- planos
- assinaturas
- pagamentos
- inadimplência
- receita
- relatórios

## Mapeamento da base atual

| Base existente | Papel no VNext |
| --- | --- |
| `/dashboard` + MVP-37 | Home por papel |
| `/alunos` | início do Athlete 360 |
| `/treinos` + MVP-24 | prescrição / Workout Builder |
| `/execucao` + MVP-25 | sessão e Execution Kernel |
| `/evolucao` + MVP-26 | evolução |
| `/agents` + MVP-32 | AI Coach / Hermes |
| `/biblioteca` | biblioteca de exercícios |
| `/agenda` | Business / agenda |
| `/financeiro` | Business / financeiro |
| `/relatorios` | Analytics |
| `/auditoria` | observabilidade / Execution Kernel |

## Sequência de construção

1. **VNext UI Foundation**
   - shell e navegação simplificados;
   - landing reposicionada;
   - dashboard por papel focado em “Hoje”;
   - reduzir chrome duplicado e CTAs públicos dentro do sistema autenticado.

2. **Athlete 360 + Assessments**
   - anamnese estruturada;
   - avaliações físicas;
   - histórico unificado;
   - medidas, fotos, restrições e objetivos.

3. **Workout Builder**
   - exercícios;
   - séries/reps/carga/RIR/RPE;
   - templates;
   - periodização;
   - protocolos.

4. **Performance**
   - PR engine;
   - volume e aderência;
   - mapa corporal;
   - progressão e deload.

5. **Nutrition + Running**
   - planos alimentares com governança profissional;
   - corrida/cardio;
   - metas e histórico.

6. **AI Coach**
   - progressão e ajuste;
   - substituição;
   - análise de execução;
   - Next Best Action sobre Hermes e Execution Analytics.

7. **Fitness CRM**
   - relacionamento;
   - follow-up;
   - histórico 360;
   - retenção.

8. **Business**
   - planos;
   - assinaturas;
   - pagamentos;
   - inadimplência;
   - receita;
   - relatórios.

9. **Mobile parity**
   - Flutter alinhado ao mesmo domínio;
   - offline-first;
   - sessão de treino como experiência principal.

10. **Cutover**
   - remover estilos e componentes legados somente depois de cobertura visual e funcional;
   - CI;
   - merge SHA;
   - deploy pelo mesmo SHA;
   - smoke produção.

## Critério de UX

Uma tela só permanece se responder a uma pergunta clara:

- **Aluno:** “O que eu faço agora?”
- **Coach:** “Quem precisa de mim e qual é a próxima ação?”
- **Gestor:** “Como está minha operação e o que exige atenção?”

Qualquer bloco que não ajude a responder a uma dessas perguntas deve ser removido, agrupado ou movido para uma tela secundária.