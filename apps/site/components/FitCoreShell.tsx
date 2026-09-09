import Link from "next/link";

const links = [
  ["/", "Início"],
  ["/mvp-21", "Criar negócio"],
  ["/mvp-22", "Equipe"],
  ["/mvp-23", "Alunos"],
  ["/mvp-24", "Prescrição"],
  ["/mvp-25", "Execução"],
  ["/mvp-19.html", "Login"],
  ["/mvp-13.html", "Operação"],
];

export function FitCoreShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark">F</span><strong>FitCore Pro</strong></Link>
        <nav className="nav" aria-label="Navegação principal">
          {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
