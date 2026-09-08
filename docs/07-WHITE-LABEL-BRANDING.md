# 07 - White-label e Branding do FitCore Pro

## Decisão

O FitCore Pro deve ser apresentado ao usuário final como produto próprio do ecossistema MarcaIA, mas sem apagar obrigações legais das bases open source usadas.

Na fase atual, a tela exibida em `fitcore.marcaia.app` ainda é a interface padrão do wger. Por isso aparecem referências como:

- logo/nome wger;
- links para aplicativo móvel do wger;
- links de Flathub/App Store/Google Play;
- páginas de "Sobre este software".

Isso é esperado enquanto o wger estiver exposto como UI principal.

## Status validado em 2026-09-08

A porta pública direta do wger foi bloqueada no Docker Compose.

Estado validado na VPS:

```txt
[OK] docker-compose.yml ajustado para 127.0.0.1:8088:80
[OK] wger reiniciado sem apagar volumes
[OK] wger local responde HTTP 302 para /en/
[OK] https://fitcore.marcaia.app responde HTTP/2 302 para /en/
[OK] socket 8088 escuta apenas em 127.0.0.1
[OK] 0.0.0.0:8088 não está mais exposto
```

Com isso, `144.91.99.6:8088` não deve ser usado como entrada pública. O caminho público canônico passa a ser:

```txt
https://fitcore.marcaia.app
```

## Regra arquitetural

Não transformar o wger em uma cópia falsa do FitCore por edição agressiva de HTML, `sub_filter` ou remoção cega de créditos.

A estratégia correta é:

1. Manter o wger como motor fitness interno.
2. Criar uma UI própria do FitCore/MarcaIA para alunos, profissionais e academias.
3. Usar o wger via API, banco controlado ou integrações auditadas.
4. Manter créditos/licenças em página legal discreta, por exemplo `/legal/open-source`.
5. Não expor a porta direta `144.91.99.6:8088` ao público.
6. Fazer o acesso público passar por `https://fitcore.marcaia.app`.

## O que pode ser removido da experiência pública

Na UI própria do FitCore, podemos remover:

- logo wger do cabeçalho;
- links de apps externos do wger;
- rodapé com botões Google Play/App Store/Flathub;
- navegação institucional do wger;
- páginas de marketing padrão do wger;
- textos que confundem o usuário final.

Isso deve ser feito criando telas próprias, não adulterando a aplicação upstream de forma frágil.

## O que deve permanecer em algum lugar legal/técnico

Manter em documentação, página legal ou painel administrativo:

- referência a wger como software open source utilizado;
- licença AGPL do wger;
- avisos de dados/licenças de exercícios, quando aplicável;
- referência a fontes externas de dataset quando usadas;
- regra de não usar mídia de terceiros sem licença própria.

## Política para o exercises-dataset

O `hasaneyldrm/exercises-dataset` está aprovado apenas para uso textual nesta fase.

```txt
media_policy=textual_only
```

Não usar imagens/GIFs do dataset como parte da marca FitCore sem licença própria da Gym visual.

## Exposição de runtime

A porta do wger deve ficar restrita ao host local:

```txt
127.0.0.1:8088:80
```

Não deixar assim em produção:

```txt
0.0.0.0:8088->80/tcp
```

O acesso público deve passar pelo Nginx principal:

```txt
https://fitcore.marcaia.app
  -> Nginx principal
  -> http://127.0.0.1:8088
```

## Fase recomendada

### Agora

- Restringir a porta 8088 para localhost.
- Manter wger funcional no subdomínio.
- Não customizar visual ainda.

### Próximo ciclo

- Criar landing FitCore própria.
- Criar dashboard FitCore próprio.
- Criar catálogo próprio com `exercises.normalized.json`.
- Usar wger como engine/admin interno.

### Depois

- Separar UI pública FitCore da engine wger.
- Criar página legal `/legal/open-source`.
- Conectar onboarding fitness ao MarcaIA.
