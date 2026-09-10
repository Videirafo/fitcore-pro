"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type JsonMap = Record<string, any>;

type ApiState = { loading: boolean; error: string; data: any };

async function api<T = JsonMap>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.mensagem || data.erro || `HTTP ${response.status}`);
  return data as T;
}

function value(form: HTMLFormElement, key: string) {
  const data = new FormData(form);
  const raw = data.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function formJson(form: HTMLFormElement) {
  const payload: JsonMap = {};
  new FormData(form).forEach((raw, key) => {
    const text = typeof raw === "string" ? raw.trim() : String(raw);
    if (!text) return;
    payload[key] = /^\d+$/.test(text) ? Number(text) : text;
  });
  return payload;
}

function JsonBlock({ data }: { data: any }) {
  if (!data) return null;
  return <pre className="json-block">{JSON.stringify(data, null, 2)}</pre>;
}

function SessionCard() {
  const [state, setState] = useState<ApiState>({ loading: true, error: "", data: null });
  useEffect(() => {
    api(`/api/mvp-15/session?v=${Date.now()}`)
      .then((data) => setState({ loading: false, error: "", data }))
      .catch((error: Error) => setState({ loading: false, error: error.message, data: null }));
  }, []);
  const session = state.data?.current_session;
  return (
    <article className="panel session-panel">
      <span className="label">Sessão</span>
      {state.loading ? <strong>Verificando acesso</strong> : session ? <><strong>{session.actor_name || "Usuário"}</strong><p>{session.actor_role} · {session.tenant_slug}</p></> : <><strong>Entrada necessária</strong><p>{state.error || "Entre com senha ou crie uma operação."}</p><Link className="button secondary" href="/login">Entrar</Link></>}
    </article>
  );
}

export function HomeDashboard() {
  return (
    <div className="landing-grid">
      <section className="hero-card">
        <span className="eyebrow">Sistema fitness profissional</span>
        <h1>Gestão fitness com rotas reais, dados reais e operação conectada.</h1>
        <p>Crie a unidade, configure equipe, cadastre alunos, prescreva treinos, registre execuções e acompanhe evolução em um shell único.</p>
        <div className="actions"><Link className="button" href="/onboarding">Criar negócio</Link><Link className="button secondary" href="/login">Entrar no painel</Link></div>
      </section>
      <SessionCard />
      <section className="kpi-row">
        {[["Equipe", "papéis e convites"], ["Alunos", "cadastro operacional"], ["Treinos", "prescrição revisada"], ["Evolução", "histórico e progresso"]].map(([title, text]) => <article className="kpi-card" key={title}><strong>{title}</strong><span>{text}</span></article>)}
      </section>
    </div>
  );
}

export function LoginPanel() {
  const [out, setOut] = useState<any>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try { setOut(await api("/api/mvp-19/login", { method: "POST", body: JSON.stringify(formJson(form)) })); }
    catch (error: any) { setOut({ ok: false, erro: error.message }); }
  };
  const logout = async () => { try { setOut(await api("/api/mvp-15/session/logout", { method: "POST", body: "{}" })); } catch (error: any) { setOut({ ok: false, erro: error.message }); } };
  return <div className="two-col"><form className="panel" onSubmit={submit}><span className="label">Acesso</span><h2>Entrar com senha ou código</h2><label>E-mail ou identificador<input name="identifier" required placeholder="seu@email.com" autoComplete="username" /></label><label>Senha/código<input name="secret" required type="password" autoComplete="current-password" /></label><label>Unidade (opcional)<input name="tenant_slug" placeholder="ex: demo" autoComplete="off" /></label><button type="submit">Entrar</button><button className="secondary" type="button" onClick={logout}>Sair</button></form><SessionCard /><JsonBlock data={out} /></div>;
}

