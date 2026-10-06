# Trust Gate v1.1 — Privacy & Recovery

## Privacy lifecycle
FitCore registra solicitações de acesso, exportação, correção, exclusão e restrição em `fitcore_privacy_requests`.
Cada transição relevante gera evento append-only em `fitcore_privacy_request_events`.
Políticas de retenção são tenant-scoped e nascem desabilitadas; nenhuma exclusão automática é ativada sem decisão explícita.

## Audit
`fitcore_audit_events`, `fitcore_security_events` e o histórico de privacy requests são imutáveis por trigger.

## Recovery
`infra/scripts/backup-restore-evidence.sh`:
1. gera `pg_dump` consistente;
2. cifra com GPG AES-256 usando chave fora do Git;
3. valida descriptografia;
4. restaura em PostgreSQL 17.6 isolado;
5. verifica o schema;
6. grava receipt em `latest-evidence.json`.

A cópia externa da VPS continua obrigatória antes de promover `backup_restore` para controle totalmente enforced.
