import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = resolve(process.cwd());
const files = [
  "apps/site-static/index.html",
  "apps/site-static/mvp-19.html",
  "apps/site-static/mvp-21.html",
  "apps/site-static/mvp-22.html",
];

let failed = false;
for (const file of files) {
  const path = resolve(root, file);
  if (!existsSync(path)) {
    console.error(`ERRO: arquivo ausente: ${file}`);
    failed = true;
    continue;
  }
  const html = readFileSync(path, "utf8");
  const refs = [...html.matchAll(/<(?:link|script)[^>]+(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((ref) => ref.startsWith("/") && !ref.startsWith("//"));
  for (const ref of refs) {
    const cleanRef = ref.split("?")[0];
    if (cleanRef.startsWith("/api/") || cleanRef.startsWith("/legal/")) continue;
    const target = resolve(root, "apps/site-static", cleanRef.replace(/^\//, ""));
    if (!existsSync(target)) {
      console.error(`ERRO: ${file} referencia asset ausente: ${ref}`);
      failed = true;
    }
  }
  if (file.endsWith("mvp-22.html") && (!html.includes('/mvp-22.css') || !html.includes('/mvp-22.js'))) {
    console.error("ERRO: mvp-22.html não conecta CSS/JS do MVP-22.");
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: contrato de front estático CSS/JS validado.");
