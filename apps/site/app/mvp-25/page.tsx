import Link from "next/link";
import { FitCoreShell } from "../../components/FitCoreShell";

export default function Mvp25Page() {
  return (
    <FitCoreShell>
      <section className="hero">
        <div>
          <p className="kicker">MVP-25 · Next-ready</p>
          <h1>Execução real do treino pelo aluno.</h1>
          <p>O aluno inicia treino aprovado, marca exercícios feitos, registra esforço/duração e conclui. Gestor e professor acompanham por tenant.</p>
          <div className="actions">
            <Link className="button" href="/mvp-25.html">Abrir tela operacional</Link>
            <Link className="button secondary" href="/mvp-24.html">Prescrição</Link>
          </div>
        </div>
        <aside className="card"><strong>APIs</strong><span>/api/mvp-25/executions/start · /done · /finish</span></aside>
      </section>
    </FitCoreShell>
  );
}
