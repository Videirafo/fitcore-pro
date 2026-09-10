import Link from "next/link";
import type { ReactNode } from "react";
import { FitCoreNavClient } from "./FitCoreNavClient";
import { FitCoreHeaderActionsClient } from "./FitCoreHeaderActionsClient";

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
        <FitCoreNavClient />
      </aside>
      <div className="workspace">
        <header className="workspace-topbar app-header">
          <div className="topbar-title"><Link className="shell-arrow" href="/dashboard" aria-label="Voltar para o dashboard">←</Link><div><small>FitCore Pro</small><strong>{section}</strong></div></div>
          <FitCoreHeaderActionsClient />
        </header>
        <main className="workspace-main">
          {title ? <section className="page-hero"><p className="eyebrow">{eyebrow || section}</p><h1>{headerTitle}</h1>{description ? <p>{description}</p> : null}</section> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
