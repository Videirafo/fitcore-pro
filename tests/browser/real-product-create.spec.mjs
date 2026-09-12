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
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("marca oficial usa transparência nativa sem caixa branca", async ({ page }) => {
  await page.goto("/");
  const lockup = page.locator(".fitcore-lockup").first();
  await expect(lockup).toBeVisible();
  await expect(lockup.locator("img")).toHaveAttribute("src", "/brand/fitcore-pro-official.png");
  const style = await lockup.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, shadow: css.boxShadow, border: css.borderTopWidth };
  });
  expect(style.background).toBe("rgba(0, 0, 0, 0)");
  expect(style.shadow).toBe("none");
  expect(style.border).toBe("0px");

  const publicBrand = page.locator(".fcx-public-nav .fcx-brand-official").first();
  const publicBrandVisual = await publicBrand.evaluate((el) => {
    const before = getComputedStyle(el, "::before");
    const header = getComputedStyle(el.closest(".fcx-public-nav"));
    return { halo: before.backgroundImage, header: header.backgroundImage };
  });
  expect(publicBrandVisual.halo).toContain("radial-gradient");
  expect(publicBrandVisual.header).toContain("linear-gradient");

  await page.goto("/cadastro");
  const wrapper = page.locator(".brand-official-transparent").first();
  await expect(wrapper).toBeVisible();
  const wrapperStyle = await wrapper.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      background: css.backgroundColor,
      image: css.backgroundImage,
      shadow: css.boxShadow,
      border: css.borderTopWidth,
      radius: css.borderRadius,
      padding: css.padding,
    };
  });
  expect(wrapperStyle.background).toBe("rgba(0, 0, 0, 0)");
  expect(wrapperStyle.image).toBe("none");
  expect(wrapperStyle.shadow).toBe("none");
  expect(wrapperStyle.border).toBe("0px");
  expect(wrapperStyle.radius).toBe("0px");
  expect(wrapperStyle.padding).toBe("0px");
});

test("cadastro → gestor → equipe → aluno vinculado → professor prescreve", async ({
  page,
}) => {
  await page.goto("/cadastro");
  await expect(
    page.getByRole("heading", { name: "Crie sua operação FitCore" }),
  ).toBeVisible();

  await page.getByLabel("Nome do negócio").fill(`Academia Browser ${slug}`);
  await page.getByLabel("Endereço digital").fill(slug);
  await page.getByLabel("Cidade", { exact: true }).fill("Saquarema");
  await page.getByLabel("UF").fill("RJ");
  await page.getByLabel("Nome completo").fill("Gestor Browser QA");
  await page.getByLabel("E-mail profissional").fill(ownerLogin);
  await page.getByLabel("WhatsApp / telefone").fill("22999998888");
  await page.getByLabel("Crie sua senha").fill(ownerSecret);
  await page.getByLabel("Confirme a senha").fill(ownerSecret);
  await page.getByLabel(/Li e aceito os Termos de Uso/).check();
  await page.getByLabel(/Li e aceito a Política de Privacidade/).check();
  await page.getByRole("button", { name: "Criar minha operação →" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText("Gestor Browser QA").first()).toBeVisible();

  await page.goto("/equipe");
  await page
    .getByLabel("Nome", { exact: true })
    .first()
    .fill("Professor Browser QA");
  await page.getByLabel("Papel").first().selectOption("professor");
  await page.getByLabel("E-mail", { exact: true }).fill(profLogin);
  await page.getByLabel("WhatsApp / telefone").fill("22999997777");
  await page.getByLabel("Senha", { exact: true }).fill(profSecret);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expectSuccess(page, "Criar usuário");
  await expect(page.getByText("Professor Browser QA").first()).toBeVisible();

  await page
    .getByLabel("Nome", { exact: true })
    .first()
    .fill("Aluno Browser QA");
  await page.getByLabel("Papel").first().selectOption("aluno");
  await page.getByLabel("E-mail", { exact: true }).fill(alunoLogin);
  await page.getByLabel("WhatsApp / telefone").fill("22999996666");
  await page.getByLabel("Senha", { exact: true }).fill(alunoSecret);
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

  await page.goto("/dashboard");
  const realConsole = page.locator(".role-console37");
  await expect(realConsole.getByRole("heading", { name: "Dashboard executivo do dono" })).toBeVisible();
  await expect(realConsole.locator(".console-kpi-grid .metric").filter({ hasText: "Alunos" }).first()).toContainText("1");
  await expect(realConsole.locator(".console-kpi-grid .metric").filter({ hasText: "Equipe" }).first()).toContainText("3");
  await expect(realConsole.locator(".console-kpi-grid .metric").filter({ hasText: "Treinos" }).first()).toContainText("1");
  await expect(page.getByText("Fernando Lima")).toHaveCount(0);
  await expect(page.getByText("Academia Movimento")).toHaveCount(0);
  await expect(page.getByText("Carlos Almeida")).toHaveCount(0);

  await page.goto("/agents");
  await page.getByPlaceholder("Digite sua pergunta...").fill("Quem está usando o sistema?");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expectSuccess(page, "Assistente IA");
  const agentAnswer = page.locator(".agent-answer").first();
  await expect(agentAnswer).toContainText("Gestor Browser QA");
  await expect(agentAnswer).toContainText("Professor Browser QA");
  await expect(agentAnswer).toContainText("Aluno Browser QA");
  await expect(agentAnswer).toContainText("não significa presença online em tempo real");

  await page.goto("/setup");
  await expect(page.getByText(/Professor/).first()).toBeVisible();
  await expect(page.getByText(/Alunos/).first()).toBeVisible();
  await expect(page.getByText(/Treinos/).first()).toBeVisible();
});
