# MVP-43 — Escopo profissional, contraste e copy limpa

## Objetivo

Refinar o FitCore Pro para representar uma plataforma profissional ampla para operação fitness, educação física, nutrição esportiva, cross training, studios, academias e personal trainers.

## Entregas

- Landing reposicionada para operação fitness completa.
- Navegação pública limpa, sem texto fora de contexto.
- Cards de solução com agenda, aulas, equipe, alunos, anamnese, treinos, nutrição, execução e evolução.
- Assistente IA reposicionado para prescrição, evolução e retenção.
- Bloco LGPD reescrito com linhas profissionais, sem textos colados.
- Alternância de contraste claro/escuro com persistência local.
- Sidebar interna ampliada com agenda, IA, financeiro, relatórios e auditoria.

## Critérios de aceite

- A página pública mantém o visual aprovado.
- O dashboard mantém o console premium com GIFs internos.
- O tema claro/escuro funciona sem quebrar layout.
- O bloco de segurança não mostra `LGPDEm`, `DadosTLS` ou `Infra Anexo`.
- O escopo do produto inclui fitness, educação física, nutrição esportiva e cross training.

## Gates

Executar:

```bash
npm run all:ui-gates
npm --prefix apps/site run build
```

## Correção visual 43.1

Após revisão por captura de tela, foram corrigidos pontos visuais ainda fracos:

- contraste do tema claro nos blocos de IA, segurança e preview;
- leitura dos cards escuros dentro do modo claro;
- navegação lateral herdada do shell antigo;
- rótulos técnicos removidos da UI pública e lateral;
- marca lateral reforçada com acabamento premium;
- botão de contraste também no workspace interno.

A regra permanece: visual aprovado não deve ser trocado, apenas estabilizado e refinado.
