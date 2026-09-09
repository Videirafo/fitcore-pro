// FITCORE PRO — MVP-10
// Glue entre server.mjs e PersistenceAdapter.
// O servidor fala com um adapter explícito, mantém JsonFileStore como fallback seguro
// e só ativa PostgresStore quando a configuração e a migration estiverem verificadas.

import { createPersistenceDescriptor } from "./adapter-contract.mjs";
import { PostgresStore } from "./postgres-store.mjs";

const RESOURCE_PATH_KEYS = Object.freeze({
  studentsAndWorkouts: "studentsAndWorkouts",
  checkins: "checkins",
  professorReviews: "professorReviews",
});

function assertDependency(name, value) {
  if (!value) {
    throw new Error(`Dependência obrigatória ausente no PersistenceAdapter: ${name}`);
  }
}

function assertResource(resource) {
  const pathKey = RESOURCE_PATH_KEYS[resource];
  if (!pathKey) {
    throw new Error(`Recurso de persistência não registrado: ${resource}`);
  }
  return pathKey;
}

function requestedPostgres(env) {
  const requested = String(env.FITCORE_PERSISTENCE_STORE || env.FITCORE_STORE || "").trim().toLowerCase();
  return requested === "postgres" || requested === "postgres_store" || requested === "postgresstore";
}

function createJsonFileStore({ paths, readJsonArray, writeJsonArray }) {
  return {
    name: "JsonFileStore",
    readArray(resource) {
      const pathKey = assertResource(resource);
      return readJsonArray(paths[pathKey]);
    },
    writeArray(resource, records) {
      const pathKey = assertResource(resource);
      if (!Array.isArray(records)) {
        throw new Error(`Persistência esperava array para ${resource}.`);
      }
      writeJsonArray(paths[pathKey], records);
    },
    getPath(resource) {
      const pathKey = assertResource(resource);
      return paths[pathKey];
    },
  };
}

export function createServerPersistenceAdapter({
  env = process.env,
  paths,
  readJsonArray,
  writeJsonArray,
} = {}) {
  assertDependency("paths", paths);
  assertDependency("readJsonArray", readJsonArray);
  assertDependency("writeJsonArray", writeJsonArray);

  const baseDescriptor = createPersistenceDescriptor(env);
  const jsonFileStore = createJsonFileStore({ paths, readJsonArray, writeJsonArray });
  const postgresActivationRequested = requestedPostgres(env);
  const databaseConfigured = Boolean(String(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "").trim());

  let activeStore = jsonFileStore;
  let postgres = {
    activation_requested: postgresActivationRequested,
    configured: databaseConfigured,
    ready: false,
    status: databaseConfigured ? "aguardando_ativacao_controlada" : "aguardando_database_url",
    message: databaseConfigured
      ? "FITCORE_DATABASE_URL presente; defina FITCORE_PERSISTENCE_STORE=postgres para ativar após aplicar MVP-10."
      : "FITCORE_DATABASE_URL ausente; JsonFileStore segue ativo.",
  };

  if (postgresActivationRequested) {
    const candidate = new PostgresStore({ env });
    const readiness = candidate.checkReady();
    postgres = {
      activation_requested: true,
      configured: databaseConfigured,
      ...readiness,
    };

    if (databaseConfigured && readiness.ready) {
      activeStore = candidate;
    }
  }

  const usingPostgres = activeStore.name === "PostgresStore";

  const descriptor = {
    ...baseDescriptor,
    ok: true,
    mvp: "MVP-10 PostgresStore controlado",
    adapter: "PersistenceAdapter",
    serverConnected: true,
    requestedStore: postgresActivationRequested ? "PostgresStore" : baseDescriptor.selectedStore,
    selectedStore: activeStore.name,
    activeStore: activeStore.name,
    fallbackPreserved: true,
    databaseConfigured,
    safeFallback: !usingPostgres,
    postgres,
    resources: baseDescriptor.resources,
    stores: [
      {
        name: "JsonFileStore",
        status: usingPostgres ? "fallback_disponivel" : "ativo",
        purpose: "mantém os MVPs funcionando se o banco não estiver pronto ou se rollback for necessário",
      },
      {
        name: "PostgresStore",
        status: usingPostgres ? "ativo" : postgres.status,
        purpose: "persistência real multi-tenant após migration MVP-07 + MVP-10",
      },
    ],
    policy: {
      ...baseDescriptor.policy,
      tenantIdRequired: true,
      actorRoleRequired: true,
      auditRequired: true,
      fallbackRollback: "remova FITCORE_PERSISTENCE_STORE=postgres para voltar ao JsonFileStore",
      lgpd: "dados mínimos, tenant_id, user_role, auditoria por ação e fallback seguro",
    },
    reason: usingPostgres
      ? "PostgresStore ativo: FITCORE_PERSISTENCE_STORE=postgres, FITCORE_DATABASE_URL presente e migration verificada."
      : postgresActivationRequested
        ? `PostgresStore solicitado, mas não ativado: ${postgres.message || postgres.status}. JsonFileStore segue como fallback seguro.`
        : databaseConfigured
          ? "FITCORE_DATABASE_URL presente, mas ativação explícita não solicitada. JsonFileStore segue ativo por segurança."
          : "FITCORE_DATABASE_URL ausente; JsonFileStore segue como fallback seguro.",
  };

  return {
    name: "PersistenceAdapter",
    descriptor,
    readArray(resource) {
      assertResource(resource);
      return activeStore.readArray(resource);
    },
    writeArray(resource, records) {
      assertResource(resource);
      if (!Array.isArray(records)) {
        throw new Error(`Persistência esperava array para ${resource}.`);
      }
      activeStore.writeArray(resource, records);
    },
    getPath(resource) {
      if (activeStore.getPath) return activeStore.getPath(resource);
      return null;
    },
  };
}

export function createServerPersistenceHealth(adapter) {
  assertDependency("adapter", adapter);
  const descriptor = adapter.descriptor;

  return {
    ok: true,
    mvp: descriptor.mvp,
    adapter: descriptor.adapter,
    server_connected: Boolean(descriptor.serverConnected),
    selected_store: descriptor.selectedStore,
    active_store: descriptor.activeStore,
    requested_store: descriptor.requestedStore,
    database_configured: descriptor.databaseConfigured,
    fallback_seguro: descriptor.safeFallback,
    resources: descriptor.resources,
    stores: descriptor.stores,
    postgres: descriptor.postgres,
    policy: descriptor.policy,
    reason: descriptor.reason,
  };
}
