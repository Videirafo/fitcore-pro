# 15 - MVP-06 Biblioteca Visual de Exercícios

## Objetivo

Criar uma frente operacional para controlar os GIFs de exercícios do FitCore Pro sem misturar mídia sem licença, sem expor o wger e sem depender de comandos soltos no terminal.

O MVP-06 valida:

- lista de exercícios com status visual;
- identificação de exercícios com GIF publicado;
- identificação de exercícios sem GIF;
- explicação do exercício: para que serve, músculos e cuidado técnico;
- filtros por área: pernas, peito, costas, abdômen, braços, ombros, funcional e cross;
- geração de comando de envio do GIF com slug correto;
- auditoria local de origem e licença do arquivo.

## URL

```txt
https://fitcore.marcaia.app/mvp-06.html
```

## Arquivos criados

```txt
apps/site-static/mvp-06.html
apps/site-static/mvp-06.css
apps/site-static/mvp-06.js
```

## Fonte da explicação

A explicação visual usa o arquivo:

```txt
apps/site-static/exercise-media.js
```

Cada exercício pode ter:

```txt
gif
objetivo
serve_para
como_executar
cuidado
```

## Convenção de mídia

Cada GIF deve usar o slug do exercício:

```txt
/media/exercises/<slug>.gif
```

Exemplo:

```txt
/media/exercises/0026-barbell-bench-squat.gif
```

## Upload nesta fase

O upload ainda é assistido por terminal. A página gera os comandos corretos para reduzir erro manual.

Fluxo validado:

```txt
PowerShell local -> /tmp na VPS -> pasta pública do FitCore -> validação HTTP
```

Comando PowerShell gerado pelo painel:

```powershell
scp -i "$env:USERPROFILE\.ssh\marcaia_admin_ed25519" "C:\Users\Usuario\Downloads\arquivo.gif" marcaiaadmin@144.91.99.6:/tmp/<slug>.gif
```

Comando VPS/root gerado pelo painel:

```bash
cd /opt/fitcore-pro
mkdir -p apps/site-static/media/exercises
mv /tmp/<slug>.gif apps/site-static/media/exercises/<slug>.gif
chmod 644 apps/site-static/media/exercises/<slug>.gif
bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -I "https://fitcore.marcaia.app/media/exercises/<slug>.gif?cb=$(date +%s)"
```

## Política de licença

Regra do FitCore Pro:

```txt
Somente GIF autoral ou licenciado pode ser usado comercialmente.
```

A mídia do dataset externo continua fora do produto enquanto não houver licença própria.

## Limite do MVP

A auditoria de origem/licença do MVP-06 fica salva no navegador via `localStorage`.

Em produção, isso deve migrar para:

- banco multi-tenant;
- usuário autenticado;
- papel do usuário;
- data/hora;
- comprovante de licença;
- status de aprovação;
- histórico imutável de alterações.

## Próxima evolução

MVP-07 recomendado:

```txt
MVP-07 - Upload Real e Aprovação de Mídia
→ endpoint autenticado de upload
→ validação de tipo e tamanho
→ storage privado/público controlado
→ registro de licença no banco
→ aprovação por gestor
→ consumo pelo professor e aluno
```
