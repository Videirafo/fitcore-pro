"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Session = { actor_role?: string; actor_name?: string; tenant_slug?: string } | null;
async function loadSession(): Promise<Session> { try { const res = await fetch(`/api/mvp-15/session?v=${Date.now()}`, { cache: "no-store", credentials: "include" }); const data = await res.json(); return data?.current_session || null; } catch { return null; } }
async function logout() { await fetch("/api/mvp-15/session/logout", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }); }

export function FitCoreHeaderActionsClient() {
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);
  useEffect(() => { loadSession().then(setSession); }, []);
  const role = String(session?.actor_role || "visitante").toLowerCase();
  async function leave() { await logout(); setSession(null); router.push("/login"); router.refresh(); }
  if (role === "visitante") return <div className="header-actions"><Link href="/login">Entrar</Link><Link className="primary-pill topbar-cta" href="/onboarding">Criar negócio</Link></div>;
  if (role === "aluno") return <div className="header-actions"><Link href="/execucao">Treino do dia</Link><Link href="/agents">IA</Link><button type="button" onClick={leave}>Sair</button><Link className="primary-pill topbar-cta" href="/evolucao">Minha evolução</Link></div>;
  if (role === "professor") return <div className="header-actions"><Link href="/alunos">Alunos</Link><Link href="/agents">IA</Link><button type="button" onClick={leave}>Sair</button><Link className="primary-pill topbar-cta" href="/treinos">Treinos</Link></div>;
  return <div className="header-actions"><Link href="/setup">Setup</Link><Link href="/agents">IA & Agents</Link><button type="button" onClick={leave}>Sair</button><Link className="primary-pill topbar-cta" href="/evolucao">Dashboard</Link></div>;
}

// MVP-29 regression contract: Treinos pendentes
