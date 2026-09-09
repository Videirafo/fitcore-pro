"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Session = { actor_role?: string; tenant_slug?: string; actor_name?: string } | null;

type NavItem = { href: string; label: string; roles: string[]; hint: string };

const nav: NavItem[] = [
  { href: "/", label: "Visão geral", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Resumo" },
  { href: "/onboarding", label: "Criar negócio", roles: ["visitante"], hint: "Nova unidade" },
  { href: "/login", label: "Login", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Acesso" },
  { href: "/equipe", label: "Equipe", roles: ["gestor"], hint: "Usuários" },
  { href: "/alunos", label: "Alunos", roles: ["gestor", "professor"], hint: "Cadastro" },
  { href: "/treinos", label: "Treinos", roles: ["gestor", "professor", "aluno"], hint: "Prescrição" },
  { href: "/execucao", label: "Execução", roles: ["gestor", "professor", "aluno"], hint: "Treino" },
  { href: "/evolucao", label: "Evolução", roles: ["gestor", "professor", "aluno"], hint: "Progresso" },
];

async function loadSession(): Promise<Session> {
  try {
    const res = await fetch(`/api/mvp-15/session?v=${Date.now()}`, { cache: "no-store", credentials: "include" });
    const data = await res.json();
    return data?.current_session || null;
  } catch {
    return null;
  }
}

export function FitCoreNavClient() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session>(null);
  useEffect(() => { loadSession().then(setSession); }, [pathname]);
  const role = String(session?.actor_role || "visitante").toLowerCase();
  const visible = useMemo(() => nav.filter((item) => item.roles.includes(role)), [role]);
  return (
    <>
      <nav className="side-nav" aria-label="Navegação principal">
        {visible.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return <Link key={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} href={item.href}><span>{item.label}</span><small>{item.hint}</small></Link>;
        })}
      </nav>
      <div className="sidebar-user">
        <span>{role === "visitante" ? "Acesso" : "Sessão"}</span>
        <strong>{role === "visitante" ? "Visitante" : session?.actor_name || role}</strong>
        <small>{role === "visitante" ? "Entre ou crie uma unidade" : `${role} · ${session?.tenant_slug || "unidade"}`}</small>
      </div>
    </>
  );
}
