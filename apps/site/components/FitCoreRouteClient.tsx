"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Json = Record<string, any>;
type Mode = "home" | "login" | "onboarding" | "setup" | "invite" | "team" | "students" | "training" | "execution" | "evolution";
type LoadState = "idle" | "loading" | "success" | "error";

type RouteCopy = { eyebrow: string; title: string; text: string };

const routeCopy: Record<Mode, RouteCopy> = {
  home: { eyebrow: "Operação conectada", title: "Painel único para vender, operar e acompanhar treinos.", text: "Crie a unidade, configure a equipe, cadastre alunos, prescreva treinos e acompanhe a evolução em um fluxo único." },
  login: { eyebrow: "Acesso", title: "Entrar no FitCore Pro.", text: "Use o slug da unidade, identificador e senha ou código de acesso." },
  onboarding: { eyebrow: "Novo negócio", title: "Criar academia, estúdio, box ou personal.", text: "O cadastro cria a unidade, gestor proprietário e leva direto para o setup guiado." },
  setup: { eyebrow: "Setup guiado", title: "Complete a primeira operação da unidade.", text: "Siga as etapas reais: equipe, aluno, treino, execução e evolução. O progresso fica salvo por unidade." },
  invite: { eyebrow: "Convite", title: "Aceitar convite da unidade.", text: "Confira o convite, defina seu identificador e crie senha ou código de acesso." },
  team: { eyebrow: "Equipe", title: "Usuários e papéis da unidade.", text: "Crie professores e alunos sem copiar IDs; o sistema vincula cada pessoa ao negócio atual." },
  students: { eyebrow: "Alunos", title: "Cadastro de aluno em fluxo guiado.", text: "Escolha professor responsável por lista, registre objetivo e avance para prescrição." },
  training: { eyebrow: "Treinos", title: "Prescrição com seleção real de aluno.", text: "Escolha o aluno no dropdown, monte o treino e libere para execução após revisão." },
  execution: { eyebrow: "Execução", title: "Treino do dia sem copiar códigos.", text: "O aluno inicia o treino liberado e conclui a execução selecionando a sessão aberta." },
  evolution: { eyebrow: "Evolução", title: "Histórico e progresso no aluno correto.", text: "A evolução abre com métricas, gráfico e histórico filtrados pela sessão e pelo papel." },
};

async function api(path: string, options: RequestInit = {}): Promise<Json> {
  const res = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.mensagem || data.erro || data.reason || `HTTP ${res.status}`);
  return data;
}

function safe(value: any): string {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function numberText(value: any): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0";
}

function formPayload(form: HTMLFormElement): Json {
  const out: Json = {};
  new FormData(form).forEach((raw, key) => {
    const value = typeof raw === "string" ? raw.trim() : String(raw);
    if (!value) return;
    out[key] = /^\d+$/.test(value) ? Number(value) : value;
  });
  return out;
}

function statusText(error: string, fallback = "Nenhum registro carregado") {
  return error ? `Erro: ${error}` : fallback;
}

function roleOf(session: Json | null): string {
  return String(session?.actor_role || "visitante").toLowerCase();
}

function isStaffRole(role: string): boolean {
  return role === "gestor" || role === "professor";
}

function firstOf<T = Json>(items: T[] = []): T | undefined {
  return items.length ? items[0] : undefined;
}

