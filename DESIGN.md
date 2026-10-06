# DESIGN.md — FitCore Pro Visual Source of Truth

> Fonte visual canônica para web, console e Flutter.  
> Leia junto com `skills/desgner/SKILL.md`, `docs/brand/FITCORE_OFFICIAL_BRAND.md` e `docs/design/UI_UX_PRO_MAX_ADOPTION.md`.

## 1. North star

FitCore Pro deve parecer um produto fitness profissional, rápido e confiável: atlético sem virar estética gamer/crypto, premium sem esconder o conteúdo, e claro o suficiente para uso real durante treino.

A interface possui três lanes distintos:

1. **Marketing público** — editorial atlético, prova de produto, composição expressiva controlada.
2. **Console gestor/coach** — operacional, denso porém respirável, orientado a decisão.
3. **Workout mobile** — touch-first, uma mão, números grandes, zero fricção desnecessária.

Nunca transferir automaticamente efeitos de marketing para console ou workout.

## 2. Hierarquia de autoridade

1. instrução explícita do owner/tarefa;
2. identidade oficial em `docs/brand/FITCORE_OFFICIAL_BRAND.md`;
3. este `DESIGN.md`;
4. regras em `docs/design/UI_UX_PRO_MAX_ADOPTION.md`;
5. tokens/primitives existentes;
6. Reference Lock da tarefa;
7. referências externas.

Referências externas não podem redesenhar o logo, inventar uma marca ou substituir os fluxos FitCore.

## 3. Brand invariant

O artwork oficial é imutável sem aprovação explícita do owner.

- fonte: `apps/site/public/brand/fitcore-pro-official.png`;
- não redesenhar em SVG/CSS/IA;
- não recolorir;
- não aplicar glow, sombra, badge, caixa ou borda ao logo;
- compactos devem ser crops/resizes diretos dos assets aprovados;
- splash usa símbolo oficial isolado sobre `#07111F`.

UI pode evoluir; brand asset não deriva automaticamente do tema.

## 4. Paleta funcional atual

Base observada no produto:

- canvas escuro: `#070914`;
- canvas soft: `#0D1224`;
- texto principal: `#F8FAFC`;
- muted: `#AEB8D4`;
- dim: `#7F8AAA`;
- green: `#47F06A`;
- lime: `#BDFF63`;
- violet secundário: `#8B5CF6`;
- blue secundário: `#70A5FF`.

### Disciplina

- green/lime representam energia, progresso e ação primária;
- violet/blue são secundários e não devem dominar o produto por reflexo “AI/SaaS”;
- novos componentes devem usar tokens semânticos, não hex isolado;
- estados críticos precisam de semântica própria e não podem depender apenas de cor.

A paleta atual é ponto de partida, não licença para espalhar neon/gradientes em toda superfície.

## 5. Tipografia

Famílias existentes podem evoluir dentro da arquitetura atual, mantendo coerência entre site, console e mobile.

Papéis:

- display/marketing: forte, atlético, curto;
- page title operacional: claro e compacto;
- section title;
- body;
- label;
- caption;
- metric/numeric;
- mono somente quando significado técnico justificar.

### Regra operacional

No console e workout, títulos não podem consumir espaço útil como um hero de marketing. Métricas de reps, carga, tempo e progresso têm prioridade óptica.

## 6. Densidade e composição

### Marketing
- variance ~7/10;
- motion ~6/10;
- density ~4/10;
- pode usar assimetria, imagens, preview de produto e profundidade controlada.

### Manager/coach console
- variance ~3/10;
- motion ~2/10;
- density ~7/10;
- usar cards apenas quando agrupamento fizer sentido;
- status e próxima ação devem ser escaneáveis;
- evitar glass, glow, pills e gradientes como linguagem universal.

### Workout mobile
- variance ~2/10;
- motion ~2/10;
- density ~6/10;
- números grandes;
- hierarquia simples;
- ação principal alcançável com uma mão;
- evitar cadeias de modal.

## 7. Radius, glass e elevation

O legado atual usa radius alto e superfícies translúcidas. A partir deste contrato:

- radius é definido por papel do componente;
- pill somente para chip/status/filtro/ação realmente compacta;
- card não vira pill;
- glass é permitido em marketing e em shell pontual quando melhora profundidade;
- glass não é superfície padrão para tabelas, formulários ou workout;
- shadow comunica camada/elevação, não decoração;
- glow não deve competir com leitura.

## 8. Gradientes e efeitos

Permitidos no marketing quando fazem parte da direção escolhida.

No console/workout, rejeitar por padrão:
- gradient text;
- múltiplos radial glows;
- neon ornamental;
- partículas;
- WebGL contínuo;
- background complexo atrás de dados;
- animação contínua sem função.

WebGL permanece marketing-only salvo justificativa concreta de produto.

## 9. Componentes e tokens

Ordem obrigatória:

`FitCore tokens -> FitCore primitives -> componente local adaptado -> external defaults`

Antes de criar Button/Card/Dialog/Input:
1. procurar primitive existente;
2. estender se possível;
3. criar novo primitive somente se houver padrão reutilizável real.

Nunca importar visual externo sem normalizar tokens, estados, acessibilidade e performance.

## 10. Estados

Toda UI assíncrona considera, quando aplicável:

- idle;
- loading;
- success;
- empty;
- error;
- retry;
- disabled;
- uploading;
- processing;
- queued;
- syncing;
- offline.

Não depender de defaults do framework em estados críticos.

## 11. Mobile / Flutter

- touch target prático >= 44x44 CSS-equivalent px;
- safe areas;
- back behavior e teclado;
- gesto não pode conflitar com ação crítica;
- logging de treino funciona em rede lenta/intermitente;
- animação nunca bloqueia entrada rápida de séries;
- CTA principal acessível com uma mão;
- texto/números legíveis sob iluminação forte de academia.

O mesmo `DESIGN.md` governa web e Flutter; implementação nativa respeita os primitives do Flutter em vez de copiar CSS literalmente.

## 12. Acessibilidade

- contraste de texto normal alvo 4.5:1 quando aplicável;
- foco de teclado visível;
- labels e erros associados;
- icon-only com nome acessível;
- estado nunca apenas por cor;
- zoom/text scaling sem clipping crítico;
- reduced motion;
- charts com valores/descrição além da marca visual.

## 13. Anti-“cara de IA”

Sem justificativa explícita no Reference Lock, rejeitar:

- purple/blue gradient como solução automática;
- palavra do headline em gradient;
- glassmorphism em tudo;
- radius gigante em tudo;
- pills em todas as ações;
- hero SaaS padrão badge + headline + 2 CTAs + mockup;
- grid repetitivo icon/title/copy;
- sparkles genéricos;
- blobs/glow sem função;
- fake metrics/testimonials;
- copy “unlock/revolutionize/seamless”.

## 14. Reference Lock obrigatório

Antes de mudança visual material registrar:

- surface/flow;
- user job;
- lane: marketing / console / workout;
- primary visual direction;
- traits to preserve;
- tokens/roles;
- density;
- radius/elevation;
- imagery/media;
- motion;
- explicit rejects;
- open decisions.

## 15. Definition of Done

UI FitCore só está pronta quando:

- brand invariant preservado;
- `DESIGN.md` + DESGNER lidos;
- Reference Lock existe;
- primitives/tokens foram reutilizados;
- mobile/desktop relevante verificado;
- states verificados;
- accessibility verificada;
- motion/performance revisados;
- Design Guard passou para o diff novo;
- gates FitCore aplicáveis passaram;
- evidência visual foi registrada quando possível.
