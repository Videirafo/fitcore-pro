import { test, expect } from "@playwright/test";

const slug = process.env.FITCORE_E2E_SLUG;
const ownerLogin = process.env.FITCORE_E2E_OWNER_LOGIN;
const ownerSecret = process.env.FITCORE_E2E_OWNER_SECRET;
const profLogin = process.env.FITCORE_E2E_PROF_LOGIN;
const profSecret = process.env.FITCORE_E2E_PROF_SECRET;
const alunoLogin = process.env.FITCORE_E2E_ALUNO_LOGIN;
const alunoSecret = process.env.FITCORE_E2E_ALUNO_SECRET;

async function expectSuccess(page, title) {
  const toast = page.locator(".toast");
  await expect(toast).toContainText(title);
  await expect(toast).toContainText("Concluído com sucesso.");
}

async function logout(page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sair da sessão" }).click();
  await expectSuccess(page, "Logout");
}

async function login(page, identifier, secret) {
  await page.goto("/login");
  await page.getByLabel("E-mail ou identificador").fill(identifier);
  await page.getByLabel("Senha ou código").fill(secret);
  await page.getByLabel("Unidade (opcional)").fill(slug);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("cadastro → gestor → equipe → aluno vinculado → professor prescreve", async ({
  page,
}) => {
  await page.goto("/cadastro");
  await expect(
    page.getByRole("heading", { name: "Criar operação fitness" }),
  ).toBeVisible();

  await page.getByLabel("Nome do negócio").fill(`Academia Browser ${slug}`);
  await page.getByLabel("Slug desejado").fill(slug);
  await page.getByLabel("Gestor proprietário").fill("Gestor Browser QA");
  await page.getByLabel("Identificador de login").fill(ownerLogin);
  await page.getByLabel("Senha ou código").fill(ownerSecret);
  await page.getByRole("button", { name: "Criar e configurar equipe" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText("Gestor Browser QA").first()).toBeVisible();

  await page.goto("/equipe");
  await page
    .getByLabel("Nome", { exact: true })
    .first()
    .fill("Professor Browser QA");
  await page.getByLabel("Papel").first().selectOption("professor");
  await page.getByLabel("Identificador", { exact: true }).fill(profLogin);
  await page.getByLabel("Senha/código").fill(profSecret);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expectSuccess(page, "Criar usuário");
  await expect(page.getByText("Professor Browser QA").first()).toBeVisible();

  await page
    .getByLabel("Nome", { exact: true })
    .first()
    .fill("Aluno Browser QA");
  await page.getByLabel("Papel").first().selectOption("aluno");
  await page.getByLabel("Identificador", { exact: true }).fill(alunoLogin);
  await page.getByLabel("Senha/código").fill(alunoSecret);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expectSuccess(page, "Criar usuário");
  await expect(page.getByText("Aluno Browser QA").first()).toBeVisible();

  await page.goto("/alunos");
  await page.getByLabel("Nome público").fill("Aluno Browser QA");
  const alunoUserSelect = page.getByLabel("Usuário aluno");
  const alunoUserValue = await alunoUserSelect
    .locator("option")
    .filter({ hasText: "Aluno Browser QA" })
    .getAttribute("value");
  if (!alunoUserValue)
    throw new Error("Usuário aluno não apareceu no cadastro operacional.");
  await alunoUserSelect.selectOption(alunoUserValue);
  await page
    .getByLabel("Professor responsável")
    .selectOption({ label: "Professor Browser QA" });
  await page.getByLabel("Objetivo").fill("força e evolução");
  await page
    .getByRole("button", { name: "Cadastrar e prescrever treino" })
    .click();
  await expect(page).toHaveURL(/\/treinos\?student=/);
  await expect(
    page.getByLabel("Aluno").locator("option:checked"),
  ).toHaveText("Aluno Browser QA");

  await logout(page);
  await login(page, profLogin, profSecret);
  await expect(page.getByText(/professor/i).first()).toBeVisible();
  await page.goto("/alunos");
  await expect(page.getByText("Aluno Browser QA").first()).toBeVisible();

  await page.goto("/treinos");
  await page.getByLabel("Nome do treino").fill("Treino Browser QA");
  await page.getByLabel("Objetivo").fill("força e condicionamento");
  await page.getByRole("button", { name: "Criar prescrição" }).click();
  await expectSuccess(page, "Criar prescrição");
  const workout = page
    .locator("article.item")
    .filter({ hasText: "Treino Browser QA" })
    .first();
  await expect(workout).toBeVisible();
  await workout.getByRole("button", { name: "Aprovar" }).click();
  await expectSuccess(page, "Aprovar treino");
  await expect(workout).toContainText("aprovado");

  await logout(page);
  await login(page, ownerLogin, ownerSecret);
  await page.goto("/setup");
  await expect(page.getByText(/Professor/).first()).toBeVisible();
  await expect(page.getByText(/Alunos/).first()).toBeVisible();
  await expect(page.getByText(/Treinos/).first()).toBeVisible();
});