export function FitCoreRouteClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const copy = routeCopy[mode];
  const [session, setSession] = useState<Json | null>(null);
  const [navigation, setNavigation] = useState<Json | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Json | null>(null);
  const [team, setTeam] = useState<Json>({ users: [], invites: [] });
  const [students, setStudents] = useState<Json>({ students: [] });
  const [prescriptions, setPrescriptions] = useState<Json>({ prescriptions: [] });
  const [executions, setExecutions] = useState<Json>({ executions: [] });
  const [evolution, setEvolution] = useState<Json>({ students: [], weekly: [], summary: {} });
  const [setup, setSetup] = useState<Json>({ steps: [], progress_percent: 0 });
  const [detail, setDetail] = useState<Json | null>(null);
  const [studentQuery, setStudentQuery] = useState("");

  const role = roleOf(session);
  const isStaff = isStaffRole(role);
  const prescriptionItems = prescriptions?.prescriptions || prescriptions?.workouts || [];
  const executionItems = executions?.executions || [];
  const firstStudentId = useMemo(() => studentQuery || students?.students?.[0]?.id || "", [studentQuery, students]);
  const firstPrescriptionId = useMemo(() => prescriptionItems?.[0]?.id || "", [prescriptionItems]);
  const firstExecutionId = useMemo(() => executionItems?.find((item: Json) => item.status === "em_execucao")?.id || executionItems?.[0]?.id || "", [executionItems]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStudentQuery(params.get("student") || "");
  }, [mode]);

  const loadSession = useCallback(async () => {
    try {
      const result = await api(`/api/mvp-15/session?v=${Date.now()}`);
      const current = result.current_session || null;
      setSession(current);
      if (current) {
        try { setNavigation(await api(`/api/mvp-17/navigation?v=${Date.now()}`)); } catch { setNavigation(null); }
      } else {
        setNavigation(null);
      }
      return current;
    } catch {
      setSession(null);
      setNavigation(null);
      return null;
    }
  }, []);

  const loadRouteData = useCallback(async (target: Mode = mode) => {
    setState("loading");
    setError("");
    try {
      const current = await loadSession();
      const currentRole = roleOf(current);
      const currentIsStaff = isStaffRole(currentRole);
      const needsSetup = ["setup", "home", "team", "students", "training", "execution", "evolution"].includes(target);
      const needsTeam = target === "team" || target === "students" || target === "setup" || target === "home";
      const needsStudents = ["students", "training", "home"].includes(target);
      const needsTraining = ["training", "execution", "home"].includes(target);
      const needsExecution = ["execution", "home"].includes(target);
      const needsEvolution = ["evolution", "home"].includes(target);

      if (currentRole === "gestor" && needsSetup) {
        try { setSetup(await api(`/api/mvp-31/setup?v=${Date.now()}`)); } catch { setSetup({ steps: [], progress_percent: 0 }); }
      }
      if (currentRole === "gestor" && needsTeam) {
        try { setTeam(await api(`/api/mvp-22/users?v=${Date.now()}`)); } catch { setTeam({ users: [], invites: [] }); }
      }
      if (currentIsStaff && needsStudents) {
        setStudents(await api(`/api/mvp-23/students?limit=100&v=${Date.now()}`));
      }
      if (needsTraining) {
        if (currentIsStaff) setPrescriptions(await api(`/api/mvp-24/prescriptions?limit=100&v=${Date.now()}`));
        if (currentRole === "aluno") setPrescriptions(await api(`/api/mvp-24/my-workouts?status=aprovado&limit=60&v=${Date.now()}`));
      }
      if (needsExecution) {
        if (currentRole === "aluno") setExecutions(await api(`/api/mvp-25/my-executions?limit=80&v=${Date.now()}`));
        if (currentIsStaff) setExecutions(await api(`/api/mvp-25/executions?limit=100&v=${Date.now()}`));
      }
      if (needsEvolution) {
        if (currentIsStaff) setEvolution(await api(`/api/mvp-26/evolution?limit=100&v=${Date.now()}`));
        if (currentRole === "aluno") setEvolution(await api(`/api/mvp-26/my-evolution?limit=100&v=${Date.now()}`));
      }
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
      setState("error");
    }
  }, [loadSession, mode]);

  useEffect(() => { loadRouteData(mode); }, [loadRouteData, mode]);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".panel, .session-card, .module-card, .metric, .flow-card"));
    const update = (event: PointerEvent) => {
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
        card.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
      });
    };
    window.addEventListener("pointermove", update, { passive: true });
    return () => window.removeEventListener("pointermove", update);
  }, [mode]);

  async function runAction(label: string, action: () => Promise<Json>, refreshTarget: Mode = mode): Promise<Json | null> {
    setToast({ type: "loading", title: label, message: "Processando..." });
    try {
      const result = await action();
      setToast({ type: "success", title: label, message: "Concluído com sucesso.", result });
      setDetail(result);
      await loadRouteData(refreshTarget);
      return result;
    } catch (err) {
      setToast({ type: "error", title: label, message: err instanceof Error ? err.message : "Ação não concluída." });
      return null;
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runAction("Login", () => api("/api/mvp-19/login", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "home");
    if (result?.session || result?.ok) router.push("/");
  }

  async function logout() {
    const result = await runAction("Logout", () => api("/api/mvp-15/session/logout", { method: "POST", body: "{}" }), "login");
    if (result) {
      setSession(null);
      router.push("/login");
    }
  }

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runAction("Criar negócio", () => api("/api/mvp-21/onboarding", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "setup");
    if (result?.ok) router.push("/setup");
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Criar usuário", () => api("/api/mvp-22/users", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "team");
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Gerar convite", () => api("/api/mvp-22/users/invite", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "team");
  }

  async function submitInviteAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runAction("Aceitar convite", () => api("/api/mvp-22/invites/accept", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "home");
    if (result?.ok) router.push("/");
  }

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runAction("Cadastrar aluno", () => api("/api/mvp-23/students", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "students");
    const studentId = result?.student?.id || result?.created?.id;
    if (studentId) router.push(`/treinos?student=${encodeURIComponent(studentId)}`);
  }

  async function submitPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = formPayload(event.currentTarget);
    payload.exercicios = String(payload.exercicios || "").split("\n").map((item) => item.trim()).filter(Boolean);
    const result = await runAction("Criar prescrição", () => api("/api/mvp-24/prescriptions", { method: "POST", body: JSON.stringify(payload) }), "training");
    if (result?.prescription?.id) setDetail(result);
  }

  async function reviewPrescription(id: string, status: "aprovado" | "ajustes_solicitados") {
    await runAction(status === "aprovado" ? "Aprovar treino" : "Solicitar ajustes", () => api(`/api/mvp-24/prescriptions/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ status, observacoes: status === "aprovado" ? "Treino aprovado no painel." : "Ajustes solicitados no painel." }) }), "training");
  }

  async function startExecution(workoutId: string) {
    await runAction("Iniciar treino", () => api("/api/mvp-25/executions/start", { method: "POST", body: JSON.stringify({ workout_id: workoutId }) }), "execution");
  }

  async function markExerciseDone(executionId: string, index: number) {
    await runAction("Marcar exercício", () => api(`/api/mvp-25/executions/${encodeURIComponent(executionId)}/exercises/${index}/done`, { method: "POST", body: JSON.stringify({ observacao: "Marcado no painel." }) }), "execution");
  }

  async function finishExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = formPayload(event.currentTarget);
    const id = String(payload.execution_id || "");
    delete payload.execution_id;
    await runAction("Concluir treino", () => api(`/api/mvp-25/executions/${encodeURIComponent(id)}/finish`, { method: "POST", body: JSON.stringify(payload) }), "execution");
  }

  async function loadStudentEvolution(studentId: string) {
    await runAction("Carregar evolução", () => api(`/api/mvp-26/students/${encodeURIComponent(studentId)}/evolution?limit=100`), "evolution");
  }

  return (
    <section className="route-page" data-mode={mode}>
      <div className="route-hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </div>
        <SessionPanel session={session} state={state} error={error} onRefresh={() => loadRouteData(mode)} />
      </div>

      <RoleDashboard session={session} navigation={navigation} team={team} students={students} prescriptions={prescriptions} executions={executions} evolution={evolution} setup={setup} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {mode === "home" && <HomePanel session={session} role={role} students={students} prescriptions={prescriptions} executions={executions} evolution={evolution} />}
      {mode === "login" && <LoginPanel onSubmit={submitLogin} onLogout={logout} state={state} />}
      {mode === "onboarding" && <OnboardingPanel onSubmit={submitOnboarding} state={state} />}
      {mode === "setup" && <SetupPanel setup={setup} session={session} state={state} error={error} onRefresh={() => loadRouteData("setup")} />}
      {mode === "invite" && <InvitePanel onSubmit={submitInviteAccept} state={state} />}
      {mode === "team" && <TeamPanel role={role} data={team} detail={detail} state={state} error={error} onCreate={submitUser} onInvite={submitInvite} onRefresh={() => loadRouteData("team")} />}
      {mode === "students" && <StudentsPanel role={role} team={team} data={students} detail={detail} state={state} error={error} onSubmit={submitStudent} onRefresh={() => loadRouteData("students")} />}
      {mode === "training" && <TrainingPanel role={role} students={students?.students || []} data={prescriptions} detail={detail} state={state} error={error} selectedStudentId={firstStudentId} onSubmit={submitPrescription} onReview={reviewPrescription} onRefresh={() => loadRouteData("training")} />}
      {mode === "execution" && <ExecutionPanel role={role} workouts={prescriptions} executions={executions} detail={detail} state={state} error={error} firstPrescriptionId={firstPrescriptionId} firstExecutionId={firstExecutionId} onStart={startExecution} onMarkDone={markExerciseDone} onFinish={finishExecution} onRefresh={() => loadRouteData("execution")} />}
      {mode === "evolution" && <EvolutionPanel data={evolution} detail={detail} state={state} error={error} isStaff={isStaff} onStudent={loadStudentEvolution} onRefresh={() => loadRouteData("evolution")} />}
    </section>
  );
}

function SessionPanel({ session, state, error, onRefresh }: { session: Json | null; state: LoadState; error: string; onRefresh: () => void }) {
  const logged = Boolean(session);
  return <aside className={`session-card ${logged ? "is-online" : "is-offline"}`}><small>{state === "loading" ? "Carregando" : logged ? "Sessão ativa" : "Entrada"}</small><strong>{logged ? safe(session?.actor_name) : "Acesso necessário"}</strong><span>{logged ? `${safe(session?.actor_role)} · ${safe(session?.tenant_slug)}` : statusText(error, "Entre ou crie uma unidade.")}</span><button type="button" className="secondary mini" onClick={onRefresh}>Atualizar</button></aside>;
}

function Toast({ toast, onClose }: { toast: Json | null; onClose: () => void }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.type || "info"}`}><div><strong>{safe(toast.title)}</strong><span>{safe(toast.message)}</span></div><button type="button" className="secondary mini" onClick={onClose}>Fechar</button></div>;
}

function RoleDashboard({ session, navigation, team, students, prescriptions, executions, evolution, setup }: { session: Json | null; navigation: Json | null; team: Json; students: Json; prescriptions: Json; executions: Json; evolution: Json; setup: Json }) {
  const role = roleOf(session);
  const kpis = role === "gestor" ? [
    ["Setup", `${setup?.progress_percent || 0}%`], ["Alunos", students?.total || students?.students?.length || 0], ["Treinos", prescriptions?.total || 0], ["Execuções", executions?.total || 0],
  ] : role === "professor" ? [
    ["Alunos", students?.total || students?.students?.length || 0], ["Treinos", prescriptions?.total || 0], ["Pendentes", prescriptions?.em_revisao || 0], ["Evolução", evolution?.students?.length || 0],
  ] : role === "aluno" ? [
    ["Treinos", prescriptions?.total || prescriptions?.prescriptions?.length || 0], ["Execuções", executions?.total || 0], ["Concluídos", executions?.concluidos || 0], ["Frequência", evolution?.student?.weekly_frequency || 0],
  ] : [["Comece", 1], ["Login", 1], ["Unidade", 0], ["Fluxo", 6]];
  const hrefs = role === "gestor" ? [["/setup", "Setup"], ["/evolucao", "Dashboard"], ["/equipe", "Equipe"], ["/alunos", "Alunos"], ["/treinos", "Treinos"]] : role === "professor" ? [["/alunos", "Alunos"], ["/treinos", "Treinos"], ["/execucao", "Execuções"], ["/evolucao", "Progresso"]] : role === "aluno" ? [["/execucao", "Treino do dia"], ["/evolucao", "Minha evolução"], ["/treinos", "Treinos"]] : [["/onboarding", "Criar negócio"], ["/login", "Login"]];
  const title = role === "gestor" ? "Dashboard executivo" : role === "professor" ? "Painel do professor" : role === "aluno" ? "Painel do aluno" : "Visitante";
  const note = role === "visitante" ? "Crie uma unidade ou entre para carregar o painel." : `${navigation?.menu?.length || hrefs.length} áreas disponíveis para esta sessão.`;
  return <section className={`role-dashboard role-dashboard-${role}`}><div className="role-copy"><span>Painel por papel</span><strong>{title}</strong><p>{note}</p></div><div className="role-metrics">{kpis.map(([label, value]) => <Metric label={String(label)} value={value} key={String(label)} />)}</div><div className="role-actions">{hrefs.map(([href, label]) => <Link key={href} className="primary-pill" href={href}>{label}</Link>)}</div></section>;
}

function HomePanel({ session, role, students, prescriptions, executions, evolution }: { session: Json | null; role: string; students: Json; prescriptions: Json; executions: Json; evolution: Json }) {
  const modules = role === "gestor" ? [
    ["/equipe", "Equipe", `${students?.total || 0} alunos na unidade`], ["/alunos", "Alunos", "Cadastro operacional e vínculo com professor"], ["/treinos", "Treinos", `${prescriptions?.total || 0} prescrições acompanhadas`], ["/evolucao", "Evolução", "Dashboard executivo por aluno"],
  ] : role === "professor" ? [
    ["/alunos", "Meus alunos", "Acompanhe alunos vinculados"], ["/treinos", "Treinos pendentes", "Prescrição e revisão"], ["/execucao", "Execuções", `${executions?.total || 0} execuções visíveis`], ["/evolucao", "Progresso", "Histórico e evolução dos alunos"],
  ] : role === "aluno" ? [
    ["/execucao", "Treino do dia", "Inicie e conclua o treino liberado"], ["/evolucao", "Minha evolução", `${evolution?.student?.total_executions || 0} execuções no histórico`], ["/treinos", "Meus treinos", "Treinos aprovados"],
  ] : [
    ["/onboarding", "Criar negócio", "Abra uma unidade fitness com gestor proprietário."], ["/login", "Login", "Entre com credencial da unidade."],
  ];
  return <div className="module-grid">{modules.map(([href, title, text]) => <Link className="module-card" href={href} key={href}><small>{session ? "Operação" : "Comece"}</small><strong>{title}</strong><span>{text}</span></Link>)}</div>;
}

function LoginPanel({ onSubmit, onLogout, state }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; onLogout: () => void; state: LoadState }) {
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Acesso" title="Entrar com credencial" text="Informe unidade, identificador e senha ou código." /><label>Slug da unidade<input name="tenant_slug" placeholder="ex: academia-centro" autoComplete="organization" /></label><label>Identificador<input name="login_identifier" required placeholder="ex: professor.maria" autoComplete="username" /></label><label>Senha ou código<input name="secret" required type="password" autoComplete="current-password" /></label><div className="form-actions"><button type="submit" disabled={state === "loading"}>Entrar</button><button type="button" className="secondary" onClick={onLogout}>Sair</button></div></form><article className="panel guidance-panel"><h2>Entrada por perfil</h2><p>Após o login, a navegação e o dashboard mudam automaticamente conforme o papel do usuário.</p><div className="mini-grid"><Metric label="Gestor" value="Operação" /><Metric label="Professor" value="Treinos" /><Metric label="Aluno" value="Execução" /><Metric label="Acesso" value="Filtrado" /></div></article></div>;
}

function OnboardingPanel({ onSubmit, state }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; state: LoadState }) {
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Novo negócio" title="Criar operação fitness" text="Depois do cadastro você será levado para configurar a equipe." /><label>Nome do negócio<input name="business_name" required minLength={3} placeholder="ex: Academia Centro" /></label><label>Tipo<select name="business_type" defaultValue="academia"><option value="academia">Academia</option><option value="estudio">Estúdio</option><option value="box">Box</option><option value="personal">Personal trainer</option></select></label><label>Slug desejado<input name="slug" placeholder="academia-centro" /></label><label>Gestor proprietário<input name="owner_name" required placeholder="nome do gestor" /></label><label>Identificador de login<input name="login_identifier" required placeholder="gestor.academia" /></label><label>Senha ou código<input name="secret" required type="password" placeholder="mínimo 8 caracteres" /></label><button type="submit" disabled={state === "loading"}>Criar e configurar equipe</button></form><article className="panel flow-panel"><h2>Setup guiado</h2><Process steps={["Criar unidade", "Adicionar professor", "Cadastrar aluno", "Prescrever treino", "Executar treino", "Acompanhar evolução"]} /></article></div>;
}



