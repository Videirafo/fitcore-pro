import Link from "next/link";
import { FitCoreShell } from "../components/FitCoreShell";

export default function HomePage() {
  return (
    <FitCoreShell>
      <section className="hero">
        <div>
          <p className="kicker">FitCore Pro · Next shell</p>
          <h1>Controle alunos, treinos, equipe e tenants em um só lugar.</h1>
          <p>Shell Next.js preparada para substituir gradualmente as telas estáticas sem quebrar a operação publicada.</p>
          <div className="actions">
            <Link className="button" href="/mvp-21">Criar negócio</Link>
            <Link className="button secondary" href="/mvp-22">Gerenciar equipe</Link>
          </div>
        </div>
        <aside className="card"><strong>Front conectado</strong><span>CSS global, componentes e API client em estrutura Next.</span></aside>
      </section>
    </FitCoreShell>
  );
}
