import { readFileSync } from "node:fs";

const landing=readFileSync("apps/site/components/FitCoreExactVisuals.tsx","utf8");
const css=readFileSync("apps/site/app/exact-preview.css","utf8");

const checks=[
  ["ProductShot import", /import \{ ProductShot \} from "\.\/FitCoreProductShots";/.test(landing)],
  ["proof section", /id="produto-em-uso"/.test(landing) && /PRODUTO EM USO/.test(landing)],
  ["proof-first order", landing.indexOf('id="produto-em-uso"') > 0 && landing.indexOf('id="produto-em-uso"') < landing.indexOf('id="funcionalidades"')],
  ["student flow", /kind="students"/.test(landing) && /href="\/alunos"/.test(landing)],
  ["workout flow", /kind="workouts"/.test(landing) && /href="\/treinos"/.test(landing)],
  ["execution flow", /kind="execution"/.test(landing) && /href="\/execucao"/.test(landing)],
  ["evolution flow", /kind="evolution"/.test(landing) && /href="\/evolucao"/.test(landing)],
  ["demo disclosure", /dados abaixo são demonstrativos/i.test(landing)],
  ["responsive grid", /\.fcx-proof-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css)],
  ["mobile collapse", /@media\(max-width:1000px\).*?\.fcx-proof-grid\{grid-template-columns:1fr\}/s.test(css)],
  ["light theme", /html\[data-fc-theme="light"\] \.fcx-proof/.test(css)],
];

let failed=0;
for (const [name,ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed+=1;
}
if (failed) {
  console.error(`PROOF_OF_PRODUCT_137=FAIL failed=${failed}`);
  process.exit(1);
}
console.log("PROOF_OF_PRODUCT_137=PASS");
