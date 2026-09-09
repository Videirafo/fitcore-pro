import Link from "next/link";
import { FitCoreShell } from "../../components/FitCoreShell";

export default function Mvp26Page() {
  return (
    <FitCoreShell title="Histórico e evolução do aluno" eyebrow="MVP-26">
      <p>Histórico de execuções, esforço médio, frequência semanal, progresso por treino e painel do professor por tenant.</p>
      <Link className="fc-button" href="/mvp-26.html">Abrir evolução operacional</Link>
    </FitCoreShell>
  );
}
