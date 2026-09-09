"use client";

import { FormEvent, useEffect, useState } from "react";

type Json = Record<string, any>;
type Mode = "home" | "login" | "onboarding" | "team" | "students" | "training" | "execution" | "evolution";

const titles: Record<Mode, { eyebrow: string; title: string; text: string }> = {
  home: { eyebrow: "Sistema profissional", title: "Operação fitness completa em rotas limpas.", text: "Cadastre o negócio, organize equipe e alunos, prescreva treinos, acompanhe execução e evolução sem páginas soltas." },
  login: { eyebrow: "Acesso", title: "Entrar no painel", text: "Use o slug do negócio, identificador e senha ou código para abrir a sessão real." },
  onboarding: { eyebrow: "Novo negócio", title: "Criar academia, estúdio, box ou operação personal.", text: "O cadastro cria a unidade, gestor proprietário, primeiro professor, primeiro aluno e abre a sessão do gestor." },
  team: { eyebrow: "Equipe", title: "Gestão de usuários da unidade.", text: "Crie professores e alunos com acesso próprio, credencial e papel correto." },
  students: { eyebrow: "Alunos", title: "Cadastro operacional de aluno real.", text: "Registre nível, objetivo, frequência semanal e vínculo com professor responsável." },
  training: { eyebrow: "Treinos", title: "Prescrição vinculada ao aluno.", text: "Crie treinos para alunos reais e libere após revisão do professor ou gestor." },
  execution: { eyebrow: "Execução", title: "Registro real do treino pelo aluno.", text: "O aluno inicia treino aprovado, marca exercícios, esforço, duração e conclusão." },
  evolution: { eyebrow: "Evolução", title: "Histórico e progresso do aluno.", text: "Acompanhe histórico, esforço médio, frequência semanal e evolução por treino." },
};

