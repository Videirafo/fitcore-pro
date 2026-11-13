# Padrão de agentes em paralelo — FitCore Pro

> Proposta de governança da Issue #143. Esta alteração é apenas preparação para revisão; **não habilita agentes nem altera produção**. Fonte: kit Agentes em Paralelo (imagem, HTML e PDF fornecidos em 13/11/2026).

## Regra obrigatória

1. O coordenador abre/verifica a Issue, define escopo e SHA-base e distribui até três tarefas realmente independentes.
2. **Uma Git worktree + uma branch exclusiva por agente**, criada a partir do mesmo commit. Todos compartilham histórico Git, mas NÃO o diretório de trabalho.
3. Cada agente recebe uma lista fechada de arquivos editáveis, um prompt individual e permissão explícita para fazer somente commits locais. Sem alterações sobrepostas.
4. Arquivos comuns (ex.: `package.json`, lockfile, arquivos de configuração, `.github/`, `AGENTS.md` e migrações) ficam reservados ao coordenador, a menos que um único agente seja explicitamente designado.
5. Integrar um PR por vez, revisar diff, checar testes e CI no SHA exato, com autorização humana antes de merge/deploy. Nunca promover diretamente a partir de uma worktree.

## Proposta inicial de divisão (ajustar à Issue real)

Web/mobile: `apps/` | Domínio/API: `services/`, `packages/` | QA: `tests/` e verificações em `tools/` designadas pela coordenação

**Atenção:** os diretórios acima são sugestões de fronteira, não autorização irrestrita. Um coordenador deve transformar essas fronteiras em caminhos exatos antes de iniciar. Se duas tarefas precisam do mesmo arquivo, serializar ou reuni-las em um único agente.

## Preparação no VS Code (Git Bash/WSL/Linux/macOS)

No clone local, em branch-base revisada e árvore limpa:

```bash
git status --short
git rev-parse HEAD
bash scripts/setup-parallel-worktrees.sh issue-143
git worktree list
```

O script faz verificações de colisão e cria **três** pastas irmãs e branches `agent/issue-143/{ui,api,qa}`. Não baixa dependências, não copia `.env`, não inicia uma IA, não faz push nem merge. **Não execute na VPS de produção.** A cada tarefa nova, escolha outro identificador. As pastas são para desenvolvimento local.

Em três terminais separados, abra as pastas exibidas por `git worktree list` com `code CAMINHO`. Inicie o seu Codex/Claude/Cursor *dentro da worktree correspondente*, conforme o programa instalado. Se precisar de instalação de dependências, use o gerenciador do projeto na worktree e portas locais diferentes. Segredos e acessos devem seguir os controles do projeto; nunca versionar/copiar `.env` automaticamente.

## Prompt a ser entregue individualmente

```text
Você é o agente [ui|api|qa] da Issue #143 no projeto FitCore Pro.
Sua worktree é [pasta]; sua branch é [branch]; base SHA [SHA].
OBJETIVO: [resultado verificável].
ARQUIVOS PERMITIDOS: [lista exata].
ARQUIVOS PROIBIDOS: qualquer caminho não listado; especialmente segredos,
lockfiles, migrações, CI e configurações compartilhadas sem delegação expressa.
Leia AGENTS.md e os documentos canônicos do projeto.
Não faça merge, deploy, publicação, migração, push não autorizado ou alterações
na produção. Não invente resultados. Faça commit apenas das mudanças próprias.
Entregue: SHA de commit, arquivos tocados, comandos de testes executados e
resultados reais, riscos, pendências e instruções de validação.
```

## Handoff obrigatório do agente

```text
Issue:
Agente / escopo permitido:
Branch / worktree:
SHA-base / SHA-commit:
Arquivos modificados:
Mudanças funcionais e decisões:
Comandos realmente executados e resultados:
Testes NÃO executados / bloqueios:
Riscos: dados, segurança, CI, mobile, rollback:
Próxima ação do coordenador:
```

## Integração e critérios de aceite

1. Coordenador verifica `git status --short`, `git diff --stat`, `git log`, arquivos alterados e **ausência de mudanças fora do escopo**; confere também o handoff de cada agente.
2. Verificações recomendadas: `npm run site:next:check`, `npm run mobile:analyze`, `npm run mobile:test` e gates de marca/segurança conforme arquivos modificados. Nunca executar scripts `*:apply`, deploy ou gates mutáveis sem ambiente isolado comprovado.
3. Branches de agentes podem originar PRs independentes ou ser integradas em uma branch de integração isolada, sempre **uma por vez**, com revisão entre etapas. Conflitos não devem ser resolvidos por sobrescrita silenciosa; `git merge --abort` restaura uma integração falha quando aplicável.
4. Revalidar o resultado combinado, incluindo CI/checks no **SHA exato do PR**, não presumir sucesso com base em checks de outro commit.
5. Somente após revisão, aprovação explícita e gates do produto, considerar merge/release. Worktrees só podem ser removidas após handoff/commits confirmados e autorização consciente; não executar `git worktree prune` ou `git branch -D` indiscriminadamente.

## Restrições específicas

Preservar o contrato COHI, o brand oficial, o aplicativo Flutter, RLS e isolamento de tenants; sempre abrir Issue e PR.

As demais regras do `AGENTS.md` e do projeto prevalecem em caso de dúvida. **Status da adoção:** documentada neste PR; execução real com três agentes só fica comprovada mediante logs/commits de uma Issue de desenvolvimento.
