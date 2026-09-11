# FitCore Pro — identidade oficial

Status: **CANÔNICO**  
Owner decision: Issue #38
Primary asset: `apps/site/public/brand/fitcore-pro-official.png`

## Regra permanente

O FitCore Pro deve usar o artwork aprovado pelo owner exatamente como fornecido. Não redesenhar, reinterpretar ou reconstruir o símbolo/wordmark com SVG, CSS, formas geométricas ou outra geração de IA.

Assets canônicos:

- `fitcore-pro-official.png` — lockup oficial completo, com transparência;
- `fitcore-pro-symbol.png` — recorte direto do símbolo contido no mesmo artwork;
- `fitcore-pro-symbol-256.png` — derivação de tamanho do mesmo símbolo para superfícies compactas;
- `app/icon.png` — favicon/metadata derivado do símbolo oficial.

SHA-256 do lockup canônico do site: `614a083538f1d0259f8c16eae7d3c91e12e36f8cf109f032b7a2cea47f3f3569`.

## Uso permitido

É permitido apenas redimensionar preservando proporção, manter área de respiro e gerar tamanhos derivados do mesmo arquivo. Não distorcer, rotacionar, recolorir, adicionar contorno/glow/badge/caixa ou trocar o símbolo.

A paleta funcional da interface pode evoluir separadamente. O logo não deve acompanhar automaticamente mudanças de tema ou cores do produto.

Toda alteração intencional de branding exige aprovação explícita do owner e deve atualizar o gate `brand:check`, passando por Issue → PR → CI → deploy por SHA.
