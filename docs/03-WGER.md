# 03 - wger

O wger será usado como motor fitness open source do FitCore Pro.

## Responsabilidades do wger

- exercícios
- treinos
- nutrição
- peso
- medidas
- fotos de evolução
- API fitness
- app mobile base

## Onde ficará

```txt
upstream/wger-docker
```

## Regra

Não alterar o core do wger no começo.

Primeiro integrar usando API.

## Estado validado na VPS

Data da validação: 2026-09-08.

O clone local do wger Docker foi criado em:

```txt
/opt/fitcore-pro/upstream/wger-docker
```

A porta pública padrão `80:80` conflitou com o Nginx já existente na VPS. Para evitar conflito, o mapeamento local do wger foi ajustado para:

```txt
8088:80
```

Teste local validado:

```bash
curl -I http://127.0.0.1:8088
```

Resposta esperada:

```txt
HTTP/1.1 302 Found
Location: /en/
```

## Containers esperados

```txt
wger-docker-db-1              healthy
wger-docker-cache-1           healthy
wger-docker-web-1             healthy
wger-docker-nginx-1           healthy, porta 8088->80
wger-docker-powersync-1       up
wger-docker-celery_worker-1   healthy
wger-docker-celery_beat-1     up
```

## PowerSync

Após recriar volumes, o PowerSync precisa do setup obrigatório:

```bash
docker compose exec web ./manage.py setup-powersync-storage
```

Esse comando prepara o role `powersync_storage` e o schema `powersync` dentro do banco `wger`.

## Comandos seguros

Subir:

```bash
cd /opt/fitcore-pro/upstream/wger-docker
docker compose up -d
```

Parar sem apagar dados:

```bash
cd /opt/fitcore-pro/upstream/wger-docker
docker compose stop
```

Remover containers sem apagar volumes:

```bash
cd /opt/fitcore-pro/upstream/wger-docker
docker compose down
```

## Comando perigoso

Não usar em ambiente com dados:

```bash
docker compose down -v
```

O `-v` remove volumes Docker, incluindo banco, mídia, arquivos estáticos e Redis.

## Segurança pendente

Antes de produção real, configurar:

- `SECRET_KEY` fixo;
- `JWT_PRIVATE_KEY` e `JWT_PUBLIC_KEY` próprios;
- senha admin alterada;
- domínio/proxy HTTPS;
- backup e teste de restore;
- registro de versão/SHA do wger usado.
