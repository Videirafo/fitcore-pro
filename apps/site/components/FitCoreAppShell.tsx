import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  ["/", "Visão geral"],
  ["/onboarding", "Criar negócio"],
  ["/login", "Login"],
  ["/equipe", "Equipe"],
  ["/alunos", "Alunos"],
  ["/treinos", "Treinos"],
  ["/execucao", "Execução"],
  ["/evolucao", "Evolução"],
];

type FitCoreAppShellProps = {
  children: ReactNode;
  section?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function FitCoreAppShell({ children, section = "Operação", eyebrow, title, description }: FitCoreAppShellProps) {
  const headerTitle = title || section;
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegação do FitCore">
        <Link className="brand" href="/">
          <span className="brand-mark">FC</span>
          <span><strong>FitCore Pro</strong><small>Gestão fitness</small></span>
        </Link>
        <nav className="side-nav">
          {nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="side-card"><strong>Fluxo principal</strong><span>negócio → equipe → alunos → treinos → execução → evolução</span></div>
      </aside>
      <div className="workspace">
        <header className="workspace-topbar app-header">
          <div><small>FitCore Pro</small><strong>{section}</strong></div>
          <div className="header-actions"><Link href="/login">Entrar</Link><Link className="primary-pill topbar-cta" href="/onboarding">Começar</Link></div>
        </header>
        <main className="workspace-main">
          {title ? <section className="page-hero"><p className="eyebrow">{eyebrow || section}</p><h1>{headerTitle}</h1>{description ? <p>{description}</p> : null}</section> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
