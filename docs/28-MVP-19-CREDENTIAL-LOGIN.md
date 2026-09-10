# MVP-19 — Cadastro/login com credencial mínima

## Objetivo

Adicionar entrada real por senha ou código de acesso, sem depender apenas do convite por token nem dos botões demo.

Fluxo validado:

```txt
usuário convidado/sessão existente → define credencial → logout → login por identificador + senha/código → sessão assinada → papel do banco
```

## Escopo

- usuário define senha ou código de acesso;
- segredo salvo com hash scrypt e salt, nunca em texto puro;
- convite deixa de ser a única entrada;
- sessão demo é substituída por login de credencial real;
- recuperação por token controlado;
- revogação de credencial;
- tenant_id, RBAC e auditoria de autenticação mantidos.

## Arquivos

```txt
services/api/security/credential-auth.mjs
infra/sql/005-mvp-19-credential-login.sql
infra/scripts/apply-mvp-19-credential-login.sh
infra/scripts/verify-mvp-19-credential-login.sh
infra/scripts/rollback-mvp-19-credential-login.sh
apps/site-static/mvp-19.html
apps/site-static/mvp-19.css
apps/site-static/mvp-19.js
```

## Endpoints

```txt
GET  /api/mvp-19/status
GET  /api/mvp-19/credentials/me
POST /api/mvp-19/credentials/set
POST /api/mvp-19/login
POST /api/mvp-19/recovery/request
POST /api/mvp-19/recovery/complete
POST /api/mvp-19/credentials/revoke
```

## Critério de pronto

- credencial não funciona antes da ativação do MVP-19;
- usuário logado define identificador e senha/código;
- login por credencial cria sessão assinada com `login_source=mvp19_credential`;
- papel segue vindo do banco;
- headers não são fonte final de confiança;
- recuperação troca a credencial por token válido;
- credencial revogada deixa de autenticar;
- eventos `credential_set`, `credential_login_ok`, `recovery_requested`, `recovery_completed` e `credential_revoked` são auditados.

## Próximo gate

MVP-20:

```txt
Hardening de autenticação
→ bloquear login demo em produção
→ rate limit por IP/hash
→ expiração/revogação de sessões antigas
→ política de senha/código
→ logs de segurança por tenant
```

## Operação segura do login do gestor

O gestor bootstrap mantém uma única identidade e uma única credencial. Para trocar o identificador de acesso por um e-mail, preserve o hash existente em vez de criar um segundo usuário gestor.

```bash
FITCORE_GESTOR_EMAIL='gestor@empresa.com' npm run gestor:login-email -- --check
FITCORE_GESTOR_EMAIL='gestor@empresa.com' npm run gestor:login-email -- --apply
```

O script `infra/scripts/set-gestor-login-email.sh` valida tenant, papel, credencial ativa e usuário bootstrap antes da alteração. O `--apply` muda apenas `login_identifier`, registra auditoria e mantém o segredo/hash existente. Quando presente, o arquivo local de bootstrap também recebe o novo identificador para evitar regressão em uma futura execução do seed.

Na interface principal, o campo de unidade é opcional quando o tenant padrão atende o usuário. O campo de autenticação deve ser apresentado como **E-mail ou identificador**, evitando que o navegador ou o usuário confundam e-mail com slug técnico.