export function OnboardingPanel() {
  const [out, setOut] = useState<any>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = formJson(event.currentTarget);
    try { setOut(await api("/api/mvp-21/onboarding", { method: "POST", body: JSON.stringify(payload) })); }
    catch (error: any) { setOut({ ok: false, erro: error.message }); }
  };
  return <div className="two-col"><form className="panel" onSubmit={submit}><span className="label">Novo negócio</span><h2>Criar unidade</h2><label>Nome do negócio<input name="business_name" required defaultValue="Academia FitCore" /></label><label>Tipo<select name="business_type"><option value="academia">Academia</option><option value="estudio">Estúdio</option><option value="box">Box</option><option value="personal">Personal trainer</option></select></label><label>Slug<input name="slug" placeholder="academia-centro" /></label><label>Gestor<input name="owner_name" required defaultValue="Gestor Proprietário" /></label><label>Login<input name="login_identifier" required defaultValue="gestor.fitcore" /></label><label>Senha/código<input name="secret" required type="password" defaultValue="FitCore#2026" /></label><label>Primeiro professor<input name="professor_nome" defaultValue="Professor Inicial" /></label><label>Primeiro aluno<input name="aluno_nome" defaultValue="Aluno Inicial" /></label><button type="submit">Criar operação</button></form><JsonBlock data={out} /></div>;
}

export function TeamPanel() {
  const [users, setUsers] = useState<any>(null);
  const [out, setOut] = useState<any>(null);
  const load = async () => { try { setUsers(await api(`/api/mvp-22/users?v=${Date.now()}`)); } catch (error: any) { setUsers({ ok: false, erro: error.message }); } };
  useEffect(() => { load(); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); try { setOut(await api("/api/mvp-22/users", { method: "POST", body: JSON.stringify(formJson(event.currentTarget)) })); await load(); } catch (error: any) { setOut({ ok: false, erro: error.message }); } };
  const invite = async () => { try { setOut(await api("/api/mvp-22/users/invite", { method: "POST", body: JSON.stringify({ nome: "Aluno convidado", papel: "aluno", login_identifier: `aluno.${Date.now()}` }) })); await load(); } catch (error: any) { setOut({ ok: false, erro: error.message }); } };
  return <div className="two-col"><form className="panel" onSubmit={create}><span className="label">Equipe</span><h2>Criar usuário</h2><label>Nome<input name="nome" required defaultValue="Professor Equipe" /></label><label>Papel<select name="papel"><option value="professor">Professor</option><option value="aluno">Aluno</option></select></label><label>Identificador<input name="login_identifier" required defaultValue={`usuario.${Date.now()}`} /></label><label>Senha/código<input name="secret" required type="password" defaultValue="FitCore#Equipe27" /></label><button type="submit">Criar usuário</button><button className="secondary" type="button" onClick={invite}>Gerar convite de aluno</button></form><DataList title="Usuários da unidade" data={users?.users || users?.data || []} /><JsonBlock data={out || users} /></div>;
}

function DataList({ title, data }: { title: string; data: any[] }) {
  return <section className="panel"><span className="label">Dados</span><h2>{title}</h2><div className="list">{Array.isArray(data) && data.length ? data.slice(0, 8).map((row, i) => <article className="list-row" key={row.id || i}><strong>{row.nome || row.nome_publico || row.nome_treino || row.student_name || row.actor_name || `Registro ${i + 1}`}</strong><span>{row.papel || row.status || row.objetivo || row.tenant_slug || "ativo"}</span></article>) : <p>Nenhum registro carregado ou acesso pendente.</p>}</div></section>;
}

