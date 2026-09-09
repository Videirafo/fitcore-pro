# FitCore Next Site

Shell Next.js do FitCore Pro.

Nesta etapa o deploy público ainda usa `apps/site-static` para preservar a operação já validada. O Next entra como estrutura canônica de front para migração gradual:

- `app/layout.tsx` importa `app/globals.css`;
- `components/FitCoreShell.tsx` centraliza navegação;
- `lib/fitcore-api.ts` centraliza chamadas com `credentials: include`;
- `app/mvp-22/page.tsx` espelha a gestão de usuários por tenant.

Quando a build Next estiver conectada ao Nginx, as telas estáticas podem ser substituídas por rotas App Router sem recriar backend, banco ou RBAC.
