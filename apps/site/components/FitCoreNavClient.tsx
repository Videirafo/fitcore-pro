"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  Gauge,
  Library,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Session = { actor_role?: string; tenant_slug?: string; actor_name?: string } | null;
type NavGroup = "principal" | "performance" | "negocio" | "sistema";
type NavItem = {
  href: string;
  label: string;
  roles: string[];
  hint: string;
  icon: LucideIcon;
  group: NavGroup;
};

const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["gestor", "professor", "aluno"], hint: "Hoje no FitCore", icon: Gauge, group: "principal" },
  { href: "/", label: "Início", roles: ["visitante"], hint: "Página inicial", icon: Gauge, group: "principal" },
  { href: "/execucao", label: "Treino de hoje", roles: ["gestor", "professor", "aluno"], hint: "Sessão em tempo real", icon: Activity, group: "principal" },
  { href: "/agents", label: "Assistente IA", roles: ["visitante", "gestor", "professor"], hint: "Coach e operação", icon: Bot, group: "principal" },
  { href: "/cadastro", label: "Criar negócio", roles: ["visitante"], hint: "Nova unidade", icon: UserPlus, group: "principal" },

  { href: "/atleta", label: "Athlete 360", roles: ["gestor", "professor", "aluno"], hint: "Perfil, metas e histórico", icon: Users, group: "performance" },
  { href: "/alunos", label: "Alunos", roles: ["gestor", "professor"], hint: "Cadastro operacional", icon: Users, group: "performance" },
  { href: "/treinos", label: "Treinos", roles: ["gestor", "professor", "aluno"], hint: "Prescrição e protocolos", icon: Dumbbell, group: "performance" },
  { href: "/evolucao", label: "Evolução", roles: ["gestor", "professor", "aluno"], hint: "Histórico e progresso", icon: BarChart3, group: "performance" },
  { href: "/biblioteca", label: "Biblioteca", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Demonstrações", icon: Library, group: "performance" },

  { href: "/agenda", label: "Agenda", roles: ["gestor", "professor"], hint: "Agenda e aulas", icon: CalendarDays, group: "negocio" },
  { href: "/financeiro", label: "Financeiro", roles: ["gestor"], hint: "Planos e receita", icon: WalletCards, group: "negocio" },
  { href: "/relatorios", label: "Analytics", roles: ["visitante", "gestor", "professor"], hint: "Indicadores reais", icon: BarChart3, group: "negocio" },
  { href: "/equipe", label: "Equipe", roles: ["gestor"], hint: "Coach e permissões", icon: Users, group: "negocio" },

  { href: "/setup", label: "Setup", roles: ["gestor"], hint: "Checklist da unidade", icon: ClipboardCheck, group: "sistema" },
  { href: "/auditoria", label: "Auditoria", roles: ["gestor"], hint: "Execution Kernel", icon: Activity, group: "sistema" },
  { href: "/seguranca", label: "Privacidade e LGPD", roles: ["visitante", "gestor", "professor", "aluno"], hint: "Dados e acesso", icon: ShieldCheck, group: "sistema" },
  { href: "/configuracoes", label: "Configurações", roles: ["gestor"], hint: "Ajustes", icon: Settings, group: "sistema" },
  { href: "/login", label: "Entrar", roles: ["visitante"], hint: "Conta", icon: LogIn, group: "sistema" },
];

const groupNames: Record<NavGroup, string> = {
  principal: "Principal",
  performance: "Performance",
  negocio: "Negócio",
  sistema: "Sistema",
};

async function loadSession(): Promise<Session> {
  try {
    const res = await fetch(`/api/mvp-15/session?v=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json();
    return data?.current_session || null;
  } catch {
    return null;
  }
}

export function FitCoreNavClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    loadSession().then(setSession);
  }, [pathname]);

  const role = String(session?.actor_role || "visitante").toLowerCase();
  const visible = useMemo(() => nav.filter((item) => item.roles.includes(role)), [role]);

  const grouped = useMemo(
    () =>
      (Object.keys(groupNames) as NavGroup[])
        .map((group) => ({ group, items: visible.filter((item) => item.group === group) }))
        .filter((entry) => entry.items.length),
    [visible],
  );

  async function logout() {
    await fetch("/api/mvp-15/session/logout", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    setSession(null);
    router.push("/login");
  }

  return (
    <>
      <nav className="side-nav fitcore-vnext-nav" aria-label="Navegação principal">
        {grouped.map(({ group, items }) => (
          <div className="nav-group" key={group}>
            <span>{groupNames[group]}</span>
            {items.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const NavIcon = item.icon;
              return (
                <Link
                  key={item.href}
                  className={active ? "active" : ""}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.hint}
                >
                  <b aria-hidden="true"><NavIcon size={18} strokeWidth={2.1} /></b>
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-user fitcore-vnext-user">
        <span>{role === "visitante" ? "FitCore" : "Sessão ativa"}</span>
        <strong>{role === "visitante" ? "Explore o produto" : session?.actor_name || role}</strong>
        <small>{role === "visitante" ? "Treino, coach e gestão em um só sistema" : `${role} · ${session?.tenant_slug || "unidade"}`}</small>
        {role !== "visitante" ? (
          <button type="button" className="logout-button" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        ) : null}
      </div>
    </>
  );
}
