// FITCORE PRO — MVP-32
// Assistente operacional de IA/agents baseado em contexto real de tenant e papel.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";
import { createHermesProviderClient } from "./hermes-provider-client.mjs";

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
  const consentRegistrySupplied = Array.isArray(value?.students);
  const rawStudents = consentRegistrySupplied ? value.students : [];
  const consentedStudents = rawStudents.filter((item) => item?.consentimento_lgpd !== false);
  const consentedStudentIds = new Set(consentedStudents.map((item) => clean(item?.id || item?.student_id, "", 90)).filter(Boolean));
  const consentedUserIds = new Set(consentedStudents.map((item) => clean(item?.user_id, "", 90)).filter(Boolean));
  const hasConsentRegistry = rawStudents.some((item) => clean(item?.id || item?.student_id, "", 90));
  const studentAllowed = (item) => {
    const studentId = clean(item?.student_id || item?.id, "", 90);
    return Boolean(consentRegistrySupplied && hasConsentRegistry && studentId && consentedStudentIds.has(studentId));
  };
  const team = Array.isArray(value?.team)
    ? value.team.filter((item) => {
        const role = clean(item?.papel || item?.role, "", 40).toLowerCase();
        if (role !== "aluno") return true;
        return Boolean(consentRegistrySupplied && hasConsentRegistry && consentedUserIds.has(clean(item?.id || item?.user_id, "", 90)));
      }).map((item) => ({ nome: clean(item?.nome, "", 100), papel: clean(item?.papel, "", 40), status: clean(item?.status, "ativo", 40), last_seen_at: item?.last_seen_at || null })).slice(0, 20)
    : [];
  const students = consentedStudents.slice(0, 20).map((item) => ({ nome: clean(item?.nome, "", 100), objetivo: clean(item?.objetivo, "", 120), professor: clean(item?.professor, "", 100), nivel: clean(item?.nivel, "", 40) })).slice(0, 20);
  const prescriptions = Array.isArray(value?.prescriptions) ? value.prescriptions.filter(studentAllowed).map((item) => ({ nome: clean(item?.nome, "", 120), aluno: clean(item?.aluno, "", 100), status: clean(item?.status, "", 40) })).slice(0, 20) : [];
  const executions = Array.isArray(value?.executions) ? value.executions.filter(studentAllowed).map((item) => ({ aluno: clean(item?.aluno, "", 100), status: clean(item?.status, "", 40), esforco: item?.esforco ?? null, concluido_em: item?.concluido_em || null })).slice(0, 20) : [];
  const evolution = Array.isArray(value?.evolution) ? value.evolution.filter(studentAllowed).map((item) => ({ aluno: clean(item?.aluno, "", 100), frequencia: item?.frequencia ?? 0, progresso: item?.progresso ?? 0, esforco: item?.esforco ?? null })).slice(0, 20) : [];
  const analyticsRaw = value?.execution_analytics && typeof value.execution_analytics === "object"
    ? value.execution_analytics
    : (value?.executionAnalytics && typeof value.executionAnalytics === "object" ? value.executionAnalytics : {});
  const executionAnalytics = {
    summary: {
      runs: Number(analyticsRaw?.summary?.runs || 0),
      succeeded: Number(analyticsRaw?.summary?.succeeded || 0),
      failed: Number(analyticsRaw?.summary?.failed || 0),
      retry_wait: Number(analyticsRaw?.summary?.retry_wait || 0),
      dead_letter: Number(analyticsRaw?.summary?.dead_letter || 0),
      stale: Number(analyticsRaw?.summary?.stale || 0),
      success_rate_pct: Number(analyticsRaw?.summary?.success_rate_pct || 0),
      avg_duration_ms: Number(analyticsRaw?.summary?.avg_duration_ms || 0),
    },
    alerts: Array.isArray(analyticsRaw?.alerts)
      ? analyticsRaw.alerts.slice(0, 8).map((item) => ({
          code: clean(item?.code, "", 120),
          severity: clean(item?.severity, "", 20),
          count: Number(item?.count || 0),
        }))
      : [],
    recent: Array.isArray(analyticsRaw?.recent)
      ? analyticsRaw.recent.slice(0, 8).map((item) => ({
          trace_id: clean(item?.trace_id, "", 40),
          execution_id: clean(item?.execution_id, "", 40),
          action_id: clean(item?.action_id, "", 160),
          state: clean(item?.state, "", 40),
          error_code: clean(item?.error_code, "", 120),
        }))
      : [],
  };
  const decisionRaw = value?.decision_intelligence && typeof value.decision_intelligence === "object"
    ? value.decision_intelligence
    : (value?.decisionIntelligence && typeof value.decisionIntelligence === "object" ? value.decisionIntelligence : {});
  const decisionIntelligence = {
    summary: {
      proposed: Number(decisionRaw?.summary?.proposed || 0),
      accepted: Number(decisionRaw?.summary?.accepted || 0),
      rejected: Number(decisionRaw?.summary?.rejected || 0),
      execution_started: Number(decisionRaw?.summary?.execution_started || 0),
      settled: Number(decisionRaw?.summary?.settled || 0),
      outcomes: Number(decisionRaw?.summary?.outcomes || 0),
      acceptance_rate_pct: Number(decisionRaw?.summary?.acceptance_rate_pct || 0),
      outcome_rate_pct: Number(decisionRaw?.summary?.outcome_rate_pct || 0),
    },
    evidence: Array.isArray(decisionRaw?.evidence)
      ? decisionRaw.evidence.slice(0, 6).map((item) => ({
          rank: Number(item?.rank || 0),
          reason_code: clean(item?.reason_code, "", 120),
          action_id: clean(item?.action_id, "", 160),
          tier: clean(item?.tier, "none", 20),
          accepted_count: Number(item?.accepted_count || 0),
          settled_count: Number(item?.settled_count || 0),
          outcome_count: Number(item?.outcome_count || 0),
          positive_outcome_count: Number(item?.positive_outcome_count || 0),
        }))
      : [],
  };
  const remediationRaw = value?.execution_remediation && typeof value.execution_remediation === "object"
    ? value.execution_remediation
    : (value?.executionRemediation && typeof value.executionRemediation === "object" ? value.executionRemediation : {});
  const executionRemediation = {
    summary: {
      total: Number(remediationRaw?.summary?.total || 0),
      awaiting_retry: Number(remediationRaw?.summary?.awaiting_retry || 0),
      processing: Number(remediationRaw?.summary?.processing || 0),
      dead_letter: Number(remediationRaw?.summary?.dead_letter || 0),
      resolved: Number(remediationRaw?.summary?.resolved || 0),
      retries: Number(remediationRaw?.summary?.retries || 0),
      avg_mttr_ms: Number(remediationRaw?.summary?.avg_mttr_ms || 0),
    },
    routes: Array.isArray(remediationRaw?.routes)
      ? remediationRaw.routes.slice(0, 6).map((item) => ({
          route: clean(item?.route, "", 40),
          severity: clean(item?.severity, "", 20),
          count: Number(item?.count || 0),
        }))
      : [],
    items: Array.isArray(remediationRaw?.items)
      ? remediationRaw.items.slice(0, 8).map((item) => ({
          remediation_id: clean(item?.remediation_id, "", 80),
          action_id: clean(item?.action_id, "", 160),
          status: clean(item?.status, "", 40),
          severity: clean(item?.severity, "", 20),
          route: clean(item?.route, "", 40),
          error_code: clean(item?.error_code, "", 120),
          retry_count: Number(item?.retry_count || 0),
          max_attempts: Number(item?.max_attempts || 0),
        }))
      : [],
  };
  const facts = consentRegistrySupplied
    ? [
        `Equipe disponível para IA: ${team.length}`,
        `Alunos com consentimento LGPD para IA: ${students.length}`,
        `Prescrições disponíveis para IA: ${prescriptions.length}`,
        `Execuções disponíveis para IA: ${executions.length}`,
        `Evoluções disponíveis para IA: ${evolution.length}`,
        `Execution Kernel: ${executionAnalytics.summary.runs} runs; success=${executionAnalytics.summary.succeeded}; retry_wait=${executionAnalytics.summary.retry_wait}; dead_letter=${executionAnalytics.summary.dead_letter}`,
        `Decision Intelligence: propostas=${decisionIntelligence.summary.proposed}; aceitas=${decisionIntelligence.summary.accepted}; rejeitadas=${decisionIntelligence.summary.rejected}; settled=${decisionIntelligence.summary.settled}; outcomes=${decisionIntelligence.summary.outcomes}`,
        `Execution Remediation: fila=${executionRemediation.summary.awaiting_retry}; processing=${executionRemediation.summary.processing}; dead_letter=${executionRemediation.summary.dead_letter}; resolved=${executionRemediation.summary.resolved}; retries=${executionRemediation.summary.retries}; mttr_ms=${executionRemediation.summary.avg_mttr_ms}`,
      ]
    : (Array.isArray(value?.facts) ? value.facts.map((item) => clean(item, "", 180)).filter(Boolean).slice(0, 12) : []);
  return { source: clean(value?.source, "mvp37_consolidated_dashboard", 80), facts, team, students, prescriptions, executions, evolution, executionAnalytics, decisionIntelligence, executionRemediation };
}

