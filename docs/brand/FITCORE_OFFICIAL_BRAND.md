# FitCore Pro — identidade oficial

Status: **CANÔNICO**  
Owner decision: Issue #36  
Primary asset: `apps/site/public/brand/fitcore-pro-official.svg`

## Regra permanente

O FitCore Pro deve usar sempre esta identidade oficial. O símbolo não pode ser substituído por monogramas `FC`, escudos genéricos, halteres, personagens, rings ou novas marcas geradas por IA sem aprovação explícita do owner.

Assets canônicos:

- `fitcore-pro-official.svg` — lockup principal em fundo claro;
- `fitcore-pro-official-on-dark.svg` — mesma marca, variante de contraste em fundo escuro;
- `fitcore-pro-symbol.svg` — símbolo responsivo/favicon/app chrome;
- `app/icon.svg` — espelho do símbolo oficial para metadata do Next.js.

## Uso permitido

É permitido apenas redimensionar, preservar área de respiro e usar a variante de contraste. Não distorcer, rotacionar, recolorir arbitrariamente, adicionar contorno, glow, badge, caixa ou trocar o símbolo.

O verde do produto continua sendo cor funcional da interface. A marca oficial usa navy + azul elétrico + cyan para não competir com CTAs, estados positivos e métricas do produto.

Toda alteração de branding deve atualizar o gate `brand:check` e passar por Issue → PR → CI → deploy por SHA.
