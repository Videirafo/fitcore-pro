# 14 - GIFs e explicação dos exercícios

## Objetivo

Adicionar uma camada visual e educativa aos treinos do FitCore Pro.

Cada exercício do treino deve poder exibir:

```txt
GIF demonstrativo
para que serve
músculo principal
músculos auxiliares
orientação básica de execução
cuidado de segurança
```

## Arquivos alterados

```txt
apps/site-static/exercise-media.js
apps/site-static/mvp-03.html
apps/site-static/mvp-03.js
apps/site-static/mvp-03.css
apps/site-static/mvp-04.html
apps/site-static/mvp-04.js
apps/site-static/mvp-04.css
apps/site-static/media/exercises/README.md
```

## Onde aparece

### MVP-03 - Professor

O professor passa a revisar o treino vendo, para cada exercício:

- nome;
- grupo muscular e foco;
- espaço para GIF demonstrativo;
- explicação de para que serve;
- músculo principal;
- campo para substituir exercício.

Isso ajuda o professor a validar se o exercício faz sentido antes de aprovar o treino.

### MVP-04 - Aluno

O aluno passa a abrir o treino aprovado com:

- GIF do movimento;
- explicação simples;
- grupos musculares trabalhados;
- instruções básicas de execução;
- cuidado de segurança;
- marcação de exercício concluído.

## Manifesto de mídia

O arquivo central é:

```txt
apps/site-static/exercise-media.js
```

Ele define, por slug do exercício:

```js
gif
objetivo
serve_para
como_executar
cuidado
```

Exemplo:

```js
"0024-barbell-bench-front-squat": {
  gif: "/media/exercises/0024-barbell-bench-front-squat.gif",
  objetivo: "agachamento frontal com apoio no banco",
  serve_para: "fortalecer quadríceps, glúteos e core..."
}
```

## Convenção para os GIFs enviados

Os GIFs reais devem ser colocados em:

```txt
apps/site-static/media/exercises/
```

Nome padrão:

```txt
<slug-do-exercicio>.gif
```

Exemplo:

```txt
0024-barbell-bench-front-squat.gif
0026-barbell-bench-squat.gif
0289-dumbbell-bench-press.gif
```

## Política de mídia

A interface está pronta para usar GIFs, mas os arquivos precisam ser autorais ou licenciados.

Não usar mídia de terceiros sem permissão documentada.

## Estado atual

A camada visual está implementada. Se o GIF ainda não existir no servidor, o cartão mostra:

```txt
GIF pendente
```

O treino não quebra e continua exibindo a explicação textual.

## Próximo passo

Adicionar os GIFs reais enviados pelo usuário na pasta correta e manter o mesmo nome do slug. Depois, rodar o script de ativação da UI própria para publicar os arquivos estáticos.