function InvitePanel({ onSubmit, state }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; state: LoadState }) {
  const [params, setParams] = useState({ tenant_slug: "", token: "", login_identifier: "" });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ tenant_slug: q.get("tenant_slug") || "", token: q.get("token") || "", login_identifier: q.get("login_identifier") || "" });
  }, []);
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Convite" title="Definir acesso" text="Use o link recebido e crie sua credencial para entrar no painel." /><label>Slug da unidade<input name="tenant_slug" required defaultValue={params.tenant_slug} placeholder="unidade" /></label><label>Token do convite<input name="token" required defaultValue={params.token} placeholder="token recebido" /></label><label>Nome<input name="nome" required placeholder="seu nome" /></label><label>Identificador<input name="login_identifier" required defaultValue={params.login_identifier} placeholder="seu.login" /></label><label>Senha ou código<input name="secret" required type="password" placeholder="mínimo 8 caracteres" /></label><button disabled={state === "loading"}>Aceitar convite e entrar</button></form><article className="panel guidance-panel"><h2>Acesso por convite</h2><p>Após aceitar, a sessão entra na unidade correta e o menu muda conforme o papel recebido.</p><div className="mini-grid"><Metric label="Papel" value="Automático" /><Metric label="Unidade" value="Vinculada" /><Metric label="Sessão" value="Assinada" /><Metric label="Acesso" value="Filtrado" /></div></article></div>;
}

