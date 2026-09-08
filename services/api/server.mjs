#!/usr/bin/env node

/**
 * FITCORE PRO - API propria inicial
 *
 * API HTTP sem dependencias externas para validar a arquitetura:
 * Tela propria FitCore -> API propria -> exercises.normalized.json + wger interno.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.FITCORE_API_PORT || "8091", 10);
const host = process.env.FITCORE_API_HOST || "127.0.0.1";
const catalogPath = resolve(root, "storage/exercises-dataset/exercises.normalized.json");
const wgerInternalUrl = process.env.FITCORE_WGER_INTERNAL_URL || "http://127.0.0.1:8088";

let catalogCache = null;
let catalogLoadedAt = null;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-fitcore-api": "owned-api",
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 404, {
    error: "not_found",
    message: "Endpoint nao encontrado.",
  });
}

function loadCatalog() {
  if (catalogCache) return catalogCache;

  if (!existsSync(catalogPath)) {
    throw new Error(`Catalogo normalizado nao encontrado em ${catalogPath}. Rode: npm run exercises:sync && npm run exercises:normalize`);
  }

  const raw = readFileSync(catalogPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Catalogo normalizado invalido: esperado array JSON.");
  }

  catalogCache = parsed;
  catalogLoadedAt = new Date().toISOString();
  return catalogCache;
}

function toPublicExercise(record, includeDetails = false) {
  const base = {
    source_id: record.source_id,
    slug: record.slug,
    name: record.name,
    category: record.category,
    body_part: record.body_part,
    equipment: record.equipment,
    target: record.target,
    primary_muscle: record.primary_muscle,
    muscle_group: record.muscle_group,
    secondary_muscles: record.secondary_muscles || [],
    media_policy: record.media_policy,
  };

  if (!includeDetails) return base;

  return {
    ...base,
    instructions_en: record.instructions_en,
    instructions_pt_br: record.instructions_pt_br,
    instructions: record.instructions || {},
    instruction_steps: record.instruction_steps || {},
    safety_notes: record.safety_notes || [],
    created_at: record.created_at,
    normalized_at: record.normalized_at,
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function listExercises(url) {
  const catalog = loadCatalog();
  const search = normalizeText(url.searchParams.get("search"));
  const bodyPart = normalizeText(url.searchParams.get("body_part"));
  const equipment = normalizeText(url.searchParams.get("equipment"));
  const target = normalizeText(url.searchParams.get("target"));
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const filtered = catalog.filter((record) => {
    if (bodyPart && normalizeText(record.body_part) !== bodyPart) return false;
    if (equipment && normalizeText(record.equipment) !== equipment) return false;
    if (target && normalizeText(record.target) !== target) return false;
    if (search && !normalizeText(record.search_text || record.name).includes(search)) return false;
    return true;
  });

  const items = filtered.slice(offset, offset + limit).map((record) => toPublicExercise(record));

  return {
    items,
    total: filtered.length,
    limit,
    offset,
    next_offset: offset + items.length < filtered.length ? offset + items.length : null,
    media_policy: "textual_only",
  };
}

function getExerciseBySlug(slug) {
  const catalog = loadCatalog();
  const record = catalog.find((item) => item.slug === slug || item.source_id === slug);
  return record ? toPublicExercise(record, true) : null;
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
      const catalogExists = existsSync(catalogPath);
      return sendJson(res, 200, {
        ok: true,
        service: "fitcore-api",
        api: "owned-api",
        catalog_exists: catalogExists,
        catalog_path: catalogPath,
        catalog_loaded: Boolean(catalogCache),
        catalog_loaded_at: catalogLoadedAt,
        wger_internal_url: wgerInternalUrl,
        media_policy: "textual_only",
      });
    }

    if (url.pathname === "/api/exercises") {
      return sendJson(res, 200, listExercises(url));
    }

    const match = url.pathname.match(/^\/api\/exercises\/([^/]+)$/);
    if (match) {
      const item = getExerciseBySlug(decodeURIComponent(match[1]));
      if (!item) return sendJson(res, 404, { error: "exercise_not_found" });
      return sendJson(res, 200, item);
    }

    return sendNotFound(res);
  } catch (error) {
    return sendJson(res, 500, {
      error: "fitcore_api_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`FitCore API ouvindo em http://${host}:${port}`);
});
