import { test, expect } from "@playwright/test";

const slug = process.env.FITCORE_E2E_SLUG;
const alunoLogin = process.env.FITCORE_E2E_ALUNO_LOGIN;
const alunoSecret = process.env.FITCORE_E2E_ALUNO_SECRET;

async function loginAluno(page) {
  await page.goto("/login");
  await page.getByLabel("E-mail ou identificador").fill(alunoLogin);
  await page.getByLabel("Senha ou código").fill(alunoSecret);
  await page.getByLabel("Unidade (opcional)").fill(slug);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectSuccess(page, title) {
  const toast = page.locator(".toast");
  await expect(toast).toContainText(title);
  await expect(toast).toContainText("Concluído com sucesso.");
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
  await page.getByRole("button", { name: "Iniciar treino liberado" }).click();
  await expectSuccess(page, "Iniciar treino");
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Marcar próximo exercício" }).click();
  await expectSuccess(page, "Marcar exercício");

  const executionSelect = page.getByLabel("Execução em andamento");
  const firstValue = await executionSelect
    .locator("option")
    .nth(0)
    .getAttribute("value");
  if (firstValue) await executionSelect.selectOption(firstValue);
  await page.getByRole("button", { name: "Concluir treino" }).click();
  await expectSuccess(page, "Concluir treino");

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
