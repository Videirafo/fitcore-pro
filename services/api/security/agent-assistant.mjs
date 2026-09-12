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
function contextPack(value = {}) {
  const facts = Array.isArray(value?.facts) ? value.facts.map((item) => clean(item, "", 180)).filter(Boolean).slice(0, 12) : [];
  const team = Array.isArray(value?.team) ? value.team.map((item) => ({ nome: clean(item?.nome, "", 100), papel: clean(item?.papel, "", 40), status: clean(item?.status, "ativo", 40), last_seen_at: item?.last_seen_at || null })).slice(0, 20) : [];
  const students = Array.isArray(value?.students) ? value.students.map((item) => ({ nome: clean(item?.nome, "", 100), objetivo: clean(item?.objetivo, "", 120), professor: clean(item?.professor, "", 100), nivel: clean(item?.nivel, "", 40) })).slice(0, 20) : [];
  const prescriptions = Array.isArray(value?.prescriptions) ? value.prescriptions.map((item) => ({ nome: clean(item?.nome, "", 120), aluno: clean(item?.aluno, "", 100), status: clean(item?.status, "", 40) })).slice(0, 20) : [];
  const executions = Array.isArray(value?.executions) ? value.executions.map((item) => ({ aluno: clean(item?.aluno, "", 100), status: clean(item?.status, "", 40), esforco: item?.esforco ?? null, concluido_em: item?.concluido_em || null })).slice(0, 20) : [];
  const evolution = Array.isArray(value?.evolution) ? value.evolution.map((item) => ({ aluno: clean(item?.aluno, "", 100), frequencia: item?.frequencia ?? 0, progresso: item?.progresso ?? 0, esforco: item?.esforco ?? null })).slice(0, 20) : [];
  return { source: clean(value?.source, "mvp37_consolidated_dashboard", 80), facts, team, students, prescriptions, executions, evolution };
}
function summarizeContext(pack) {
  return pack.facts.length ? `Contexto real da unidade: ${pack.facts.join("; ")}.` : "Ainda não há métricas operacionais suficientes nesta unidade para uma análise quantitativa.";
}
function buildReply(role, module, prompt, operationalContext = {}) {
  const base = prompt.toLowerCase();
  const pack = contextPack(operationalContext);
  const summary = summarizeContext(pack);
  const asksUsers = /quem|equipe|usu[aá]rio|pessoa|membro/.test(base);
  if (asksUsers && role === "gestor") {
    if (!pack.team.length) return `Não há membros de equipe disponíveis no contexto atual. ${summary}`;
    const members = pack.team.map((item) => `${item.nome || "Sem nome"} (${item.papel || "sem papel"}${item.status ? `, ${item.status}` : ""})`).join("; ");
    return `Membros disponíveis no cadastro desta unidade: ${members}. last_seen_at, quando existir, é apenas último registro de atividade e não significa presença online em tempo real. ${summary}`;
  }
  if (base.includes("agach") || base.includes("exerc") || module === "execucao") {
    const guidance = role === "aluno"
      ? "Abra o treino liberado, confira a demonstração disponível, execute com amplitude segura e registre esforço/duração ao concluir."
      : "Revise o treino e a execução registrada antes de alterar séries, repetições, carga ou descanso.";
    return `${guidance} ${summary}`;
  }
  if (base.includes("evol") || module === "evolucao") {
    if (!pack.evolution.length && !pack.executions.length) return `Ainda não há execuções/evolução suficientes para analisar tendência. ${summary}`;
    return `Use frequência, execuções concluídas e esforço registrado para decidir a próxima ação; não aumente carga automaticamente sem revisão profissional. ${summary}`;
  }
  if (base.includes("treino") || module === "treinos" || module === "training") {
    const guidance = role === "professor" || role === "gestor"
      ? "Use somente alunos e prescrições presentes no tenant, revise objetivo, frequência e execução recente antes de liberar mudanças."
      : "Consulte apenas os treinos liberados para sua conta e registre a execução para gerar histórico real.";
    return `${guidance} ${summary}`;
  }
  if (base.includes("lgpd") || base.includes("seguran")) return `Mantenha dados mínimos, acesso por papel, sessão assinada e auditoria por unidade. ${summary}`;
  if (role === "gestor") return `Priorize os próximos passos a partir dos dados atuais da unidade, sem preencher lacunas com estimativas. ${summary}`;
  if (role === "professor") return `Revise alunos, prescrições e execuções disponíveis antes de orientar progressão. ${summary}`;
  return `Use apenas seu treino, suas execuções e sua evolução visíveis nesta sessão. ${summary}`;
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
    const operationalContext = contextPack(input.operational_context || {});
    const reply = buildReply(role, moduleName, prompt, operationalContext);
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
    return { ok: true, mvp: "MVP-32 Agent Assistant", role, module: moduleName, reply, actions, context: { source: operationalContext.source, facts: operationalContext.facts, team_count: operationalContext.team.length, student_count: operationalContext.students.length, prescription_count: operationalContext.prescriptions.length, execution_count: operationalContext.executions.length }, safety: { tenant_scoped: true, evidence_only: true, insufficient_data_is_explicit: true, lgpd: "dados mínimos e auditoria por unidade" } };
  }
  return { enabled, status, ask };
}
