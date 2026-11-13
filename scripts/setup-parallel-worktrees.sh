#!/usr/bin/env bash
set -euo pipefail

# Cria 3 worktrees LOCAIS e isoladas. Nunca execute no servidor de produção.
usage() { printf 'Uso: bash scripts/setup-parallel-worktrees.sh ID_DA_TAREFA\nEx.: bash scripts/setup-parallel-worktrees.sh issue-123\n' >&2; }
[[ $# -eq 1 ]] || { usage; exit 2; }
task="$1"
[[ "$task" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$ ]] || { echo 'Erro: ID inválido. Use letras, números, _ ou - (até 40 caracteres).' >&2; exit 2; }
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo 'Erro: execute dentro de um repositório Git.' >&2; exit 2; }
cd "$root"
[[ -z "$(git status --porcelain)" ]] || { echo 'Erro: existem mudanças locais. Salve ou descarte conscientemente antes de criar worktrees.' >&2; exit 2; }
base_sha="$(git rev-parse HEAD)"
repo_name="$(basename "$root")"
roles=(ui api qa)
# Checa tudo antes de criar qualquer diretório.
for role in "${roles[@]}"; do
  branch="agent/${task}/${role}"
  folder="${root}/../${repo_name}-wt-${task}-${role}"
  if git show-ref --verify --quiet "refs/heads/${branch}"; then echo "Erro: branch já existe: ${branch}" >&2; exit 3; fi
  if [[ -e "$folder" ]]; then echo "Erro: pasta já existe: ${folder}" >&2; exit 3; fi
done
printf 'Base imutável deste lote: %s\n' "$base_sha"
for role in "${roles[@]}"; do
  branch="agent/${task}/${role}"
  folder="${root}/../${repo_name}-wt-${task}-${role}"
  git worktree add -b "$branch" "$folder" "$base_sha"
done
printf '\nWorktrees criadas. Abra um terminal VS Code por pasta; nenhuma IA foi iniciada.\n'
git worktree list
