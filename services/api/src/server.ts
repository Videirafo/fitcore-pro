import Fastify from "fastify";

/**
 * FitCore Pro API
 *
 * Backend principal do sistema.
 * Esta primeira versão tem apenas health check.
 *
 * Depois adicionaremos:
 * - alunos
 * - academias
 * - treinos
 * - check-ins
 * - pagamentos
 * - jurídico
 * - WhatsApp
 * - IA
 * - integração com wger
 */

const app = Fastify({
  logger: true,
});

app.get("/health", async () => {
  return {
    status: "ok",
    service: "fitcore-api",
    version: "0.1.0",
  };
});

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, host });
