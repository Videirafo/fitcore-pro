"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Session = { actor_role?: string; tenant_slug?: string; actor_name?: string } | null;
type NavItem = { href: string; label: string; roles: string[]; hint: string; icon: string; group: "gestao" | "treinos" | "plataforma" };

const nav: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Visão geral", icon: "⌂", group: "gestao" },
  { href: "/agents", label: "IA & Agents", roles: ["gestor", "professor"], hint: "Assistente", icon: "✦", group: "gestao" },
  { href: "/onboarding", label: "Onboarding", roles: ["visitante"], hint: "Criar negócio", icon: "+", group: "gestao" },
  { href: "/setup", label: "Setup", roles: ["gestor"], hint: "Checklist", icon: "✓", group: "gestao" },
  { href: "/equipe", label: "Equipe", roles: ["gestor"], hint: "Permissões", icon: "◇", group: "gestao" },
  { href: "/alunos", label: "Alunos", roles: ["gestor", "professor"], hint: "Cadastro", icon: "●", group: "gestao" },
  { href: "/biblioteca", label: "Biblioteca", roles: ["gestor", "professor", "aluno"], hint: "GIFs", icon: "▣", group: "treinos" },
  { href: "/treinos", label: "Treinos", roles: ["gestor", "professor", "aluno"], hint: "Prescrição", icon: "▤", group: "treinos" },
  { href: "/execucao", label: "Execução", roles: ["gestor", "professor", "aluno"], hint: "Treino do dia", icon: "▶", group: "treinos" },
  { href: "/evolucao", label: "Evolução", roles: ["gestor", "professor", "aluno"], hint: "Progresso", icon: "▥", group: "treinos" },
  { href: "/agenda", label: "Agenda", roles: ["gestor", "professor"], hint: "Aulas", icon: "□", group: "plataforma" },
  { href: "/relatorios", label: "Relatórios", roles: ["gestor", "professor"], hint: "Indicadores", icon: "▧", group: "plataforma" },
  { href: "/financeiro", label: "Financeiro", roles: ["gestor"], hint: "Receita", icon: "$", group: "plataforma" },
  { href: "/seguranca", label: "Segurança & LGPD", roles: ["gestor", "professor", "aluno"], hint: "Proteção", icon: "◈", group: "plataforma" },
  { href: "/auditoria", label: "Auditoria", roles: ["gestor"], hint: "Eventos", icon: "◎", group: "plataforma" },
  { href: "/configuracoes", label: "Configurações", roles: ["gestor"], hint: "Sistema", icon: "⚙", group: "plataforma" },
  { href: "/login", label: "Login", roles: ["visitante"], hint: "Acesso", icon: "↳", group: "plataforma" },
];

async function loadSession(): Promise<Session> {
  try {
    const res = await fetch(`/api/mvp-15/session?v=${Date.now()}`, { cache: "no-store", credentials: "include" });
    const data = await res.json();
    return data?.current_session || null;
  } catch { return null; }
}

export function FitCoreNavClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);
  useEffect(() => { loadSession().then(setSession); }, [pathname]);
  const role = String(session?.actor_role || "visitante").toLowerCase();
  const visible = useMemo(() => nav.filter((item) => item.roles.includes(role)), [role]);
  const grouped = {
    gestao: visible.filter((item) => item.group === "gestao"),
    treinos: visible.filter((item) => item.group === "treinos"),
    plataforma: visible.filter((item) => item.group === "plataforma"),
  };
  async function logout() {
    await fetch("/api/mvp-15/session/logout", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    setSession(null);
    router.push("/login");
  }
  const render = (title: string, items: NavItem[]) => items.length ? <div className="nav-group"><span>{title}</span>{items.map((item) => { const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)); return <Link key={item.href} className={active ? "active" : ""} href={item.href} aria-current={active ? "page" : undefined}><b>{item.icon}</b><span>{item.label}</span><small>{item.hint}</small></Link>; })}</div> : null;
  return <>
    <nav className="side-nav" aria-label="Navegação principal">
      {render("Gestão", grouped.gestao)}
      {render("Treinos", grouped.treinos)}
      {render("Plataforma", grouped.plataforma)}
    </nav>
    <div className="sidebar-user"><span>{role === "visitante" ? "Acesso" : "Sessão ativa"}</span><strong>{role === "visitante" ? "Visitante" : session?.actor_name || role}</strong><small>{role === "visitante" ? "Entre ou crie uma unidade" : `${role} · ${session?.tenant_slug || "unidade"}`}</small>{role !== "visitante" ? <button type="button" className="logout-button" onClick={logout}>Sair com segurança</button> : null}</div>
  </>;
}
