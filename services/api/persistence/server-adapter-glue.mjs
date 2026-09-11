// FITCORE PRO — MVP-10
// Glue entre server.mjs e PersistenceAdapter.
// Em produção, PostgreSQL é obrigatório e falhas de readiness são fail-closed.
// JsonFileStore permanece disponível somente em ambientes não produtivos e testes controlados.

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
  const runtimeEnvironment = String(env.FITCORE_ENV || env.NODE_ENV || "development").trim().toLowerCase();
  const production = runtimeEnvironment === "production";

  if (production && !postgresActivationRequested) {
    throw new Error("FITCORE_PERSISTENCE_STORE=postgres é obrigatório em produção; fallback JSON foi bloqueado.");
  }
  if (production && !databaseConfigured) {
    throw new Error("FITCORE_DATABASE_URL é obrigatório em produção; fallback JSON foi bloqueado.");
  }

  let activeStore = jsonFileStore;
  let postgres = {
    activation_requested: postgresActivationRequested,
    configured: databaseConfigured,
    ready: false,
    status: databaseConfigured ? "aguardando_ativacao_controlada" : "aguardando_database_url",
    message: databaseConfigured
      ? "FITCORE_DATABASE_URL presente; defina FITCORE_PERSISTENCE_STORE=postgres para ativar após aplicar MVP-10."
      : "FITCORE_DATABASE_URL ausente; JsonFileStore segue ativo fora de produção.",
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
    } else if (production) {
      throw new Error(`PostgreSQL indisponível ou incompleto em produção: ${readiness.status}.`);
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
    fallbackPreserved: !production,
    databaseConfigured,
    safeFallback: !production && !usingPostgres,
    postgres,
    resources: baseDescriptor.resources,
    stores: [
      {
        name: "JsonFileStore",
        status: usingPostgres ? "fallback_disponivel_fora_de_producao" : "ativo",
        purpose: "compatibilidade local/teste; bloqueado como fallback automático em produção",
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
      fallbackRollback: production
        ? "produção exige PostgreSQL; restaure o banco/configuração em vez de cair para JSON"
        : "remova FITCORE_PERSISTENCE_STORE=postgres somente em ambiente não produtivo",
      lgpd: "dados mínimos, tenant_id, user_role, auditoria por ação e persistência canônica",
    },
    reason: usingPostgres
      ? "PostgresStore ativo: configuração e migration verificadas."
      : production
        ? "Produção inválida sem PostgreSQL; este estado deveria falhar antes da inicialização."
        : postgresActivationRequested
          ? `PostgresStore solicitado, mas não ativado: ${postgres.message || postgres.status}.`
          : databaseConfigured
            ? "FITCORE_DATABASE_URL presente, mas ativação explícita não solicitada em ambiente não produtivo."
            : "FITCORE_DATABASE_URL ausente; JsonFileStore permitido somente fora de produção.",
  };

  return {
    name: "PersistenceAdapter",
    descriptor,
    storeForScope(scope = {}) {
      if (activeStore.name === "PostgresStore" && scope?.tenant_id) {
        return new PostgresStore({ env: { ...env, FITCORE_TENANT_ID: scope.tenant_id } });
      }
      return activeStore;
    },
    readArray(resource, scope = null) {
      assertResource(resource);
      const scopedStore = this.storeForScope(scope);
      return scopedStore.readArray(resource);
    },
    writeArray(resource, records, scope = null) {
      assertResource(resource);
      if (!Array.isArray(records)) {
        throw new Error(`Persistência esperava array para ${resource}.`);
      }
      const scopedStore = this.storeForScope(scope);
      scopedStore.writeArray(resource, records);
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
