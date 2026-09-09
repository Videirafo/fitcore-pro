"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Session = { actor_role?: string; tenant_slug?: string; actor_name?: string } | null;
type NavGroup = "gestao" | "inteligencia" | "treinos" | "plataforma";
type NavItem = { href: string; label: string; roles: string[]; hint: string; group: NavGroup; icon: string };

const nav: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Visão geral", group: "gestao", icon: "⌂" },
  { href: "/setup", label: "Onboarding", roles: ["gestor"], hint: "Checklist", group: "gestao", icon: "✓" },
  { href: "/equipe", label: "Equipe", roles: ["gestor"], hint: "Usuários", group: "gestao", icon: "◇" },
  { href: "/alunos", label: "Alunos", roles: ["gestor", "professor"], hint: "Cadastro", group: "gestao", icon: "●" },
  { href: "/agents", label: "IA & Agents", roles: ["gestor", "professor", "aluno"], hint: "Assistente", group: "inteligencia", icon: "✦" },
  { href: "/coach", label: "Coach", roles: ["gestor", "professor", "aluno"], hint: "Evidências", group: "inteligencia", icon: "◉" },
  { href: "/relatorios", label: "Relatórios", roles: ["gestor", "professor"], hint: "Indicadores", group: "inteligencia", icon: "▧" },
  { href: "/biblioteca", label: "Biblioteca", roles: ["gestor", "professor", "aluno"], hint: "Exercícios", group: "treinos", icon: "▣" },
  { href: "/treinos", label: "Treinos", roles: ["gestor", "professor", "aluno"], hint: "Prescrição", group: "treinos", icon: "▤" },
  { href: "/execucao", label: "Execução", roles: ["gestor", "professor", "aluno"], hint: "Treino do dia", group: "treinos", icon: "▶" },
  { href: "/evolucao", label: "Evolução", roles: ["gestor", "professor", "aluno"], hint: "Progresso", group: "treinos", icon: "▥" },
  { href: "/agenda", label: "Agenda", roles: ["gestor", "professor"], hint: "Rotina", group: "plataforma", icon: "□" },
  { href: "/financeiro", label: "Financeiro", roles: ["gestor"], hint: "Receita", group: "plataforma", icon: "$" },
  { href: "/seguranca", label: "Segurança & LGPD", roles: ["gestor", "professor", "aluno"], hint: "Proteção", group: "plataforma", icon: "◈" },
  { href: "/auditoria", label: "Auditoria", roles: ["gestor"], hint: "Eventos", group: "plataforma", icon: "≣" },
  { href: "/configuracoes", label: "Configurações", roles: ["gestor", "professor", "aluno"], hint: "Conta", group: "plataforma", icon: "⚙" },
  { href: "/onboarding", label: "Criar negócio", roles: ["visitante"], hint: "Nova unidade", group: "gestao", icon: "+" },
  { href: "/login", label: "Entrar", roles: ["visitante"], hint: "Acesso", group: "plataforma", icon: "↳" },
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
  const groups = useMemo(() => ([
    ["gestao", "Gestão"], ["inteligencia", "Inteligência"], ["treinos", "Treinos"], ["plataforma", "Plataforma"],
  ] as const).map(([id, label]) => ({ id, label, items: visible.filter((item) => item.group === id) })).filter((group) => group.items.length), [visible]);
  async function logout() {
    await fetch("/api/mvp-15/session/logout", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    setSession(null); router.push("/login"); router.refresh();
  }
  return <>
    <nav className="side-nav premium-side-nav" aria-label="Navegação principal">
      {groups.map((group) => <div className="nav-group" key={group.id}><span>{group.label}</span>{group.items.map((item) => { const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)); return <Link key={item.href} className={active ? "active" : ""} href={item.href} aria-current={active ? "page" : undefined}><b>{item.icon}</b><span>{item.label}</span><small>{item.hint}</small></Link>; })}</div>)}
    </nav>
    <div className="sidebar-user"><span>{role === "visitante" ? "Acesso" : "Sessão ativa"}</span><strong>{role === "visitante" ? "Visitante" : session?.actor_name || role}</strong><small>{role === "visitante" ? "Entre ou crie uma unidade" : `${role} · ${session?.tenant_slug || "unidade"}`}</small>{role !== "visitante" ? <button type="button" className="logout-button" onClick={logout}>Sair com segurança</button> : null}</div>
  </>;
}