function SetupPanel({ setup, session, state, error, onRefresh }: { setup: Json; session: Json | null; state: LoadState; error: string; onRefresh: () => void }) {
  const steps = setup.steps || [];
  if (!session) return <PermissionPanel title="Setup" text="Entre como gestor para continuar a configuração da unidade." />;
  return <div className="dashboard-grid setup-workspace"><section className="panel wide setup-board"><div className="setup-board-head"><div><span className="label">Checklist da unidade</span><h2>{setup.all_done ? "Operação pronta para testar" : "Continue a primeira operação"}</h2><p>{setup.all_done ? "Equipe, aluno, treino, execução e evolução já foram validados nesta unidade." : "Cada etapa usa dados reais do sistema e salva progresso no negócio atual."}</p></div><div className="setup-progress"><strong>{numberText(setup.progress_percent)}%</strong><span>concluído</span></div></div><div className="setup-meter"><i style={{ width: `${Math.max(0, Math.min(100, Number(setup.progress_percent || 0)))}%` }} /></div><div className="setup-steps">{steps.length ? steps.map((step: Json) => <Link className={`setup-step ${step.done ? "is-done" : "is-open"}`} href={step.href || "/"} key={step.id}><span>{String(step.order || 1).padStart(2, "0")}</span><div><strong>{safe(step.title)}</strong><small>{step.done ? "Concluído" : "Abrir etapa"} · {safe(step.count)} registro(s)</small></div><em>{step.done ? "OK" : "Fazer"}</em></Link>) : <article className="item"><strong>Setup não carregado</strong><span>{statusText(error, state === "loading" ? "Carregando..." : "Atualize para calcular o progresso.")}</span></article>}</div><div className="row-actions"><button type="button" className="secondary" onClick={onRefresh}>Atualizar progresso</button><Link className="primary-pill" href={setup?.steps?.find?.((step: Json) => !step.done)?.href || "/evolucao"}>{setup.all_done ? "Ver evolução" : "Continuar etapa"}</Link></div></section><section className="panel setup-summary"><h2>Próxima ação</h2><p>{setup.all_done ? "Use os logins de teste para validar cada papel." : `Etapa atual: ${safe(setup.current_step)}`}</p><div className="mini-grid"><Metric label="Professor" value={setup?.counters?.professors_with_access || 0} /><Metric label="Alunos" value={setup?.counters?.students || 0} /><Metric label="Treinos" value={setup?.counters?.workouts || 0} /><Metric label="Execuções" value={setup?.counters?.completed_executions || 0} /></div></section></div>;
}

