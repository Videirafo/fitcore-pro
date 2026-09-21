import { test, expect } from "@playwright/test";

const slug = process.env.FITCORE_E2E_SLUG;
const alunoLogin = process.env.FITCORE_E2E_ALUNO_LOGIN;
const alunoSecret = process.env.FITCORE_E2E_ALUNO_SECRET;

async function loginAluno(page) {
  await page.goto("/login");
  await page.getByLabel("E-mail ou identificador").fill(alunoLogin);
  await page.getByLabel("Senha ou código").fill(alunoSecret);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectSuccess(page, title) {
  const toast = page.locator(".toast");
  await expect(toast).toContainText(title);
  await expect(toast).toContainText("Concluído com sucesso.");
}

async function apiJson(page, path, { method = "GET", body, headers = {} } = {}) {
  return page.evaluate(async ({ path, method, body, headers }) => {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }, { path, method, body, headers });
}

test("aluno entra após restart, executa treino e vê evolução", async ({
  page,
}) => {
  await loginAluno(page);
  await expect(page.getByText(/aluno/i).first()).toBeVisible();

  await page.goto("/treinos");
  await expect(
    page.getByRole("heading", { name: "Meus treinos" }),
  ).toBeVisible();
  await expect(page.getByText("Treino Browser QA").first()).toBeVisible();

  await page.goto("/execucao");
  await expect(page.getByText("Treino Browser QA").first()).toBeVisible();

  const tenantAnalytics = await apiJson(page, "/api/mvp-25/analytics");
  expect(tenantAnalytics.status).toBe(403);
  expect(tenantAnalytics.body.erro).toBe("execution_analytics_forbidden");

  const workouts = await apiJson(page, "/api/mvp-24/my-workouts");
  expect(workouts.status).toBe(200);
  const workoutId = workouts.body.prescriptions?.find((item) => item.status === "aprovado")?.id;
  if (!workoutId) throw new Error("Treino aprovado não encontrado para o dry-run.");

  const beforeDryRun = await apiJson(page, "/api/mvp-25/my-executions");
  const dryRun = await apiJson(page, "/api/mvp-25/executions/start?mode=dry_run", {
    method: "POST",
    body: { workout_id: workoutId },
  });
  expect(dryRun.status).toBe(200);
  expect(dryRun.body.dry_run).toBe(true);
  expect(dryRun.body.mutationPerformed).toBe(false);
  expect(dryRun.body.action_id).toBe("fitcore.workout.execution.start");
  const afterDryRun = await apiJson(page, "/api/mvp-25/my-executions");
  expect(afterDryRun.body.total).toBe(beforeDryRun.body.total);

  const missingIdempotency = await apiJson(page, "/api/mvp-25/executions/start", {
    method: "POST",
    body: { workout_id: workoutId },
  });
  expect(missingIdempotency.status).toBe(400);
  expect(missingIdempotency.body.mensagem).toBe("missing_idempotency_key");
  const afterMissingKey = await apiJson(page, "/api/mvp-25/my-executions");
  expect(afterMissingKey.body.total).toBe(beforeDryRun.body.total);

  await expect(page.getByText("Next Best Action").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Aceitar e iniciar treino recomendado/i })).toBeVisible();

  const startKey = `browser-start-${slug}`;
  let proposalId = "";
  await page.route("**/api/mvp-25/executions/start", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    proposalId = request.headers()["x-fitcore-proposal-id"] || "";
    await route.continue({
      headers: { ...request.headers(), "idempotency-key": startKey },
    });
  });
  const startResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/mvp-25/executions/start" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Aceitar e iniciar treino recomendado/i }).click();
  const startResponse = await startResponsePromise;
  const startBody = await startResponse.json();
  await page.unroute("**/api/mvp-25/executions/start");
  expect(startResponse.status()).toBe(201);
  expect(startBody.execution_kernel.state).toBe("succeeded");
  expect(startBody.execution_kernel.replayed).toBe(false);
  expect(proposalId).toMatch(/^nba_[0-9a-f]{32}$/);
  await expectSuccess(page, "Iniciar treino");
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();

  const startReplay = await apiJson(page, "/api/mvp-25/executions/start", {
    method: "POST",
    headers: { "idempotency-key": startKey, "x-fitcore-proposal-id": proposalId },
    body: { workout_id: workoutId },
  });
  expect(startReplay.status).toBe(201);
  expect(startReplay.body.execution.id).toBe(startBody.execution.id);
  expect(startReplay.body.execution_kernel.replayed).toBe(true);

  const bindingConflict = await apiJson(page, "/api/mvp-25/executions/start", {
    method: "POST",
    headers: { "idempotency-key": startKey },
    body: { workout_id: workoutId, observacoes: "binding divergente" },
  });
  expect(bindingConflict.status).toBe(409);
  expect(bindingConflict.body.mensagem).toContain("execution_binding_conflict");

  await page.getByRole("button", { name: "Marcar próximo exercício" }).click();
  await expectSuccess(page, "Marcar exercício");

  const executionSelect = page.getByLabel("Execução em andamento");
  const firstValue = await executionSelect
    .locator("option")
    .nth(0)
    .getAttribute("value");
  if (!firstValue) throw new Error("Execução em andamento não encontrada.");
  await executionSelect.selectOption(firstValue);

  const finishKey = `browser-finish-${slug}`;
  let finishPayload = null;
  await page.route("**/api/mvp-25/executions/*/finish", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    finishPayload = JSON.parse(request.postData() || "{}");
    await route.continue({
      headers: { ...request.headers(), "idempotency-key": finishKey },
    });
  });
  const finishResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/mvp-25/executions/${firstValue}/finish` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Concluir treino" }).click();
  const finishResponse = await finishResponsePromise;
  const finishBody = await finishResponse.json();
  await page.unroute("**/api/mvp-25/executions/*/finish");
  expect(finishResponse.status()).toBe(200);
  expect(finishBody.execution_kernel.state).toBe("succeeded");
  expect(finishBody.execution_kernel.replayed).toBe(false);
  await expectSuccess(page, "Concluir treino");

  const finishReplay = await apiJson(
    page,
    `/api/mvp-25/executions/${firstValue}/finish`,
    {
      method: "POST",
      headers: { "idempotency-key": finishKey },
      body: finishPayload,
    },
  );
  expect(finishReplay.status).toBe(200);
  expect(finishReplay.body.execution.id).toBe(firstValue);
  expect(finishReplay.body.execution_kernel.replayed).toBe(true);

  await page.goto("/evolucao");
  await expect(
    page.getByRole("heading", { name: "Minha evolução" }),
  ).toBeVisible();
  await expect(page.getByText("Sem histórico")).toHaveCount(0);
});

test("viewport Android não tem overflow horizontal nas telas centrais", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAluno(page);
  for (const path of ["/dashboard", "/treinos", "/execucao", "/evolucao"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  }
});
