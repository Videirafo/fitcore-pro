"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Session = { actor_role?: string; actor_name?: string; tenant_slug?: string } | null;
async function loadSession(): Promise<Session> {
  try { const res = await fetch(`/api/mvp-15/session?v=${Date.now()}`, { cache: "no-store", credentials: "include" }); const data = await res.json(); return data?.current_session || null; }
  catch { return null; }
}

export function FitCoreHeaderActionsClient() {
  const [session, setSession] = useState<Session>(null);
  useEffect(() => { loadSession().then(setSession); }, []);
  const role = String(session?.actor_role || "visitante").toLowerCase();
  if (role === "visitante") return <div className="header-actions"><Link href="/login">Entrar</Link><Link className="primary-pill topbar-cta" href="/onboarding">Criar negócio</Link></div>;
  if (role === "aluno") return <div className="header-actions"><Link href="/coach">Meu Coach</Link><Link href="/evolucao">Evolução</Link><Link className="primary-pill topbar-cta" href="/execucao">Treino do dia</Link></div>;
  if (role === "professor") return <div className="header-actions"><Link href="/coach">Coach</Link><Link href="/agents">IA</Link><Link className="primary-pill topbar-cta" href="/treinos">Treinos</Link></div>;
  return <div className="header-actions"><Link href="/coach">Coach</Link><Link href="/agents">IA & Agents</Link><Link href="/setup">Setup</Link><Link className="primary-pill topbar-cta" href="/relatorios">Dashboard</Link></div>;
}