function TeamPanel({ role, data, detail, state, error, onCreate, onInvite, onRefresh }: { role: string; data: Json; detail: Json | null; state: LoadState; error: string; onCreate: (event: FormEvent<HTMLFormElement>) => void; onInvite: (event: FormEvent<HTMLFormElement>) => void; onRefresh: () => void }) {
  const users = data.users || [];
  const invites = data.invites || [];
  if (role !== "gestor") return <PermissionPanel title="Equipe" text="Somente gestor administra usuários da unidade." />;
  return <div className="dashboard-grid"><section className="panel wide flow-guide"><FlowHeader current="Equipe" next="Alunos" href="/alunos" /><div className="flow-cards"><FlowCard title="1. Professor" text="Crie o professor que vai revisar treinos." /><FlowCard title="2. Aluno" text="Crie usuário aluno ou envie convite." /><FlowCard title="3. Cadastro operacional" text="No próximo passo, cadastre o aluno no módulo Alunos." /></div></section><form className="panel operational-form" onSubmit={onCreate}><FormHeader label="Equipe" title="Criar usuário" text="Usuário já entra vinculado à unidade atual." /><label>Nome<input name="nome" required placeholder="nome do usuário" /></label><label>Papel<select name="papel" defaultValue="professor"><option value="professor">Professor</option><option value="aluno">Aluno</option></select></label><label>Identificador<input name="login_identifier" required placeholder="professor.maria" /></label><label>Senha/código<input name="secret" required type="password" placeholder="mínimo 8 caracteres" /></label><button disabled={state === "loading"}>Criar usuário</button></form><section className="panel"><PanelTitle title="Usuários da unidade" action="Atualizar" onClick={onRefresh} /><List empty={statusText(error, "Nenhum usuário carregado.")} items={users} pick={(user) => [user.nome, user.papel, user.login_identifier || user.status]} /></section><form className="panel operational-form" onSubmit={onInvite}><FormHeader label="Convite" title="Gerar convite" text="O link leva o usuário para definir a própria credencial." /><label>Nome<input name="nome" required placeholder="nome do convidado" /></label><label>Papel<select name="papel" defaultValue="aluno"><option value="aluno">Aluno</option><option value="professor">Professor</option></select></label><label>Identificador sugerido<input name="login_identifier" placeholder="aluno.joao" /></label><button>Gerar convite</button></form><section className="panel"><h2>Convites recentes</h2><List empty="Nenhum convite recente." items={invites} pick={(invite) => [invite.nome_convidado || invite.nome, invite.papel, invite.status]} /><ActionSummary data={detail} /></section></div>;
}

