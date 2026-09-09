# Mídias importadas de repositórios externos

Esta pasta recebe imagens e GIFs copiados de repositórios externos para triagem.

## Regra

Arquivos importados aqui **não estão automaticamente aprovados para uso comercial**.

Antes de usar em treino, landing page ou painel do aluno/professor, registrar:

- repositório de origem;
- caminho original;
- licença do repositório;
- licença específica da mídia, quando houver;
- autorização comercial;
- data da importação;
- quem validou.

## Fluxo

1. Importar com:

```bash
bash infra/scripts/import-exercise-media-from-github.sh OWNER/REPO
```

2. Revisar o manifesto:

```bash
cat apps/site-static/media/imported/OWNER-REPO/manifest.jsonl | head
```

3. Escolher o arquivo correto.

4. Copiar para o slug oficial do exercício:

```bash
cp apps/site-static/media/imported/OWNER-REPO/caminho/original.gif apps/site-static/media/exercises/<slug-do-exercicio>.gif
```

5. Publicar novamente:

```bash
bash infra/scripts/switch-fitcore-to-own-ui.sh
```

6. Validar HTTP:

```bash
curl -I "https://fitcore.marcaia.app/media/exercises/<slug-do-exercicio>.gif?cb=$(date +%s)"
```
