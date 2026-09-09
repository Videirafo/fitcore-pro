// FITCORE PRO — MVP-32
// Assistente operacional de IA/agents baseado em contexto real de tenant e papel.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 900) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}
function sqlText(value) { return `'${String(value ?? "").replace(/'/g, "''")}'`; }
function sqlJson(value) { return `${sqlText(JSON.stringify(value ?? []))}::jsonb`; }
function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-32.");
  const parsed = new URL(dbUrl);
  return {
    args: ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", decodeURIComponent(parsed.pathname.replace(/^\//, ""))],
    env: { PGPASSWORD: decodeURIComponent(parsed.password || ""), PGCONNECT_TIMEOUT: "5", PGSSLMODE: parsed.searchParams.get("sslmode") || "disable" },
  };
}
function runSql(env, sql) {
  const connection = dbConnection(env);
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, ...connection.env },
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
}
function signed(context = {}) {
  if (!context?.session_signed || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Entre para usar o assistente do FitCore." } };
  }
  return { allowed: true };
}
function roleActions(role, module) {
  if (role === "gestor") return ["Revisar pendências da unidade", "Criar ou ajustar equipe", "Acompanhar evolução e risco de abandono", "Ver segurança e auditoria"];
  if (role === "professor") return ["Montar treino com base no aluno", "Revisar execução recente", "Ajustar carga e volume", "Enviar orientação clara ao aluno"];
  if (role === "aluno") return ["Ver treino do dia", "Entender como executar cada exercício", "Registrar esforço e duração", "Acompanhar evolução pessoal"];
  return ["Entrar na unidade", "Criar negócio", "Conhecer módulos principais"];
}
function buildReply(role, module, prompt) {
  const base = prompt.toLowerCase();
  if (base.includes("agach") || base.includes("exerc") || module === "execucao") {
    return role === "aluno"
      ? "Abra o treino do dia, veja o GIF de cada exercício, execute com amplitude segura, marque como feito e registre esforço e duração ao concluir."
      : "Use a biblioteca com GIFs para conferir a técnica, ajuste séries/repetições pelo nível do aluno e acompanhe se a execução foi concluída com esforço adequado.";
  }
  if (base.includes("evol") || module === "evolucao") {
    return "Analise frequência semanal, esforço médio e histórico. Se a frequência cair ou o esforço subir demais, ajuste volume e envie orientação ao aluno.";
  }
  if (base.includes("treino") || module === "treinos") {
    return role === "professor" || role === "gestor"
      ? "Selecione o aluno, escolha objetivo e frequência, monte exercícios com GIFs de apoio, aprove a prescrição e libere a execução."
      : "Consulte apenas treinos liberados para você e use o painel de execução para registrar o progresso.";
  }
  if (base.includes("lgpd") || base.includes("seguran")) {
    return "Mantenha dados mínimos, acesso por papel, sessão assinada, registro de auditoria por unidade e revogação de credenciais quando necessário.";
  }
  return "O FitCore deve operar em fluxo: negócio, equipe, alunos, prescrição, execução, evolução e segurança. A próxima ação recomendada aparece conforme seu papel e dados da unidade.";
}
export function createAgentAssistantManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_AGENT_ASSISTANT_ENABLED, true);
  function status(context = {}) {
    return { ok: true, mvp: "MVP-32 Agent Assistant", enabled, tenant_slug: context?.tenant_slug || null, actor_role: context?.actor_role || null, tenant_scoped: true, audit: "fitcore_agent_events" };
  }
  function ask(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "agent_assistant_disabled" } } };
    const guard = signed(context);
    if (!guard.allowed) return { guard };
    const role = normalizeRole(context.actor_role || "visitante");
    const moduleName = clean(input.module || input.area || "dashboard", "dashboard", 80);
    const prompt = clean(input.prompt || input.message || "O que devo fazer agora?", "O que devo fazer agora?", 900);
    const actions = roleActions(role, moduleName);
    const reply = buildReply(role, moduleName, prompt);
    try {
      runSql(env, `
        SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);
        WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true)), event AS (
          INSERT INTO fitcore_agent_events (tenant_id, actor_id, actor_role, module, prompt, response, actions, status)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL"}, ${sqlText(role)}, ${sqlText(moduleName)}, ${sqlText(prompt)}, ${sqlText(reply)}, ${sqlJson(actions)}, 'ok'
          FROM scope RETURNING id
        ), audit AS (
          INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL"}, ${sqlText(role)}, 'agent_assistant', (SELECT id FROM event), 'agent_prompt_answered', 'ok', ${sqlText(`module=${moduleName}`)}
          FROM scope
        ) SELECT id::text FROM event;
      `);
    } catch {}
    return { ok: true, mvp: "MVP-32 Agent Assistant", role, module: moduleName, reply, actions, safety: { tenant_scoped: true, lgpd: "dados mínimos e auditoria por unidade" } };
  }
  return { enabled, status, ask };
}
