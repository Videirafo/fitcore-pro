import type { ReactNode } from "react";
import Link from "next/link";
import "./legal.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="fitcore-legal-shell">
      <article className="fitcore-legal">
        <Link href="/" aria-label="Voltar para o FitCore">← FitCore</Link>
        {children}
        <nav className="fitcore-legal-nav" aria-label="Documentos legais">
          <Link href="/legal/privacy">Privacidade</Link>
          <Link href="/legal/security">Segurança</Link>
          <Link href="/legal/terms">Termos</Link>
          <Link href="/legal/open-source">Open source</Link>
          <Link href="/legal/exclusao-conta">Exclusão de conta</Link>
        </nav>
      </article>
    </main>
  );
}
