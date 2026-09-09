"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Json = Record<string, any>;
type Mode = "home" | "login" | "onboarding" | "team" | "students" | "training" | "execution" | "evolution";
type LoadState = "idle" | "loading" | "success" | "error";

const routeCopy: Record<Mode, { eyebrow: string; title: string; text: string }> = {
  home: { eyebrow: "Operação conectada", title: "Painel único para vender, operar e acompanhar treinos.", text: "Da criação do negócio até a evolução do aluno, tudo roda em uma interface única, com sessão real, dados do banco e navegação por papel." },
  login: { eyebrow: "Acesso", title: "Entrar no FitCore Pro.", text: "Use o slug da unidade, seu identificador e senha ou código de acesso para abrir o painel correto." },
  onboarding: { eyebrow: "Novo negócio", title: "Criar academia, estúdio, box ou personal.", text: "O cadastro cria a unidade, o gestor proprietário, a primeira equipe e a sessão de entrada." },
  team: { eyebrow: "Equipe", title: "Usuários, papéis e acesso da unidade.", text: "Crie professores e alunos com credenciais próprias, liste a equipe e mantenha cada pessoa no papel correto." },
  students: { eyebrow: "Alunos", title: "Cadastro operacional de alunos.", text: "Registre objetivo, nível, frequência, professor responsável e status em uma tela real de operação." },
  training: { eyebrow: "Treinos", title: "Prescrição vinculada ao aluno real.", text: "Crie treinos para alunos cadastrados, revise como professor ou gestor e libere a execução para o aluno." },
  execution: { eyebrow: "Execução", title: "Treino em andamento e conclusão.", text: "O aluno inicia o treino aprovado, marca exercícios, registra esforço, duração e finaliza a sessão." },
  evolution: { eyebrow: "Evolução", title: "Histórico e progresso por aluno.", text: "Veja frequência semanal, esforço médio, histórico de execuções e progresso por aluno dentro da unidade." },
};

