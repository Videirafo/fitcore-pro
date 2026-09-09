# MVP-17 — Controle de navegação por papel

## Objetivo

Fazer o menu das telas operacionais mudar conforme o papel resolvido pela sessão assinada do MVP-15.

Fluxo validado:

```txt
cookie HttpOnly assinado → /api/mvp-17/navigation → papel do banco → menu visível/oculto → auditoria mínima
```

## Escopo

- menu muda conforme papel logado;
- aluno não vê painel do professor;
- professor não vê área administrativa indevida;
- gestor vê operação completa;
- sessão assinada continua obrigatória;
- papel vem do banco;
- headers não são fonte final de confiança;
- resolução de navegação gera auditoria mínima no PostgreSQL.

## Arquivos

```txt
services/api/security/navigation-rbac.mjs
apps/site-static/mvp-17-nav-rbac.js
apps/site-static/mvp-17-nav-rbac.css
apps/site-static/mvp-17.html
apps/site-static/mvp-17.css
apps/site-static/mvp-17.js
infra/scripts/verify-mvp-17-role-navigation.sh
docs/26-MVP-17-ROLE-NAVIGATION-RBAC.md
```

## Telas integradas

```txt
/mvp-01.html
/mvp-02.html
/mvp-03.html
/mvp-13.html
```

## Endpoint

```txt
GET /api/mvp-17/navigation
```

O endpoint exige sessão assinada no modo `FITCORE_AUTH_MODE=signed`.

## Critério de pronto

- sem sessão, `/api/mvp-17/navigation` retorna 401;
- gestor vê operação completa;
- professor não recebe links administrativos;
- aluno não recebe links de professor ou operação gestorial;
- aluno recebe 403 ao tentar acessar `/api/mvp-03/professor/contexto`;
- as telas operacionais carregam o menu compartilhado;
- `/mvp-17.html` responde 200;
- auditoria `navigation/menu_resolvido` é persistida.

## Próximo gate

MVP-18:

```txt
Perfis reais e convite de usuário
→ criar usuário por gestor
→ convite por link/token
→ professor/aluno recebem papel sem botão demo
→ sessão real deixa de depender de login demo
→ manter tenant_id, RBAC e auditoria
```
