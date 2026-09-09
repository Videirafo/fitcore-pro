import { readFileSync } from "node:fs";

let failed = false;
function check(condition, message) {
  if (!condition) {
    failed = true;
    console.error(`ERRO: ${message}`);
  }
}
function read(path) { return readFileSync(path, "utf8"); }

const client = read("apps/site/components/FitCoreRouteClient.tsx");
const css = read("apps/site/app/globals.css");
const pkg = JSON.parse(read("package.json"));

check(client.includes('router.push("/equipe?setup=1")'), "onboarding não leva para setup guiado de equipe.");
check(client.includes('router.push(`/treinos?student='), "cadastro de aluno não avança para prescrição do aluno.");
check(client.includes('name="student_id"'), "prescrição sem dropdown de aluno real.");
check(client.includes('name="professor_id"'), "cadastro de aluno sem seleção de professor.");
check(client.includes('name="execution_id"') && client.includes('<select name="execution_id"'), "execução não usa seleção de sessão em andamento.");
check(!client.includes('<input name="execution_id"'), "execução ainda exige ID manual em input.");
check(client.includes('ActionSummary'), "ações ainda não têm resumo humano.");
check(!client.includes('className="result-box"') && !client.includes('<pre className="result-box"'), "interface ainda expõe JSON cru.");
check(client.includes('FlowHeader') && client.includes('FlowCard'), "setup guiado não está representado no front.");
check(css.includes('MVP-30') && css.includes('.flow-guide') && css.includes('.action-summary'), "CSS do fluxo guiado não está aplicado.");
check(pkg.scripts?.["mvp30:check"] && pkg.scripts?.["mvp30:verify"], "scripts do MVP-30 ausentes no package.json.");

if (failed) process.exit(1);
console.log("OK: MVP-30 fluxo operacional guiado validado por contrato.");