function StudentsPanel({ role, team, data, detail, state, error, onSubmit, onRefresh }: { role: string; team: Json; data: Json; detail: Json | null; state: LoadState; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onRefresh: () => void }) {
  const studentItems = data.students || [];
  const professors = (team.users || []).filter((user: Json) => user.papel === "professor" || user.role === "professor");
  if (!isStaffRole(role)) return <PermissionPanel title="Alunos" text="Aluno acessa treino e evolução. Cadastro operacional fica com gestor ou professor." />;
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Alunos" title="Cadastrar aluno" text="Selecione professor por lista e avance automaticamente para treinos." /><label>Nome público<input name="nome_publico" required defaultValue="Aluno Operacional" /></label>{professors.length ? <label>Professor responsável<select name="professor_id" defaultValue={professors[0]?.id}>{professors.map((professor: Json) => <option key={professor.id} value={professor.id}>{professor.nome}</option>)}</select></label> : null}<label>Código interno<input name="codigo_publico" placeholder="opcional" /></label><label>Nível<select name="nivel" defaultValue="iniciante"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label><label>Objetivo<input name="objetivo" defaultValue="força e evolução" /></label><label>Modalidade<input name="modalidade_preferida" defaultValue="academia" /></label><label>Frequência semanal<input name="frequencia_semana" type="number" min="1" max="7" defaultValue="3" /></label><button disabled={state === "loading"}>Cadastrar e prescrever treino</button></form><section className="panel"><PanelTitle title="Alunos ativos" action="Atualizar" onClick={onRefresh} /><List empty={statusText(error, "Nenhum aluno carregado.")} items={studentItems} pick={(student) => [student.nome_publico, student.professor_nome || student.nivel, `${student.objetivo || "objetivo"} · ${student.frequencia_semana || 0}x/semana`]} /><ActionSummary data={detail} /></section></div>;
}

