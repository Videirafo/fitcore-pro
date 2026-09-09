"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Session = { actor_role?: string; tenant_slug?: string; actor_name?: string } | null;
type NavItem = { href: string; label: string; roles: string[]; hint: string; group: string; icon: string };

const nav: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Visão geral", group: "principal", icon: "⌂" },
  { href: "/agenda", label: "Agenda", roles: ["gestor", "professor", "aluno"], hint: "Rotina", group: "principal", icon: "◴" },
  { href: "/setup", label: "Onboarding", roles: ["gestor"], hint: "Checklist", group: "gestão", icon: "✓" },
  { href: "/equipe", label: "Equipe", roles: ["gestor"], hint: "Usuários", group: "gestão", icon: "👥" },
  { href: "/alunos", label: "Alunos", roles: ["gestor", "professor"], hint: "Cadastro", group: "gestão", icon: "◎" },
  { href: "/treinos", label: "Treinos", roles: ["gestor", "professor", "aluno"], hint: "Prescrição", group: "treinos", icon: "▣" },
  { href: "/biblioteca", label: "Biblioteca", roles: ["gestor", "professor", "aluno"], hint: "GIFs", group: "treinos", icon: "▤" },
  { href: "/execucao", label: "Execução", roles: ["gestor", "professor", "aluno"], hint: "Treino", group: "treinos", icon: "▶" },
  { href: "/evolucao", label: "Evolução", roles: ["gestor", "professor", "aluno"], hint: "Progresso", group: "treinos", icon: "▥" },
  { href: "/agents", label: "IA & Agents", roles: ["gestor", "professor", "aluno"], hint: "Assistente", group: "inteligência", icon: "✦" },
  { href: "/coach", label: "Coach", roles: ["gestor", "professor", "aluno"], hint: "Evidências", group: "inteligência", icon: "◉" },
  { href: "/relatorios", label: "Relatórios", roles: ["gestor", "professor"], hint: "Dados", group: "inteligência", icon: "▧" },
  { href: "/financeiro", label: "Financeiro", roles: ["gestor"], hint: "Receita", group: "plataforma", icon: "◇" },
  { href: "/seguranca", label: "Segurança & LGPD", roles: ["gestor", "professor", "aluno"], hint: "Proteção", group: "plataforma", icon: "◈" },
  { href: "/auditoria", label: "Auditoria", roles: ["gestor"], hint: "Eventos", group: "plataforma", icon: "≣" },
  { href: "/configuracoes", label: "Configurações", roles: ["gestor", "professor", "aluno"], hint: "Conta", group: "plataforma", icon: "⚙" },
  { href: "/onboarding", label: "Criar negócio", roles: ["visitante"], hint: "Nova unidade", group: "principal", icon: "+" },
  { href: "/login", label: "Login", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Acesso", group: "principal", icon: "↪" },
];

async function loadSession(): Promise<Session> {
  try { const res = await fetch(`/api/mvp-15/session?v=${Date.now()}`, { cache: "no-store", credentials: "include" }); const data = await res.json(); return data?.current_session || null; }
  catch { return null; }
}
async function logout() { await fetch("/api/mvp-15/session/logout", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }); }

export function FitCoreNavClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);
  useEffect(() => { loadSession().then(setSession); }, [pathname]);
  const role = String(session?.actor_role || "visitante").toLowerCase();
  const visible = useMemo(() => nav.filter((item) => item.roles.includes(role)), [role]);
  const groups = useMemo(() => Array.from(new Set(visible.map((item) => item.group))), [visible]);
  async function leave() { await logout(); setSession(null); router.push("/login"); router.refresh(); }
  return <>
    <nav className="side-nav premium-side-nav" aria-label="Navegação principal">
      {groups.map((group) => <div className="nav-group" key={group}><span>{group}</span>{visible.filter((item) => item.group === group).map((item) => { const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)); return <Link key={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} href={item.href}><i>{item.icon}</i><span>{item.label}</span><small>{item.hint}</small></Link>; })}</div>)}
    </nav>
    <div className="sidebar-user"><span>{role === "visitante" ? "Acesso" : "Sessão"}</span><strong>{role === "visitante" ? "Visitante" : session?.actor_name || role}</strong><small>{role === "visitante" ? "Entre ou crie uma unidade" : `${role} · ${session?.tenant_slug || "unidade"}`}</small>{role !== "visitante" ? <button type="button" onClick={leave}>Sair da sessão</button> : null}</div>
  </>;
}
