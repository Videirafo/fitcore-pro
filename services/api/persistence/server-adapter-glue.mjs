// FITCORE PRO — MVP-09
// Glue entre server.mjs e PersistenceAdapter.
// O servidor passa a falar com um adapter explícito, mas mantém JsonFileStore como fallback seguro.

import { createPersistenceDescriptor } from "./adapter-contract.mjs";

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

  const descriptor = {
    ...baseDescriptor,
    ok: true,
    mvp: "MVP-09 Server Persistence Adapter",
    serverConnected: true,
    requestedStore: baseDescriptor.selectedStore,
    selectedStore: "JsonFileStore",
    activeStore: "JsonFileStore",
    fallbackPreserved: true,
    databaseConfigured: Boolean(baseDescriptor.databaseConfigured),
    safeFallback: true,
    reason: baseDescriptor.databaseConfigured
      ? "FITCORE_DATABASE_URL presente; MVP-09 mantém JsonFileStore até PostgresStore ser ativado com migration verificada."
      : "FITCORE_DATABASE_URL ausente; JsonFileStore segue como fallback seguro.",
  };

  return {
    name: "PersistenceAdapter",
    descriptor,
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
    policy: descriptor.policy,
    reason: descriptor.reason,
  };
}