function summarizeContext(pack) {
  return pack.facts.length ? `Contexto real da unidade: ${pack.facts.join("; ")}.` : "Ainda não há métricas operacionais suficientes nesta unidade para uma análise quantitativa.";
}
function compactItems(items, formatter, maxItems = 8) {
  return items.slice(0, maxItems).map(formatter).filter(Boolean).join("; ");
}
function buildGatewayPrompt(role, moduleName, prompt, pack) {
  const sections = [
    "Você é o Assistente IA do FitCore Pro. Responda em português do Brasil, de forma objetiva e profissional.",
    "REGRA EVIDENCE-FIRST: use somente os dados abaixo; não invente alunos, medidas, treinos, diagnósticos, presença online ou resultados. Se faltar evidência, diga explicitamente.",
    "Não faça diagnóstico médico nem altere treino automaticamente. Para carga, volume, dor, lesão ou risco, recomende revisão profissional humana.",
    `Papel autenticado: ${role}. Módulo: ${moduleName}.`,
    `Pergunta: ${prompt}`,
    pack.facts.length ? `Fatos da unidade: ${pack.facts.join("; ")}` : "Fatos da unidade: insuficientes.",
  ];
  const team = compactItems(pack.team, (item) => `${item.nome || "membro"} [papel=${item.papel || "não informado"}; status=${item.status || "não informado"}]`);
  const students = compactItems(pack.students, (item) => `${item.nome || "aluno"} [objetivo=${item.objetivo || "não informado"}; nível=${item.nivel || "não informado"}]`);
  const prescriptions = compactItems(pack.prescriptions, (item) => `${item.nome || "treino"} [aluno=${item.aluno || "não informado"}; status=${item.status || "não informado"}]`);
  const executions = compactItems(pack.executions, (item) => `${item.aluno || "aluno"} [status=${item.status || "não informado"}; esforço=${item.esforco ?? "não informado"}]`);
  const evolution = compactItems(pack.evolution, (item) => `${item.aluno || "aluno"} [frequência=${item.frequencia ?? 0}; progresso=${item.progresso ?? 0}; esforço=${item.esforco ?? "não informado"}]`);
  if (team) sections.push(`Equipe: ${team}`);
  if (students) sections.push(`Alunos: ${students}`);
  if (prescriptions) sections.push(`Prescrições: ${prescriptions}`);
  if (executions) sections.push(`Execuções: ${executions}`);
  if (evolution) sections.push(`Evolução: ${evolution}`);
  const exec = pack.executionAnalytics || { summary: {}, alerts: [], recent: [] };
  if (Number(exec.summary?.runs || 0) > 0 || exec.alerts?.length) {
    sections.push(`Execution Analytics: runs=${exec.summary.runs || 0}; succeeded=${exec.summary.succeeded || 0}; failed=${exec.summary.failed || 0}; retry_wait=${exec.summary.retry_wait || 0}; dead_letter=${exec.summary.dead_letter || 0}; stale=${exec.summary.stale || 0}; success_rate_pct=${exec.summary.success_rate_pct || 0}.`);
    const alertText = compactItems(exec.alerts || [], (item) => `${item.code}[severity=${item.severity};count=${item.count}]`, 6);
    if (alertText) sections.push(`Alertas de execução: ${alertText}`);
    const traceText = compactItems(exec.recent || [], (item) => `${item.trace_id}/${item.execution_id} [action=${item.action_id};state=${item.state};error=${item.error_code || "none"}]`, 5);
    if (traceText) sections.push(`Correlação sanitizada: ${traceText}`);
  }
  const decision = pack.decisionIntelligence || { summary: {}, evidence: [] };
  if (Number(decision.summary?.proposed || 0) > 0 || decision.evidence?.length) {
    sections.push(`Decision Intelligence: proposed=${decision.summary.proposed || 0}; accepted=${decision.summary.accepted || 0}; rejected=${decision.summary.rejected || 0}; execution_started=${decision.summary.execution_started || 0}; settled=${decision.summary.settled || 0}; outcomes=${decision.summary.outcomes || 0}; acceptance_rate_pct=${decision.summary.acceptance_rate_pct || 0}; outcome_rate_pct=${decision.summary.outcome_rate_pct || 0}.`);
    const decisionEvidence = compactItems(decision.evidence || [], (item) => `#${item.rank || 0} ${item.reason_code}[action=${item.action_id || "none"};tier=${item.tier || "none"};accepted=${item.accepted_count || 0};settled=${item.settled_count || 0};outcomes=${item.outcome_count || 0};positive=${item.positive_outcome_count || 0}]`, 6);
    if (decisionEvidence) sections.push(`Evidência de decisão sanitizada: ${decisionEvidence}`);
  }
  const remediation = pack.executionRemediation || { summary: {}, routes: [], items: [] };
  if (Number(remediation.summary?.total || 0) > 0 || remediation.routes?.length) {
    sections.push(`Execution Remediation: awaiting_retry=${remediation.summary.awaiting_retry || 0}; processing=${remediation.summary.processing || 0}; dead_letter=${remediation.summary.dead_letter || 0}; resolved=${remediation.summary.resolved || 0}; retries=${remediation.summary.retries || 0}; avg_mttr_ms=${remediation.summary.avg_mttr_ms || 0}.`);
    const routing = compactItems(remediation.routes || [], (item) => `${item.route}[severity=${item.severity};count=${item.count}]`, 6);
    if (routing) sections.push(`Roteamento de remediation: ${routing}`);
    const remediationItems = compactItems(remediation.items || [], (item) => `${item.remediation_id}[action=${item.action_id};status=${item.status};severity=${item.severity};route=${item.route};retry=${item.retry_count}/${item.max_attempts};error=${item.error_code || "none"}]`, 6);
    if (remediationItems) sections.push(`Fila de remediation sanitizada: ${remediationItems}`);
  }
  sections.push("Decision Intelligence é apenas contexto explicativo para Hermes. Hermes não aceita/rejeita propostas, não executa ações e não grava outcomes.");
  sections.push("Execution Remediation é apenas contexto explicativo para Hermes. Hermes não marca ready/dismiss, não dispara retry e não recebe payload/binding.");
  sections.push("Nunca trate proposta NBA ou remediation como autorização. Qualquer side effect deve voltar ao Execution Kernel server-side.");
  sections.push("Entregue apenas a orientação final.");
  return clean(sections.join("\n"), "", 3_900);
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
export function createAgentAssistantManager(env = process.env, deps = {}) {
  const enabled = boolEnv(env.FITCORE_AGENT_ASSISTANT_ENABLED, true);
  const hermesProvider = createHermesProviderClient(env, deps);
  function status(context = {}) {
    return { ok: true, mvp: "MVP-32 Agent Assistant", enabled, tenant_slug: context?.tenant_slug || null, actor_role: context?.actor_role || null, tenant_scoped: true, audit: "fitcore_agent_events", provider_gateway: hermesProvider.status() };
  }
  async function ask(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "agent_assistant_disabled" } } };
    const guard = signed(context);
    if (!guard.allowed) return { guard };
    const role = normalizeRole(context.actor_role || "visitante");
    const moduleName = clean(input.module || input.area || "dashboard", "dashboard", 80);
    const prompt = clean(input.prompt || input.message || "O que devo fazer agora?", "O que devo fazer agora?", 900);
    const actions = roleActions(role, moduleName);
    const operationalContext = contextPack(input.operational_context || {});
    const fallbackReply = buildReply(role, moduleName, prompt, operationalContext);
    const externalProviderAllowed = input.external_provider_allowed !== false;
    const providerResult = externalProviderAllowed
      ? await hermesProvider.generate({ tenantKey: context.tenant_id, prompt: buildGatewayPrompt(role, moduleName, prompt, operationalContext) })
      : { ok: false, error: "lgpd_external_processing_denied", latency_ms: 0 };
    const reply = providerResult.ok ? providerResult.output : fallbackReply;
    const providerAudit = providerResult.ok
      ? { engine: "hermes", contract: providerResult.contract, provider: providerResult.provider, model: providerResult.model, latency_ms: providerResult.latency_ms, gateway_route: providerResult.gateway_route || "primary", fallback: false }
      : { engine: "local-evidence-fallback", contract: "hermes-provider-gateway-v1", provider: null, model: null, latency_ms: providerResult.latency_ms ?? null, gateway_route: null, fallback: true, error: providerResult.error };
    try {
      runSql(env, `
        SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);
        WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true)), event AS (
          INSERT INTO fitcore_agent_events (tenant_id, actor_id, actor_role, module, prompt, response, actions, status)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL"}, ${sqlText(role)}, ${sqlText(moduleName)}, ${sqlText(prompt)}, ${sqlText(reply)}, ${sqlJson(actions)}, 'ok'
          FROM scope RETURNING id
        ), audit AS (
          INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL"}, ${sqlText(role)}, 'agent_assistant', (SELECT id FROM event), 'agent_prompt_answered', 'ok', ${sqlText(`module=${moduleName};engine=${providerAudit.engine};provider=${providerAudit.provider || "none"};model=${providerAudit.model || "none"};route=${providerAudit.gateway_route || "none"};fallback=${providerAudit.fallback};error=${clean(providerAudit.error || "none", "none", 80)};latency_ms=${Number.isFinite(providerAudit.latency_ms) ? Math.max(0, Math.round(providerAudit.latency_ms)) : "na"}`)}
          FROM scope
        ) SELECT id::text FROM event;
      `);
    } catch {}
    return { ok: true, mvp: "MVP-32 Agent Assistant", role, module: moduleName, reply, actions, provider: providerAudit, context: { source: operationalContext.source, facts: operationalContext.facts, team_count: operationalContext.team.length, student_count: operationalContext.students.length, prescription_count: operationalContext.prescriptions.length, execution_count: operationalContext.executions.length, execution_analytics: operationalContext.executionAnalytics, decision_intelligence: operationalContext.decisionIntelligence, execution_remediation: operationalContext.executionRemediation }, safety: { tenant_scoped: true, evidence_only: true, insufficient_data_is_explicit: true, human_review: true, medical_autonomy: false, capability_exposed: false, direct_database_access: false, decision_mutation: false, remediation_mutation: false, lgpd: "dados mínimos e auditoria por unidade" } };
  }
  return { enabled, status, ask };
}