async function api(path: string, options: RequestInit = {}): Promise<Json> {
  const res = await fetch(path, { cache: "no-store", credentials: "include", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.mensagem || data.erro || data.reason || `HTTP ${res.status}`);
  return data;
}

function safe(value: any): string { return value === undefined || value === null || value === "" ? "—" : String(value); }
function numberText(value: any): string { const n = Number(value ?? 0); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0"; }
function formPayload(form: HTMLFormElement): Json {
  const out: Json = {};
  new FormData(form).forEach((raw, key) => {
    const value = typeof raw === "string" ? raw.trim() : String(raw);
    if (!value) return;
    out[key] = /^\d+$/.test(value) ? Number(value) : value;
  });
  return out;
}
function statusText(error: string, fallback = "Nenhum registro carregado") { return error ? `Erro: ${error}` : fallback; }

export function FitCoreRouteClient({ mode }: { mode: Mode }) {
  const copy = routeCopy[mode];
  const [session, setSession] = useState<Json | null>(null);
  const [navigation, setNavigation] = useState<Json | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Json | null>(null);
  const [team, setTeam] = useState<Json>({});
  const [students, setStudents] = useState<Json>({ students: [] });
  const [prescriptions, setPrescriptions] = useState<Json>({ prescriptions: [] });
  const [executions, setExecutions] = useState<Json>({ executions: [] });
  const [evolution, setEvolution] = useState<Json>({ students: [], weekly: [], summary: {} });
  const [detail, setDetail] = useState<Json | null>(null);

  const role = String(session?.actor_role || "visitante");
  const isStaff = role === "gestor" || role === "professor";
  const firstStudentId = useMemo(() => students?.students?.[0]?.id || "", [students]);
  const firstPrescriptionId = useMemo(() => prescriptions?.prescriptions?.[0]?.id || prescriptions?.workouts?.[0]?.id || "", [prescriptions]);
  const firstExecutionId = useMemo(() => executions?.executions?.find((item: Json) => item.status === "em_execucao")?.id || executions?.executions?.[0]?.id || "", [executions]);

  const loadSession = useCallback(async () => {
    try {
      const result = await api(`/api/mvp-15/session?v=${Date.now()}`);
      setSession(result.current_session || null);
      if (result.current_session) {
        try { setNavigation(await api(`/api/mvp-17/navigation?v=${Date.now()}`)); } catch { setNavigation(null); }
      } else {
        setNavigation(null);
      }
      return result.current_session || null;
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
      const currentRole = String(current?.actor_role || "");
      const currentIsStaff = currentRole === "gestor" || currentRole === "professor";
      if (["students", "training"].includes(target) && currentIsStaff) setStudents(await api(`/api/mvp-23/students?limit=80&v=${Date.now()}`));
      if (target === "team" && currentRole === "gestor") setTeam(await api(`/api/mvp-22/users?v=${Date.now()}`));
      if (target === "training" && currentIsStaff) setPrescriptions(await api(`/api/mvp-24/prescriptions?limit=80&v=${Date.now()}`));
      if (target === "training" && currentRole === "aluno") setPrescriptions(await api(`/api/mvp-24/my-workouts?status=aprovado&limit=40&v=${Date.now()}`));
      if (target === "execution") {
        if (currentRole === "aluno") {
          setPrescriptions(await api(`/api/mvp-24/my-workouts?status=aprovado&limit=40&v=${Date.now()}`));
          setExecutions(await api(`/api/mvp-25/my-executions?limit=60&v=${Date.now()}`));
        } else if (currentIsStaff) {
          setExecutions(await api(`/api/mvp-25/executions?limit=80&v=${Date.now()}`));
        }
      }
      if (target === "evolution") {
        if (currentIsStaff) setEvolution(await api(`/api/mvp-26/evolution?limit=80&v=${Date.now()}`));
        if (currentRole === "aluno") setEvolution(await api(`/api/mvp-26/my-evolution?limit=80&v=${Date.now()}`));
      }
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
      setState("error");
    }
  }, [loadSession, mode]);

  useEffect(() => { loadRouteData(mode); }, [loadRouteData, mode]);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".panel, .session-card, .module-card, .metric"));
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

  async function runAction(label: string, action: () => Promise<Json>, refreshTarget: Mode = mode) {
    setToast({ type: "loading", title: label, message: "Processando..." });
    try {
      const result = await action();
      setToast({ type: "success", title: label, message: "Concluído com sucesso.", result });
      setDetail(result);
      await loadRouteData(refreshTarget);
    } catch (err) {
      setToast({ type: "error", title: label, message: err instanceof Error ? err.message : "Ação não concluída." });
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = formPayload(event.currentTarget);
    await runAction("Login", () => api("/api/mvp-19/login", { method: "POST", body: JSON.stringify(payload) }), "home");
  }

  async function logout() {
    await runAction("Logout", () => api("/api/mvp-15/session/logout", { method: "POST", body: "{}" }), "login");
    setSession(null);
  }

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Criar negócio", () => api("/api/mvp-21/onboarding", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "home");
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Criar usuário", () => api("/api/mvp-22/users", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "team");
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Gerar convite", () => api("/api/mvp-22/users/invite", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "team");
  }

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Cadastrar aluno", () => api("/api/mvp-23/students", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }), "students");
  }

  async function submitPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = formPayload(event.currentTarget);
    payload.exercicios = String(payload.exercicios || "").split("\n").map((item) => item.trim()).filter(Boolean);
    await runAction("Criar prescrição", () => api("/api/mvp-24/prescriptions", { method: "POST", body: JSON.stringify(payload) }), "training");
  }

  async function reviewPrescription(id: string, status: "aprovado" | "ajustes_solicitados") {
    await runAction(status === "aprovado" ? "Aprovar treino" : "Solicitar ajustes", () => api(`/api/mvp-24/prescriptions/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ status, observacoes: status === "aprovado" ? "Aprovado no painel Next." : "Ajustes solicitados no painel Next." }) }), "training");
  }

  async function startExecution(workoutId: string) {
    await runAction("Iniciar treino", () => api("/api/mvp-25/executions/start", { method: "POST", body: JSON.stringify({ workout_id: workoutId }) }), "execution");
  }

  async function markExerciseDone(executionId: string, index: number) {
    await runAction("Marcar exercício", () => api(`/api/mvp-25/executions/${encodeURIComponent(executionId)}/exercises/${index}/done`, { method: "POST", body: JSON.stringify({ observacao: "Marcado no painel Next." }) }), "execution");
  }

  async function finishExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = formPayload(event.currentTarget);
    const id = String(payload.execution_id || "");
    await runAction("Concluir treino", () => api(`/api/mvp-25/executions/${encodeURIComponent(id)}/finish`, { method: "POST", body: JSON.stringify(payload) }), "execution");
  }

  async function loadStudentEvolution(studentId: string) {
    await runAction("Detalhe de evolução", () => api(`/api/mvp-26/students/${encodeURIComponent(studentId)}/evolution?limit=80`), "evolution");
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

      <RoleDashboard session={session} navigation={navigation} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {mode === "home" && <HomePanel session={session} />}
      {mode === "login" && <LoginPanel onSubmit={submitLogin} onLogout={logout} state={state} />}
      {mode === "onboarding" && <OnboardingPanel onSubmit={submitOnboarding} state={state} />}
      {mode === "team" && <TeamPanel data={team} detail={detail} state={state} error={error} onCreate={submitUser} onInvite={submitInvite} onRefresh={() => loadRouteData("team")} />}
      {mode === "students" && <StudentsPanel data={students} detail={detail} state={state} error={error} onSubmit={submitStudent} onRefresh={() => loadRouteData("students")} />}
      {mode === "training" && <TrainingPanel students={students?.students || []} data={prescriptions} detail={detail} state={state} error={error} firstStudentId={firstStudentId} onSubmit={submitPrescription} onReview={reviewPrescription} onRefresh={() => loadRouteData("training")} />}
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

function RoleDashboard({ session, navigation }: { session: Json | null; navigation: Json | null }) {
  const role = String(session?.actor_role || "visitante");
  const items = role === "gestor" ? ["Equipe", "Alunos", "Treinos", "Execução", "Evolução"] : role === "professor" ? ["Alunos", "Treinos", "Execução", "Evolução"] : role === "aluno" ? ["Treinos", "Execução", "Evolução"] : ["Criar negócio", "Login"];
  return <section className="role-dashboard"><div><span>Painel por papel</span><strong>{role === "visitante" ? "Visitante" : role}</strong><p>{session ? "Menu e dados carregam conforme o acesso da sessão." : "Entre para carregar seu painel."}</p></div><div className="role-pills">{items.map((item) => <span key={item}>{item}</span>)}</div>{navigation?.menu?.length ? <small>{navigation.menu.length} áreas liberadas</small> : null}</section>;
}

function HomePanel({ session }: { session: Json | null }) {
  const modules = [
    ["/onboarding", "Criar negócio", "Abra uma unidade fitness com gestor proprietário e equipe inicial."],
    ["/equipe", "Equipe", "Crie usuários, defina papéis e mantenha acessos organizados."],
    ["/alunos", "Alunos", "Cadastre alunos, objetivos, nível e frequência semanal."],
    ["/treinos", "Treinos", "Prescreva treinos e libere após revisão responsável."],
    ["/execucao", "Execução", "Acompanhe treinos em andamento, esforço e conclusão."],
    ["/evolucao", "Evolução", "Veja histórico, frequência e progresso por aluno."],
  ];
  return <div className="module-grid">{modules.map(([href, title, text]) => <Link className="module-card" href={href} key={href}><small>{session ? "Operação" : "Comece"}</small><strong>{title}</strong><span>{text}</span></Link>)}</div>;
}

function LoginPanel({ onSubmit, onLogout, state }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; onLogout: () => void; state: LoadState }) {
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Acesso" title="Entrar com credencial" text="Informe a unidade, identificador e senha ou código." /><label>Slug da unidade<input name="tenant_slug" placeholder="ex: academia-centro" autoComplete="organization" /></label><label>Identificador<input name="login_identifier" required placeholder="ex: professor.maria" autoComplete="username" /></label><label>Senha ou código<input name="secret" required type="password" autoComplete="current-password" /></label><div className="form-actions"><button type="submit" disabled={state === "loading"}>Entrar</button><button type="button" className="secondary" onClick={onLogout}>Sair</button></div></form><article className="panel guidance-panel"><h2>Entrada profissional</h2><p>O sistema abre a área correta pelo papel do usuário. Gestor, professor e aluno veem rotinas diferentes na mesma base operacional.</p><div className="mini-grid"><Metric label="Sessão" value="Assinada" /><Metric label="Acesso" value="Por papel" /></div></article></div>;
}

function OnboardingPanel({ onSubmit, state }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; state: LoadState }) {
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Novo negócio" title="Criar operação fitness" text="Configure a unidade e o gestor proprietário." /><label>Nome do negócio<input name="business_name" required minLength={3} placeholder="ex: Academia Centro" /></label><label>Tipo<select name="business_type" defaultValue="academia"><option value="academia">Academia</option><option value="estudio">Estúdio</option><option value="box">Box</option><option value="personal">Personal trainer</option></select></label><label>Slug desejado<input name="slug" placeholder="academia-centro" /></label><label>Gestor proprietário<input name="owner_name" required placeholder="nome do gestor" /></label><label>Identificador de login<input name="login_identifier" required placeholder="gestor.academia" /></label><label>Senha ou código<input name="secret" required type="password" placeholder="mínimo 8 caracteres" /></label><label>Primeiro professor<input name="professor_nome" placeholder="opcional" /></label><label>Primeiro aluno<input name="aluno_nome" placeholder="opcional" /></label><button type="submit" disabled={state === "loading"}>Criar e entrar</button></form><article className="panel flow-panel"><h2>Fluxo criado</h2><Process steps={["Unidade", "Gestor", "Equipe", "Aluno", "Treino", "Evolução"]} /></article></div>;
}

function TeamPanel({ data, detail, state, error, onCreate, onInvite, onRefresh }: { data: Json; detail: Json | null; state: LoadState; error: string; onCreate: (event: FormEvent<HTMLFormElement>) => void; onInvite: (event: FormEvent<HTMLFormElement>) => void; onRefresh: () => void }) {
  const users = data.users || [];
  const invites = data.invites || [];
  return <div className="dashboard-grid"><form className="panel operational-form" onSubmit={onCreate}><FormHeader label="Equipe" title="Criar usuário" text="Adicione professor ou aluno diretamente à unidade." /><label>Nome<input name="nome" required placeholder="nome do usuário" /></label><label>Papel<select name="papel" defaultValue="professor"><option value="professor">Professor</option><option value="aluno">Aluno</option></select></label><label>Identificador<input name="login_identifier" required placeholder="professor.maria" /></label><label>Senha/código<input name="secret" required type="password" placeholder="mínimo 8 caracteres" /></label><button disabled={state === "loading"}>Criar usuário</button></form><section className="panel"><PanelTitle title="Usuários da unidade" action="Atualizar" onClick={onRefresh} /><List empty={statusText(error, "Nenhum usuário carregado.")} items={users} pick={(user) => [user.nome, user.papel, user.login_identifier || user.status]} /></section><form className="panel operational-form" onSubmit={onInvite}><FormHeader label="Convite" title="Gerar link de acesso" text="Use para enviar entrada ao professor ou aluno." /><label>Nome<input name="nome" required placeholder="nome do convidado" /></label><label>Papel<select name="papel" defaultValue="aluno"><option value="aluno">Aluno</option><option value="professor">Professor</option></select></label><label>Identificador sugerido<input name="login_identifier" placeholder="aluno.joao" /></label><button>Gerar convite</button></form><section className="panel"><h2>Convites recentes</h2><List empty="Nenhum convite recente." items={invites} pick={(invite) => [invite.nome_convidado || invite.nome, invite.papel, invite.status]} />{detail ? <MiniResult data={detail} /> : null}</section></div>;
}

function StudentsPanel({ data, detail, state, error, onSubmit, onRefresh }: { data: Json; detail: Json | null; state: LoadState; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onRefresh: () => void }) {
  const students = data.students || [];
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Alunos" title="Cadastrar aluno" text="Crie o registro operacional que será usado em treinos e evolução." /><label>Nome público<input name="nome_publico" required defaultValue="Aluno Operacional" /></label><label>Código interno<input name="codigo_publico" placeholder="opcional" /></label><label>Nível<select name="nivel" defaultValue="iniciante"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label><label>Objetivo<input name="objetivo" defaultValue="força e evolução" /></label><label>Modalidade<input name="modalidade_preferida" defaultValue="academia" /></label><label>Frequência semanal<input name="frequencia_semana" type="number" min="1" max="7" defaultValue="3" /></label><label>Etiquetas<input name="etiquetas" placeholder="ex: manhã, iniciante" /></label><button disabled={state === "loading"}>Cadastrar aluno</button></form><section className="panel"><PanelTitle title="Alunos ativos" action="Atualizar" onClick={onRefresh} /><List empty={statusText(error, "Nenhum aluno carregado.")} items={students} pick={(student) => [student.nome_publico, student.nivel, `${student.objetivo || "objetivo"} · ${student.frequencia_semana || 0}x/semana`]} />{detail ? <MiniResult data={detail} /> : null}</section></div>;
}

function TrainingPanel({ students, data, detail, state, error, firstStudentId, onSubmit, onReview, onRefresh }: { students: Json[]; data: Json; detail: Json | null; state: LoadState; error: string; firstStudentId: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReview: (id: string, status: "aprovado" | "ajustes_solicitados") => void; onRefresh: () => void }) {
  const prescriptions = data.prescriptions || data.workouts || [];
  return <div className="split-grid"><form className="panel operational-form" onSubmit={onSubmit}><FormHeader label="Treinos" title="Nova prescrição" text="Selecione um aluno real e monte o treino para revisão." /><label>Aluno<select name="student_id" required defaultValue={firstStudentId}>{students.length ? students.map((student) => <option key={student.id} value={student.id}>{student.nome_publico}</option>) : <option value="">Entre como gestor/professor e cadastre um aluno</option>}</select></label><label>Nome do treino<input name="nome_treino" required defaultValue="Treino base semanal" /></label><label>Objetivo<input name="objetivo" defaultValue="força e condicionamento" /></label><label>Modalidade<input name="modalidade" defaultValue="academia" /></label><label>Foco<input name="foco" defaultValue="corpo inteiro" /></label><label>Dias por semana<input name="dias_semana" type="number" min="1" max="7" defaultValue="3" /></label><label>Exercícios<textarea name="exercicios" defaultValue={"Agachamento técnico\nRemada controlada\nPrancha"} /></label><label>Orientações<textarea name="orientacoes" defaultValue="Executar com controle, registrar esforço e avisar desconforto." /></label><button disabled={state === "loading"}>Criar prescrição</button></form><section className="panel"><PanelTitle title="Treinos da unidade" action="Atualizar" onClick={onRefresh} /><div className="item-list">{prescriptions.length ? prescriptions.map((item: Json) => <article className="item" key={item.id}><strong>{safe(item.nome_treino || item.workout_name || item.id)}</strong><span>{safe(item.student_name || item.aluno_nome)} · {safe(item.status)}</span><div className="row-actions"><button type="button" onClick={() => onReview(String(item.id), "aprovado")}>Aprovar</button><button type="button" className="secondary" onClick={() => onReview(String(item.id), "ajustes_solicitados")}>Pedir ajuste</button></div></article>) : <article className="item"><strong>Nenhum treino carregado</strong><span>{statusText(error, "Cadastre aluno e crie uma prescrição.")}</span></article>}</div>{detail ? <MiniResult data={detail} /> : null}</section></div>;
}

function ExecutionPanel({ role, workouts, executions, detail, state, error, firstPrescriptionId, firstExecutionId, onStart, onMarkDone, onFinish, onRefresh }: { role: string; workouts: Json; executions: Json; detail: Json | null; state: LoadState; error: string; firstPrescriptionId: string; firstExecutionId: string; onStart: (workoutId: string) => void; onMarkDone: (executionId: string, index: number) => void; onFinish: (event: FormEvent<HTMLFormElement>) => void; onRefresh: () => void }) {
  const approved = workouts.prescriptions || workouts.workouts || [];
  const items = executions.executions || [];
  return <div className="dashboard-grid"><section className="panel"><PanelTitle title={role === "aluno" ? "Meus treinos liberados" : "Execuções da unidade"} action="Atualizar" onClick={onRefresh} /><div className="item-list">{role === "aluno" && approved.length ? approved.map((workout: Json) => <article className="item" key={workout.id}><strong>{safe(workout.nome_treino || workout.workout_name)}</strong><span>{safe(workout.objetivo)} · {safe(workout.status)}</span><button type="button" onClick={() => onStart(String(workout.id))}>Iniciar treino</button></article>) : items.length ? items.map((item: Json) => <article className="item" key={item.id}><strong>{safe(item.nome_treino || item.workout_id)}</strong><span>{safe(item.student_name)} · {safe(item.status)} · {safe(item.progresso_percentual)}%</span></article>) : <article className="item"><strong>Nada carregado</strong><span>{statusText(error, "Entre como aluno para iniciar ou como equipe para acompanhar.")}</span></article>}</div></section><form className="panel operational-form" onSubmit={onFinish}><FormHeader label="Aluno" title="Finalizar execução" text="Registre esforço e duração do treino em andamento." /><label>ID da execução<input name="execution_id" required defaultValue={firstExecutionId} /></label><label>Esforço percebido<input name="percepcao_esforco" type="number" min="1" max="10" defaultValue="7" /></label><label>Duração em minutos<input name="duracao_minutos" type="number" min="1" max="480" defaultValue="45" /></label><label>Observações<textarea name="observacoes" defaultValue="Treino concluído com boa técnica." /></label><button disabled={state === "loading"}>Concluir treino</button></form><section className="panel wide"><h2>Ações rápidas</h2><div className="row-actions"><button type="button" onClick={() => onStart(firstPrescriptionId)} disabled={!firstPrescriptionId}>Iniciar primeiro treino</button><button type="button" className="secondary" onClick={() => onMarkDone(firstExecutionId, 0)} disabled={!firstExecutionId}>Marcar exercício 1</button><button type="button" className="secondary" onClick={onRefresh}>Recarregar painel</button></div>{detail ? <MiniResult data={detail} /> : null}</section></div>;
}

function EvolutionPanel({ data, detail, state, error, isStaff, onStudent, onRefresh }: { data: Json; detail: Json | null; state: LoadState; error: string; isStaff: boolean; onStudent: (studentId: string) => void; onRefresh: () => void }) {
  const summary = data.summary || data.student || {};
  const students = data.students || [];
  const weekly = data.weekly || [];
  const history = data.history || [];
  return <div className="dashboard-grid"><section className="panel wide"><PanelTitle title="Resumo de evolução" action="Atualizar" onClick={onRefresh} /><div className="metric-grid"><Metric label="Alunos" value={summary.students || (data.student ? 1 : 0)} /><Metric label="Execuções" value={summary.executions || summary.total_executions} /><Metric label="Concluídos" value={summary.completed || summary.completed_executions} /><Metric label="Esforço médio" value={summary.average_effort} /></div><Chart weekly={weekly} history={history} /></section>{isStaff ? <section className="panel"><h2>Progresso dos alunos</h2><div className="item-list">{students.length ? students.map((student: Json) => <button type="button" className="student-row" key={student.student_id} onClick={() => onStudent(String(student.student_id))}><strong>{safe(student.student_name)}</strong><span>{safe(student.completed_executions)} concluídos · esforço {safe(student.average_effort)} · {safe(student.progress_percent)}%</span></button>) : <article className="item"><strong>Nenhum progresso carregado</strong><span>{statusText(error, "Execute treinos para gerar histórico.")}</span></article>}</div></section> : <section className="panel"><h2>Minha evolução</h2><MiniResult data={data.student ? { student: data.student, history } : { status: state, erro: error || "Sem histórico carregado" }} /></section>}{detail ? <section className="panel wide"><h2>Detalhe do aluno</h2><MetricTable data={detail} /></section> : null}</div>;
}

function FormHeader({ label, title, text }: { label: string; title: string; text: string }) { return <div className="form-head"><span className="label">{label}</span><h2>{title}</h2><p>{text}</p></div>; }
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="panel-title"><h2>{title}</h2><button type="button" className="secondary" onClick={onClick}>{action}</button></div>; }
function Process({ steps }: { steps: string[] }) { return <div className="process-list">{steps.map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></div>)}</div>; }
function List({ items, pick, empty }: { items: Json[]; pick: (item: Json) => any[]; empty: string }) { return <div className="item-list">{items.length ? items.map((item, index) => { const row = pick(item); return <article className="item" key={safe(item.id || `${row[0]}-${index}`)}><strong>{safe(row[0])}</strong><span>{safe(row[1])} · {safe(row[2])}</span></article>; }) : <article className="item"><strong>Sem dados</strong><span>{empty}</span></article>}</div>; }
function MiniResult({ data }: { data: Json | null }) { if (!data) return null; return <pre className="result-box">{JSON.stringify(data, null, 2).slice(0, 1800)}</pre>; }
function Metric({ label, value }: { label: string; value: any }) { return <div className="metric"><span>{label}</span><strong>{numberText(value)}</strong></div>; }
function Chart({ weekly, history }: { weekly: Json[]; history: Json[] }) { const source: Json[] = weekly.length ? weekly : history.slice(0, 8).map((item, index) => ({ week: `#${index + 1}`, completed: item.status === "concluido" ? 1 : 0 })); const max = Math.max(1, ...source.map((item) => Number(item.completed || item.executions || 0))); return <div className="chart">{source.length ? source.map((item) => { const value = Number(item.completed || item.executions || 0); return <div className="bar" key={safe(item.week || item.id)} style={{ height: `${Math.max(10, (value / max) * 100)}%` }}><span>{value}</span><small>{safe(item.week || "exec")}</small></div>; }) : <div className="empty-chart">Histórico aparece após execuções concluídas.</div>}</div>; }
function MetricTable({ data }: { data: Json }) { const student = data.student || {}; const history = data.history || []; return <><div className="metric-grid"><Metric label="Execuções" value={student.total_executions} /><Metric label="Frequência" value={student.weekly_frequency} /><Metric label="Esforço" value={student.average_effort} /><Metric label="Progresso" value={student.progress_percent} /></div><div className="table"><div><strong>Treino</strong><strong>Status</strong><strong>Duração</strong></div>{history.length ? history.map((item: Json) => <div key={item.id}><span>{safe(item.nome_treino || item.workout_id)}</span><span>{safe(item.status)}</span><span>{safe(item.duracao_minutos)} min</span></div>) : <div><span>Sem histórico</span><span>—</span><span>—</span></div>}</div></>; }
