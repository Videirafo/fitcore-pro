# MVP-16 — Login UI integrado nas telas operacionais

## Objetivo

Integrar o login real do MVP-15 nas telas operacionais já existentes.

Fluxo validado:

```txt
MVP-01/02/03/13 UI → cookie HttpOnly assinado → /api/mvp-15/session → papel do banco → API protegida
```

## Escopo

- detectar sessão assinada ao abrir tela operacional;
- exigir login quando não houver sessão;
- criar sessão demo por papel permitido;
- enviar chamadas API com `credentials: include`;
- mostrar barra de sessão ativa;
- permitir logout centralizado;
- manter rollback pelo MVP-15 soft mode.

## Telas integradas

```txt
/mvp-01.html — gestor/professor
/mvp-02.html — gestor/professor/aluno
/mvp-03.html — gestor/professor
/mvp-13.html — gestor/professor
```

## Arquivos

```txt
apps/site-static/mvp-16-auth-ui.js
apps/site-static/mvp-16-auth-ui.css
apps/site-static/mvp-16.html
apps/site-static/mvp-16.css
apps/site-static/mvp-16.js
infra/scripts/verify-mvp-16-login-ui.sh
docs/25-MVP-16-LOGIN-UI-INTEGRADO.md
```

## Verificação

```bash
cd /opt/fitcore-pro

node --check apps/site-static/mvp-16-auth-ui.js
node --check apps/site-static/mvp-16.js
bash infra/scripts/verify-mvp-16-login-ui.sh
bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -I https://fitcore.marcaia.app/mvp-16.html
```

## Critério de pronto

- as quatro telas carregam `mvp-16-auth-ui.js`;
- as quatro telas carregam `mvp-16-auth-ui.css`;
- cada tela declara papéis permitidos no `body`;
- chamadas API usam cookie assinado;
- rota protegida sem sessão retorna 401;
- rota protegida com sessão retorna 200;
- `/mvp-16.html` responde 200.

## Próximo gate

MVP-17:

```txt
Controle de navegação por papel
→ menu muda conforme papel logado
→ aluno não vê painel de professor
→ professor não vê área administrativa indevida
→ gestor vê operação completa
→ manter sessão assinada e auditoria
```