function TrainingPanel({ role, students, data, detail, state, error, selectedStudentId, onSubmit, onReview, onRefresh }: { role: string; students: Json[]; data: Json; detail: Json | null; state: LoadState; error: string; selectedStudentId: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReview: (id: string, status: "aprovado" | "ajustes_solicitados") => void; onRefresh: () => void }) {
  const canPrescribe = role === "gestor" || role === "professor";
  const prescriptions = data.prescriptions || data.workouts || [];
  return <div className="split-grid">{canPrescribe ? <form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Treinos" title="Nova prescrição" text="Escolha um aluno real da unidade. Nenhum ID manual é necessário." /><label>Aluno<select name="student_id" required defaultValue={selectedStudentId}>{students.length ? students.map((student) => <option key={student.id} value={student.id}>{student.nome_publico}</option>) : <option value="">Cadastre um aluno antes</option>}</select></label><label>Nome do treino<input name="nome_treino" required defaultValue="Treino base semanal" /></label><label>Objetivo<input name="objetivo" defaultValue="força e condicionamento" /></label><label>Modalidade<input name="modalidade" defaultValue="academia" /></label><label>Foco<input name="foco" defaultValue="corpo inteiro" /></label><label>Dias por semana<input name="dias_semana" type="number" min="1" max="7" defaultValue="3" /></label><label>Exercícios<textarea name="exercicios" defaultValue={"Agachamento técnico\nRemada controlada\nPrancha"} /></label><label>Orientações<textarea name="orientacoes" defaultValue="Executar com controle, registrar esforço e avisar desconforto." /></label><button disabled={state === "loading" || !students.length}>Criar prescrição</button></form> : <PermissionPanel title="Treinos" text="Aluno visualiza treinos liberados. Prescrição e revisão ficam com gestor ou professor." />}<section className="panel"><PanelTitle title={role === "aluno" ? "Meus treinos" : "Treinos da unidade"} action="Atualizar" onClick={onRefresh} /><div className="item-list">{prescriptions.length ? prescriptions.map((item: Json) => <article className="item" key={item.id}><strong>{safe(item.nome_treino || item.workout_name || item.id)}</strong><span>{safe(item.student_name || item.aluno_nome || "meu treino")} · {safe(item.status)}</span>{canPrescribe ? <div className="row-actions"><button type="button" onClick={() => onReview(String(item.id), "aprovado")}>Aprovar</button><button type="button" className="secondary" onClick={() => onReview(String(item.id), "ajustes_solicitados")}>Pedir ajuste</button></div> : null}</article>) : <article className="item"><strong>Nenhum treino carregado</strong><span>{statusText(error, canPrescribe ? "Cadastre aluno e crie uma prescrição." : "Seu treino aparece aqui após liberação.")}</span></article>}</div><ActionSummary data={detail} /></section></div>;
}

function ExecutionPanel({ role, workouts, executions, detail, state, error, firstPrescriptionId, firstExecutionId, onStart, onMarkDone, onFinish, onRefresh }: { role: string; workouts: Json; executions: Json; detail: Json | null; state: LoadState; error: string; firstPrescriptionId: string; firstExecutionId: string; onStart: (workoutId: string) => void; onMarkDone: (executionId: string, index: number) => void; onFinish: (event: FormEvent<HTMLFormElement>) => void; onRefresh: () => void }) {
  const approved = workouts.prescriptions || workouts.workouts || [];
  const items = executions.executions || [];
  const inProgress = items.filter((item: Json) => item.status === "em_execucao");
  const isAluno = role === "aluno";
  return <div className="dashboard-grid"><section className="panel"><PanelTitle title={isAluno ? "Treino do dia" : "Execuções em andamento"} action="Atualizar" onClick={onRefresh} /><div className="item-list">{isAluno && approved.length ? approved.map((workout: Json) => <article className="item" key={workout.id}><strong>{safe(workout.nome_treino || workout.workout_name)}</strong><span>{safe(workout.objetivo)} · {safe(workout.status)}</span><button type="button" onClick={() => onStart(String(workout.id))}>Iniciar treino</button></article>) : items.length ? items.map((item: Json) => <article className="item" key={item.id}><strong>{safe(item.nome_treino || item.workout_id)}</strong><span>{safe(item.student_name)} · {safe(item.status)} · {safe(item.progresso_percentual)}%</span></article>) : <article className="item"><strong>{isAluno ? "Nenhum treino liberado" : "Nenhuma execução em andamento"}</strong><span>{statusText(error, isAluno ? "Quando o professor liberar, o treino aparece aqui." : "As execuções dos alunos aparecerão neste painel.")}</span></article>}</div></section>{isAluno ? <form className="panel operational-form" onSubmit={onFinish}><FormHeader label="Aluno" title="Concluir execução" text="Selecione a sessão aberta. O sistema já lista seus treinos em andamento." /><label>Execução em andamento<select name="execution_id" required defaultValue={firstExecutionId}>{inProgress.length ? inProgress.map((item: Json) => <option key={item.id} value={item.id}>{safe(item.nome_treino || item.workout_id)} · {safe(item.progresso_percentual)}%</option>) : <option value="">Inicie um treino antes</option>}</select></label><label>Esforço percebido<input name="percepcao_esforco" type="number" min="1" max="10" defaultValue="7" /></label><label>Duração em minutos<input name="duracao_minutos" type="number" min="1" max="480" defaultValue="45" /></label><label>Observações<textarea name="observacoes" defaultValue="Treino concluído com boa técnica." /></label><button disabled={state === "loading" || !firstExecutionId}>Concluir treino</button></form> : <article className="panel guidance-panel"><h2>Acompanhamento da equipe</h2><p>Gestor e professor acompanham execução, esforço e conclusão. Iniciar e concluir aparecem apenas para aluno.</p><div className="mini-grid"><Metric label="Em andamento" value={executions?.em_execucao || 0} /><Metric label="Concluídos" value={executions?.concluidos || 0} /></div></article>}<section className="panel wide"><h2>Ações permitidas</h2><div className="row-actions">{isAluno ? <><button type="button" onClick={() => onStart(firstPrescriptionId)} disabled={!firstPrescriptionId}>Iniciar treino liberado</button><button type="button" className="secondary" onClick={() => onMarkDone(firstExecutionId, 0)} disabled={!firstExecutionId}>Marcar próximo exercício</button></> : <span className="muted-note">Modo acompanhamento: sem ações de aluno nesta sessão.</span>}<button type="button" className="secondary" onClick={onRefresh}>Recarregar painel</button></div><ActionSummary data={detail} /></section></div>;
}

function EvolutionPanel({ data, detail, state, error, isStaff, onStudent, onRefresh }: { data: Json; detail: Json | null; state: LoadState; error: string; isStaff: boolean; onStudent: (studentId: string) => void; onRefresh: () => void }) {
  const summary = data.summary || data.student || {};
  const students = data.students || [];
  const weekly = data.weekly || [];
  const history = data.history || [];
  return <div className="dashboard-grid"><section className="panel wide"><PanelTitle title="Resumo de evolução" action="Atualizar" onClick={onRefresh} /><div className="metric-grid"><Metric label="Alunos" value={summary.students || (data.student ? 1 : 0)} /><Metric label="Execuções" value={summary.executions || summary.total_executions} /><Metric label="Concluídos" value={summary.completed || summary.completed_executions} /><Metric label="Esforço médio" value={summary.average_effort} /></div><Chart weekly={weekly} history={history} /></section>{isStaff ? <section className="panel"><h2>Progresso dos alunos</h2><div className="item-list">{students.length ? students.map((student: Json) => <button type="button" className="student-row" key={student.student_id} onClick={() => onStudent(String(student.student_id))}><strong>{safe(student.student_name)}</strong><span>{safe(student.completed_executions)} concluídos · esforço {safe(student.average_effort)} · {safe(student.progress_percent)}%</span></button>) : <article className="item"><strong>Nenhum progresso carregado</strong><span>{statusText(error, "Execute treinos para gerar histórico.")}</span></article>}</div></section> : <section className="panel"><h2>Minha evolução</h2>{data.student ? <MetricTable data={data} /> : <article className="item"><strong>Sem histórico</strong><span>{statusText(error, state === "loading" ? "Carregando..." : "Seu progresso aparece após concluir treinos.")}</span></article>}</section>}{detail ? <section className="panel wide"><h2>Detalhe do aluno</h2><MetricTable data={detail} /></section> : null}</div>;
}

function PermissionPanel({ title, text }: { title: string; text: string }) { return <article className="panel permission-panel"><span className="label">Acesso por papel</span><h2>{title}</h2><p>{text}</p><Link className="button secondary" href="/">Voltar para visão geral</Link></article>; }
function FormHeader({ label, title, text }: { label: string; title: string; text: string }) { return <div className="form-head"><span className="label">{label}</span><h2>{title}</h2><p>{text}</p></div>; }
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="panel-title"><h2>{title}</h2><button type="button" className="secondary" onClick={onClick}>{action}</button></div>; }
function FlowHeader({ current, next, href }: { current: string; next: string; href: string }) { return <div className="flow-header"><span>Setup guiado</span><strong>{current}</strong><Link className="primary-pill" href={href}>Próximo: {next}</Link></div>; }
function FlowCard({ title, text }: { title: string; text: string }) { return <article className="flow-card"><strong>{title}</strong><span>{text}</span></article>; }
function Process({ steps }: { steps: string[] }) { return <div className="process-list">{steps.map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></div>)}</div>; }
function List({ items, pick, empty }: { items: Json[]; pick: (item: Json) => any[]; empty: string }) { return <div className="item-list">{items.length ? items.map((item, index) => { const row = pick(item); return <article className="item" key={safe(item.id || `${row[0]}-${index}`)}><strong>{safe(row[0])}</strong><span>{safe(row[1])} · {safe(row[2])}</span></article>; }) : <article className="item"><strong>Sem dados</strong><span>{empty}</span></article>}</div>; }
function ActionSummary({ data }: { data: Json | null }) { if (!data) return null; const entity = data.user || data.student || data.prescription || data.execution || data.invite || data.session || {}; const title = entity.nome || entity.nome_publico || entity.nome_treino || entity.nome_convidado || entity.actor_name || data.mvp || "Ação concluída"; const subtitle = entity.papel || entity.status || entity.tenant_slug || data.tenant_slug || (data.ok ? "Concluído" : "Atualizado"); const url = data.invite?.public_url || data.public_url || ""; return <article className="action-summary"><span>Última ação</span><strong>{safe(title)}</strong><small>{safe(subtitle)}</small>{url ? <a href={url}>Abrir convite</a> : null}</article>; }
function Metric({ label, value }: { label: string; value: any }) { return <div className="metric"><span>{label}</span><strong>{typeof value === "string" ? value : numberText(value)}</strong></div>; }
function Chart({ weekly, history }: { weekly: Json[]; history: Json[] }) { const source: Json[] = weekly.length ? weekly : history.slice(0, 8).map((item, index) => ({ week: `#${index + 1}`, completed: item.status === "concluido" ? 1 : 0 })); const max = Math.max(1, ...source.map((item) => Number(item.completed || item.executions || 0))); return <div className="chart">{source.length ? source.map((item) => { const value = Number(item.completed || item.executions || 0); return <div className="bar" key={safe(item.week || item.id)} style={{ height: `${Math.max(10, (value / max) * 100)}%` }}><span>{value}</span><small>{safe(item.week || "exec")}</small></div>; }) : <div className="empty-chart">Histórico aparece após execuções concluídas.</div>}</div>; }
function MetricTable({ data }: { data: Json }) { const student = data.student || {}; const history = data.history || []; const byWorkout = data.by_workout || []; return <><div className="metric-grid"><Metric label="Execuções" value={student.total_executions} /><Metric label="Frequência" value={student.weekly_frequency} /><Metric label="Esforço" value={student.average_effort} /><Metric label="Progresso" value={student.progress_percent} /></div><div className="table"><div><strong>Treino</strong><strong>Status</strong><strong>Duração</strong></div>{history.length ? history.map((item: Json) => <div key={item.id}><span>{safe(item.nome_treino || item.workout_id)}</span><span>{safe(item.status)}</span><span>{safe(item.duracao_minutos)} min</span></div>) : byWorkout.length ? byWorkout.map((item: Json) => <div key={item.workout_id || item.nome_treino}><span>{safe(item.nome_treino || item.workout_id)}</span><span>{safe(item.completed_executions)} concluídos</span><span>{safe(item.average_duration)} min</span></div>) : <div><span>Sem histórico</span><span>—</span><span>—</span></div>}</div></>; }