async function api(path: string, options: RequestInit = {}): Promise<Json> {
  const res = await fetch(path, { cache: "no-store", credentials: "include", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.mensagem || data.erro || data.reason || `HTTP ${res.status}`);
  return data;
}

function safe(value: any): string { return value === undefined || value === null || value === "" ? "—" : String(value); }
function rows(form: HTMLFormElement): Record<string, string> { const out: Record<string, string> = {}; new FormData(form).forEach((value, key) => { if (typeof value === "string") out[key] = value.trim(); }); return out; }
function n(value: any): string { const num = Number(value || 0); return Number.isFinite(num) ? num.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0"; }

export function FitCoreRouteClient({ mode }: { mode: Mode }) {
  const copy = titles[mode];
  const [session, setSession] = useState<Json | null>(null);
  const [message, setMessage] = useState("Carregando sessão...");
  const [data, setData] = useState<Json>({});
  const [detail, setDetail] = useState<Json | null>(null);

  async function loadSession() {
    try {
      const result = await api(`/api/mvp-15/session?v=${Date.now()}`);
      setSession(result.current_session || null);
      setMessage(result.current_session ? `${result.current_session.actor_name} · ${result.current_session.actor_role}` : "Login necessário");
      return result.current_session || null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sessão indisponível");
      return null;
    }
  }

  async function refresh(target = mode) {
    await loadSession();
    try {
      if (target === "team") setData(await api(`/api/mvp-22/users?v=${Date.now()}`));
      if (target === "students") setData(await api(`/api/mvp-23/students?limit=80&v=${Date.now()}`));
      if (target === "training") setData(await api(`/api/mvp-24/prescriptions?limit=80&v=${Date.now()}`));
      if (target === "execution") setData(await api(`/api/mvp-25/executions?limit=80&v=${Date.now()}`));
      if (target === "evolution") setData(await api(`/api/mvp-26/evolution?limit=80&v=${Date.now()}`));
    } catch (error) {
      setData({ error: error instanceof Error ? error.message : "Não foi possível carregar" });
    }
  }

  useEffect(() => { refresh(); }, [mode]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const body = rows(event.currentTarget); const result = await api("/api/mvp-19/login", { method: "POST", body: JSON.stringify(body) }); setSession(result.session || null); setMessage("Login realizado"); await refresh(); }
  async function submitOnboarding(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const result = await api("/api/mvp-21/onboarding", { method: "POST", body: JSON.stringify(rows(event.currentTarget)) }); setData(result); setSession(result.session || null); setMessage("Negócio criado"); }
  async function submitUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const result = await api("/api/mvp-22/users", { method: "POST", body: JSON.stringify(rows(event.currentTarget)) }); setDetail(result); await refresh("team"); }
  async function submitStudent(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const result = await api("/api/mvp-23/students", { method: "POST", body: JSON.stringify(rows(event.currentTarget)) }); setDetail(result); await refresh("students"); }
  async function submitPrescription(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const body: Json = rows(event.currentTarget); body.exercicios = String(body.exercicios || "").split("\n").map((x) => x.trim()).filter(Boolean); const result = await api("/api/mvp-24/prescriptions", { method: "POST", body: JSON.stringify(body) }); setDetail(result); await refresh("training"); }
  async function reviewPrescription(id: string, status: string) { const result = await api(`/api/mvp-24/prescriptions/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ status, observacoes: status === "aprovado" ? "Aprovado no painel." : "Ajustes solicitados no painel." }) }); setDetail(result); await refresh("training"); }
  async function startExecution(id: string) { const result = await api("/api/mvp-25/executions/start", { method: "POST", body: JSON.stringify({ workout_id: id }) }); setDetail(result); await refresh("execution"); }
  async function finishExecution(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const body = rows(event.currentTarget); const id = body.execution_id; const result = await api(`/api/mvp-25/executions/${encodeURIComponent(id)}/finish`, { method: "POST", body: JSON.stringify(body) }); setDetail(result); await refresh("execution"); }

  return (
    <section className="route-page">
      <div className="route-hero">
        <div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.text}</p></div>
        <SessionCard session={session} message={message} />
      </div>
      {mode === "home" && <HomeGrid />}
      {mode === "login" && <LoginPanel onSubmit={submitLogin} />}
      {mode === "onboarding" && <OnboardingPanel onSubmit={submitOnboarding} data={data} />}
      {mode === "team" && <TeamPanel onSubmit={submitUser} data={data} detail={detail} refresh={() => refresh("team")} />}
      {mode === "students" && <StudentsPanel onSubmit={submitStudent} data={data} detail={detail} refresh={() => refresh("students")} />}
      {mode === "training" && <TrainingPanel onSubmit={submitPrescription} data={data} detail={detail} review={reviewPrescription} />}
      {mode === "execution" && <ExecutionPanel data={data} detail={detail} start={startExecution} finish={finishExecution} />}
      {mode === "evolution" && <EvolutionPanel data={data} detail={detail} loadStudent={async (id) => setDetail(await api(`/api/mvp-26/students/${encodeURIComponent(id)}/evolution?limit=80`))} />}
    </section>
  );
}

function SessionCard({ session, message }: { session: Json | null; message: string }) {
  return <aside className="session-card"><small>Sessão</small><strong>{safe(session?.tenant_slug || "Acesso")}</strong><span>{message}</span></aside>;
}
function HomeGrid() { return <div className="module-grid">{[["/onboarding","Criar negócio","Crie a operação e o gestor proprietário."],["/equipe","Equipe","Usuários, papéis e credenciais."],["/alunos","Alunos","Cadastro, vínculo e objetivos."],["/treinos","Treinos","Prescrição e revisão."],["/execucao","Execução","Treino do aluno em andamento."],["/evolucao","Evolução","Histórico, frequência e progresso."]].map(([href,title,text])=><a className="module-card" href={href} key={href}><strong>{title}</strong><span>{text}</span></a>)}</div>; }

function LoginPanel({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="split-grid"><form className="panel" onSubmit={onSubmit}><h2>Login</h2><label>Slug do negócio<input name="tenant_slug" placeholder="ex: academia-centro" /></label><label>Identificador<input name="login_identifier" required /></label><label>Senha ou código<input name="secret" type="password" required /></label><button>Entrar</button></form><article className="panel"><h2>Acesso seguro</h2><p>O papel e a unidade são resolvidos pela sessão assinada. As rotas operacionais respeitam o acesso do usuário logado.</p></article></div>;
}

function OnboardingPanel({ onSubmit, data }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; data: Json }) {
  return <div className="split-grid"><form className="panel" onSubmit={onSubmit}><h2>Criar operação</h2><label>Nome do negócio<input name="business_name" required defaultValue="Academia FitCore" /></label><label>Tipo<select name="business_type" defaultValue="academia"><option value="academia">Academia</option><option value="estudio">Estúdio</option><option value="box">Box</option><option value="personal">Personal trainer</option></select></label><label>Slug<input name="slug" placeholder="opcional" /></label><label>Gestor proprietário<input name="owner_name" required defaultValue="Gestor Proprietário" /></label><label>Identificador<input name="login_identifier" required defaultValue="gestor.fitcore" /></label><label>Senha/código<input name="secret" type="password" required defaultValue="FitCore#2026" /></label><label>Primeiro professor<input name="professor_nome" defaultValue="Professor Inicial" /></label><label>Primeiro aluno<input name="aluno_nome" defaultValue="Aluno Inicial" /></label><button>Criar e entrar</button></form><ResultPanel title="Resultado" data={data} /></div>;
}

function TeamPanel({ onSubmit, data, detail, refresh }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; data: Json; detail: Json | null; refresh: () => void }) {
  const users = data.users || data.items || [];
  return <div className="split-grid"><form className="panel" onSubmit={onSubmit}><h2>Novo usuário</h2><label>Nome<input name="nome" required defaultValue="Professor Equipe" /></label><label>Papel<select name="papel" defaultValue="professor"><option value="professor">Professor</option><option value="aluno">Aluno</option></select></label><label>Identificador<input name="login_identifier" required defaultValue="professor.equipe" /></label><label>Senha/código<input name="secret" type="password" required defaultValue="FitCore#Equipe27" /></label><button>Criar usuário</button></form><article className="panel"><HeaderAction title="Equipe" action="Atualizar" onClick={refresh} /><List items={users} pick={(u) => [u.nome, u.papel, u.login_identifier || u.status]} />{detail && <MiniResult data={detail} />}</article></div>;
}

function StudentsPanel({ onSubmit, data, detail, refresh }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; data: Json; detail: Json | null; refresh: () => void }) {
  const items = data.students || data.items || [];
  return <div className="split-grid"><form className="panel" onSubmit={onSubmit}><h2>Novo aluno</h2><label>Nome público<input name="nome_publico" required defaultValue="Aluno Operacional" /></label><label>Código interno<input name="codigo_publico" placeholder="opcional" /></label><label>Nível<select name="nivel" defaultValue="iniciante"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label><label>Objetivo<input name="objetivo" defaultValue="força e evolução" /></label><label>Modalidade<input name="modalidade_preferida" defaultValue="academia" /></label><label>Frequência semanal<input name="frequencia_semana" type="number" min="1" max="7" defaultValue="3" /></label><button>Cadastrar aluno</button></form><article className="panel"><HeaderAction title="Alunos" action="Atualizar" onClick={refresh} /><List items={items} pick={(s) => [s.nome_publico, s.nivel, s.objetivo || s.status]} />{detail && <MiniResult data={detail} />}</article></div>;
}

function TrainingPanel({ onSubmit, data, detail, review }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; data: Json; detail: Json | null; review: (id: string, status: string) => void }) {
  const items = data.prescriptions || data.items || [];
  return <div className="split-grid"><form className="panel" onSubmit={onSubmit}><h2>Prescrever treino</h2><label>ID do aluno<input name="student_id" required placeholder="cole o ID do aluno" /></label><label>Nome do treino<input name="nome_treino" required defaultValue="Treino base semanal" /></label><label>Objetivo<input name="objetivo" defaultValue="força e condicionamento" /></label><label>Modalidade<input name="modalidade" defaultValue="academia" /></label><label>Foco<input name="foco" defaultValue="corpo inteiro" /></label><label>Dias por semana<input name="dias_semana" type="number" min="1" max="7" defaultValue="3" /></label><label>Exercícios<textarea name="exercicios" defaultValue={"Agachamento técnico\nSupino guiado\nRemada controlada"} /></label><button>Criar prescrição</button></form><article className="panel"><h2>Treinos</h2><div className="item-list">{items.map((p: Json) => <div className="item" key={p.id}><strong>{safe(p.nome_treino || p.workout_name || p.id)}</strong><span>{safe(p.student_name || p.aluno_nome)} · {safe(p.status)}</span><div className="row-actions"><button type="button" onClick={() => review(String(p.id), "aprovado")}>Aprovar</button><button type="button" className="secondary" onClick={() => review(String(p.id), "ajustes_solicitados")}>Ajustes</button></div></div>)}</div>{detail && <MiniResult data={detail} />}</article></div>;
}

function ExecutionPanel({ data, detail, start, finish }: { data: Json; detail: Json | null; start: (id: string) => void; finish: (event: FormEvent<HTMLFormElement>) => void }) {
  const items = data.executions || data.items || [];
  return <div className="split-grid"><article className="panel"><h2>Execuções</h2><div className="item-list">{items.map((x: Json) => <div className="item" key={x.id}><strong>{safe(x.nome_treino || x.workout_id)}</strong><span>{safe(x.student_name)} · {safe(x.status)} · {safe(x.progresso_percentual)}%</span></div>)}</div><form className="inline-form" onSubmit={finish}><label>ID da execução<input name="execution_id" required /></label><label>Esforço<input name="percepcao_esforco" type="number" min="1" max="10" defaultValue="7" /></label><label>Duração<input name="duracao_minutos" type="number" min="1" max="480" defaultValue="45" /></label><button>Concluir</button></form></article><article className="panel"><h2>Iniciar treino</h2><p>Use o ID de um treino aprovado do aluno logado.</p><form className="inline-form" onSubmit={(e) => { e.preventDefault(); start(rows(e.currentTarget).workout_id); }}><label>ID do treino<input name="workout_id" required /></label><button>Iniciar</button></form>{detail && <MiniResult data={detail} />}</article></div>;
}

function EvolutionPanel({ data, detail, loadStudent }: { data: Json; detail: Json | null; loadStudent: (id: string) => void }) {
  const summary = data.summary || {};
  const students = data.students || [];
  const weekly = data.weekly || [];
  return <div className="dashboard-grid"><section className="panel wide"><div className="metric-grid"><Metric label="Alunos" value={summary.students} /><Metric label="Execuções" value={summary.executions} /><Metric label="Concluídos" value={summary.completed} /><Metric label="Esforço médio" value={summary.average_effort} /></div><Chart weekly={weekly} /></section><section className="panel"><h2>Progresso por aluno</h2><div className="item-list">{students.map((s: Json) => <button type="button" className="student-row" key={s.student_id} onClick={() => loadStudent(String(s.student_id))}><strong>{safe(s.student_name)}</strong><span>{safe(s.completed_executions)} treinos · esforço {safe(s.average_effort)} · {safe(s.progress_percent)}%</span></button>)}</div></section>{detail && <section className="panel wide"><h2>Detalhe do aluno</h2><MetricTable data={detail} /></section>}</div>;
}

function HeaderAction({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="panel-title"><h2>{title}</h2><button type="button" className="secondary" onClick={onClick}>{action}</button></div>; }
function List({ items, pick }: { items: Json[]; pick: (item: Json) => any[] }) { return <div className="item-list">{items.length ? items.map((item) => { const row = pick(item); return <div className="item" key={safe(item.id || row.join("-"))}><strong>{safe(row[0])}</strong><span>{safe(row[1])} · {safe(row[2])}</span></div>; }) : <div className="item"><strong>Nenhum registro carregado</strong><span>Entre no painel ou atualize a listagem.</span></div>}</div>; }
function ResultPanel({ title, data }: { title: string; data: Json }) { return <article className="panel"><h2>{title}</h2><MiniResult data={data} /></article>; }
function MiniResult({ data }: { data: Json }) { return <pre className="result-box">{JSON.stringify(data, null, 2).slice(0, 1600)}</pre>; }
function Metric({ label, value }: { label: string; value: any }) { return <div className="metric"><span>{label}</span><strong>{n(value)}</strong></div>; }
function Chart({ weekly }: { weekly: Json[] }) { const max = Math.max(1, ...weekly.map((w) => Number(w.completed || w.executions || 0))); return <div className="chart">{weekly.length ? weekly.map((w) => { const v = Number(w.completed || w.executions || 0); return <div className="bar" key={safe(w.week)} style={{ height: `${Math.max(10, (v / max) * 100)}%` }}><span>{v}</span></div>; }) : <div className="empty-chart">Sem histórico carregado</div>}</div>; }
function MetricTable({ data }: { data: Json }) { const student = data.student || {}; const history = data.history || []; return <><div className="metric-grid"><Metric label="Execuções" value={student.total_executions} /><Metric label="Frequência" value={student.weekly_frequency} /><Metric label="Esforço" value={student.average_effort} /><Metric label="Progresso" value={student.progress_percent} /></div><div className="table"><div><strong>Treino</strong><strong>Status</strong><strong>Duração</strong></div>{history.map((h: Json) => <div key={h.id}><span>{safe(h.nome_treino)}</span><span>{safe(h.status)}</span><span>{safe(h.duracao_minutos)} min</span></div>)}</div></>; }
