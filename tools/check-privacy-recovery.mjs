import { readFileSync } from 'node:fs';
const sql=readFileSync('infra/sql/030-privacy-recovery-governance.sql','utf8');
const must=[
 'fitcore_privacy_requests','fitcore_privacy_request_events','fitcore_retention_policies',
 'ENABLE ROW LEVEL SECURITY','fitcore_block_history_mutation','fitcore_audit_events','fitcore_security_events'
];
for(const x of must) if(!sql.includes(x)) throw new Error('privacy recovery contract missing: '+x);
const gate=readFileSync('infra/scripts/gate-privacy-recovery-postgres17.sh','utf8');
if(!gate.includes('FITCORE_PRIVACY_RECOVERY_DB_GATE=PASS')) throw new Error('db gate receipt missing');
const backup=readFileSync('infra/scripts/backup-restore-evidence.sh','utf8');
for(const x of ['pg_dump','gpg','pg_restore','latest-evidence.json']) if(!backup.includes(x)) throw new Error('recovery script missing '+x);
console.log('FITCORE_PRIVACY_RECOVERY_CONTRACT=PASS');
