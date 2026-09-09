# MVP-35 — Landing pública separada do console operacional

Status: concluído e validado em produção.

## Objetivo

Corrigir a experiência inicial do FitCore Pro separando a página pública de venda/entrada do console operacional autenticado.

## Entrega

- `/` agora usa uma landing pública própria, sem sidebar operacional.
- A home pública não mostra mais `Acesso necessário`, botão `Atualizar` ou cards de sessão.
- A landing apresenta proposta de valor, CTA, prévia do produto, módulos, IA, segurança/LGPD e GIFs internos.
- O console com sidebar permanece nas rotas operacionais.
- O menu operacional segue filtrado por papel.
- Layout web e mobile receberam correções de overflow.
- Cards de exercícios e painel de IA não ficam mais esmagados em grids estreitos.

## Rotas preservadas

- `/login`
- `/onboarding`
- `/setup`
- `/agents`
- `/biblioteca`
- `/alunos`
- `/treinos`
- `/execucao`
- `/evolucao`
- `/seguranca`
- `/auditoria`
- `/configuracoes`

## Validação

```bash
npm run mvp35:check
bash infra/scripts/verify-mvp-35-public-landing-shell.sh
```

O verificador executa os contratos anteriores, build Next, deploy Nginx, smoke público, valida ausência de textos operacionais na home e confirma GIF público.
