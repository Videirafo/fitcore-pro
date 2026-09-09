// FITCORE PRO — MVP-08
// Adapter de persistência: contrato inicial para alternar entre JSON local e PostgreSQL.
// Este arquivo não faz conexão direta com banco. Ele define o modo seguro antes da migração real.

export const PERSISTENCE_RESOURCES = Object.freeze([
  "students",
  "workouts",
  "professor_reviews",
  "workout_executions",
  "audit_events",
]);

export const JSON_STORE_PATHS = Object.freeze({
  studentsAndWorkouts: "storage/mvp-01/aluno-treino.json",
  checkins: "storage/mvp-02/checkins.json",
  professorReviews: "storage/mvp-03/professor-reviews.json",
  dbStatus: "storage/mvp-07/db-status.json",
});

export function resolvePersistenceMode(env = process.env) {
  const databaseUrl = String(env.FITCORE_DATABASE_URL || "").trim();

  if (!databaseUrl) {
    return {
      mode: "json_file_store",
      databaseConfigured: false,
      safeFallback: true,
      reason: "FITCORE_DATABASE_URL ausente; manter JSON local.",
    };
  }

  return {
    mode: "postgres_store_configured",
    databaseConfigured: true,
    safeFallback: false,
    reason: "FITCORE_DATABASE_URL presente; PostgresStore pode ser ativado após verificação da migration.",
  };
}

export function createPersistenceDescriptor(env = process.env) {
  const mode = resolvePersistenceMode(env);

  return {
    ok: true,
    mvp: "MVP-08 Adapter de Persistência",
    adapter: "PersistenceAdapter",
    selectedStore: mode.mode,
    databaseConfigured: mode.databaseConfigured,
    safeFallback: mode.safeFallback,
    resources: PERSISTENCE_RESOURCES,
    stores: [
      {
        name: "JsonFileStore",
        status: mode.mode === "json_file_store" ? "ativo" : "fallback_disponivel",
        purpose: "mantém os MVPs 01 a 06 funcionando sem banco configurado",
      },
      {
        name: "PostgresStore",
        status: mode.databaseConfigured ? "configurado" : "aguardando_database_url",
        purpose: "persistência real multi-tenant após aplicar a migration do MVP-07",
      },
    ],
    jsonStorePaths: JSON_STORE_PATHS,
    policy: {
      tenantIdRequired: true,
      actorRoleRequired: true,
      auditRequired: true,
      lgpd: "dados mínimos, auditoria por ação e sem expor estrutura interna na UI",
    },
    reason: mode.reason,
  };
}

export function selectPersistenceStore(env = process.env) {
  const descriptor = createPersistenceDescriptor(env);

  return {
    name: descriptor.selectedStore,
    descriptor,
  };
}