export function StudentsPanel() {
  const [data, setData] = useState<any>(null); const [out, setOut] = useState<any>(null);
  const load = async () => { try { setData(await api(`/api/mvp-23/students?limit=20&v=${Date.now()}`)); } catch (error: any) { setData({ ok: false, erro: error.message }); } };
  useEffect(() => { load(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); try { setOut(await api("/api/mvp-23/students", { method: "POST", body: JSON.stringify(formJson(event.currentTarget)) })); await load(); } catch (error: any) { setOut({ ok: false, erro: error.message }); } };
  return <div className="two-col"><form className="panel" onSubmit={submit}><span className="label">Aluno</span><h2>Cadastrar aluno real</h2><label>Nome<input name="nome_publico" required defaultValue="Aluno Operacional" /></label><label>Objetivo<input name="objetivo" defaultValue="força e evolução" /></label><label>Nível<select name="nivel"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label><label>Frequência semanal<input name="frequencia_semana" type="number" min="1" max="7" defaultValue="3" /></label><button type="submit">Cadastrar aluno</button></form><DataList title="Alunos" data={data?.students || []} /><JsonBlock data={out || data} /></div>;
}

export function PrescriptionsPanel() {
  const [students, setStudents] = useState<any[]>([]); const [data, setData] = useState<any>(null); const [out, setOut] = useState<any>(null);
  const load = async () => { try { const s = await api<any>("/api/mvp-23/students?limit=50&status=ativo"); setStudents(s.students || []); setData(await api(`/api/mvp-24/prescriptions?limit=20&v=${Date.now()}`)); } catch (error: any) { setData({ ok: false, erro: error.message }); } };
  useEffect(() => { load(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload=formJson(event.currentTarget); try { setOut(await api("/api/mvp-24/prescriptions", { method:"POST", body: JSON.stringify(payload) })); await load(); } catch(error:any) { setOut({ ok:false, erro:error.message }); } };
  const firstStudent = students[0]?.id || "";
  return <div className="two-col"><form className="panel" onSubmit={submit}><span className="label">Treino</span><h2>Prescrever treino</h2><label>Aluno<select name="student_id" defaultValue={firstStudent}>{students.map((s:any)=><option key={s.id} value={s.id}>{s.nome_publico}</option>)}</select></label><label>Nome do treino<input name="nome_treino" required defaultValue="Treino base semanal" /></label><label>Objetivo<input name="objetivo" defaultValue="força e condicionamento" /></label><label>Dias por semana<input name="dias_semana" type="number" min="1" max="7" defaultValue="3" /></label><label>Exercícios<textarea name="exercicios" defaultValue={`Agachamento técnico\nRemada controlada\nPrancha`} /></label><button type="submit">Criar prescrição</button></form><DataList title="Prescrições" data={data?.prescriptions || []} /><JsonBlock data={out || data} /></div>;
}

export function ExecutionPanel() {
  const [workouts, setWorkouts] = useState<any>(null); const [execs, setExecs] = useState<any>(null); const [out, setOut] = useState<any>(null);
  const load = async () => { try { setWorkouts(await api("/api/mvp-24/my-workouts?status=aprovado&limit=20")); setExecs(await api("/api/mvp-25/my-executions?limit=20")); } catch (error:any) { setOut({ ok:false, erro:error.message }); } };
  useEffect(() => { load(); }, []);
  const start = async (id:string) => { try { setOut(await api("/api/mvp-25/executions/start", { method:"POST", body: JSON.stringify({ workout_id:id }) })); await load(); } catch(error:any) { setOut({ ok:false, erro:error.message }); } };
  return <div className="two-col"><section className="panel"><span className="label">Execução</span><h2>Treinos liberados</h2><div className="list">{(workouts?.workouts || []).slice(0,8).map((w:any)=><article className="list-row" key={w.id}><strong>{w.nome_treino}</strong><span>{w.status}</span><button type="button" onClick={()=>start(w.id)}>Iniciar</button></article>)}</div></section><DataList title="Minhas execuções" data={execs?.executions || []} /><JsonBlock data={out || execs || workouts} /></div>;
}

export function EvolutionPanel() {
  const [tenant, setTenant] = useState<any>(null); const [mine, setMine] = useState<any>(null); const [error, setError] = useState("");
  useEffect(() => { api("/api/mvp-26/evolution?limit=60").then(setTenant).catch((e:Error)=>setError(e.message)); api("/api/mvp-26/my-evolution?limit=60").then(setMine).catch(()=>{}); }, []);
  const weekly = tenant?.weekly || [];
  const max = Math.max(1, ...weekly.map((w:any)=>Number(w.completed || w.executions || 0)));
  return <div className="evolution-layout"><section className="kpi-row">{[["Alunos", tenant?.summary?.students], ["Execuções", tenant?.summary?.executions], ["Concluídos", tenant?.summary?.completed], ["Esforço médio", tenant?.summary?.average_effort]].map(([label, value])=><article className="kpi-card" key={String(label)}><strong>{value ?? "--"}</strong><span>{label}</span></article>)}</section><section className="panel"><span className="label">Frequência semanal</span><h2>Histórico de execução</h2>{error ? <p>{error}</p> : <div className="chart">{weekly.length ? weekly.map((w:any)=><div className="bar" key={w.week} style={{height:`${Math.max(8, (Number(w.completed || w.executions || 0) / max) * 100)}%`}}><span>{w.completed || w.executions || 0}</span><small>{w.week}</small></div>) : <p>Entre no sistema para carregar dados.</p>}</div>}</section><DataList title="Progresso dos alunos" data={tenant?.students || []} /><section className="panel"><span className="label">Minha evolução</span><h2>{mine?.student?.student_name || "Aluno"}</h2><JsonBlock data={mine?.student || mine} /></section></div>;
}
