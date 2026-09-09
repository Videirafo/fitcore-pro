#!/usr/bin/env bash
set -euo pipefail
ROOT="/opt/fitcore-pro"
DOMAIN="fitcore.marcaia.app"
BASE="https://$DOMAIN"
cd "$ROOT"

echo "MVP-27 — verificando Shell Next real e rotas limpas"
node tools/check-next-app.mjs
echo "OK: contrato Next validado."
systemctl is-active --quiet fitcore-next
echo "OK: fitcore-next ativo."
systemctl is-active --quiet fitcore-api
echo "OK: fitcore-api ativa."
ss -ltnp 'sport = :3001' | grep -q '127.0.0.1:3001'
echo "OK: Next escutando localmente em 127.0.0.1:3001."

curl -fsS "$BASE/api/mvp-10/postgres-store" | grep -q '"active_store": "PostgresStore"'
echo "OK: PostgreSQL ativo via API."
curl -fsS "$BASE/api/mvp-15/session" | grep -q '"ok": true'
echo "OK: sessão/RBAC continua disponível."

for route in / /login /onboarding /equipe /alunos /treinos /execucao /evolucao; do
  headers="$(curl -fsSI "$BASE$route")"
  echo "$headers" | grep -q 'HTTP/2 200'
  echo "$headers" | grep -qi 'x-fitcore-shell: next-shell'
  html="$(curl -fsS "$BASE$route")"
  safe_name="${route#/}"
  [ -n "$safe_name" ] || safe_name="home"
  printf "%s" "$html" > "/tmp/fitcore-mvp27-${safe_name}.html"
  echo "$html" | grep -q 'FitCore Pro'
  echo "$html" | grep -q '__next'
  echo "OK: rota limpa publicada via Next: $route"
done

curl -fsSI "$BASE/mvp-26.html" | grep -q 'HTTP/2 200'
echo "OK: legado /mvp-26.html preservado."
curl -fsSI "$BASE/api/health" | grep -q 'HTTP/2 200'
curl -fsSI "$BASE/api/health" | grep -qi 'x-fitcore-api: owned-api'
echo "OK: API própria segue roteada."
curl -fsSI "$BASE/media/exercises/0026-barbell-bench-squat.gif?mvp27=$(date +%s)" | grep -q 'HTTP/2 200'
echo "OK: mídia de exercícios mantida."

python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
BAD = ['MVP-', 'tenant', 'RBAC', 'PostgreSQL', 'Validação funcional', 'MarcaIA Fitness']
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip=False; self.text=[]
    def handle_starttag(self, tag, attrs):
        if tag in {'script','style'}: self.skip=True
    def handle_endtag(self, tag):
        if tag in {'script','style'}: self.skip=False
    def handle_data(self, data):
        if not self.skip and data.strip(): self.text.append(data.strip())
for route in ['home', 'login', 'onboarding', 'equipe', 'alunos', 'treinos', 'execucao', 'evolucao']:
    path = Path(f'/tmp/fitcore-mvp27-{route}.html')
    html = path.read_text(encoding='utf-8', errors='ignore')
    p=Parser(); p.feed(html)
    visible=' '.join(p.text)
    bad=[b for b in BAD if b in visible]
    if bad:
        raise SystemExit(f'ERRO: texto técnico visível em {route}: {bad}')
print('OK: copy pública limpa nas rotas Next.')
PY

echo "MVP-27 verificado: Shell Next real, rotas limpas, API, sessão/RBAC, PostgreSQL e mídia preservados."
