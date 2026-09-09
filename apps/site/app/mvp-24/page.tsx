import Link from "next/link";
import { FitCoreShell } from "../../components/FitCoreShell";

export default function Mvp24Page() {
  return (
    <FitCoreShell>
      <section className="hero">
        <div>
          <p className="kicker">MVP-24 · Next-ready</p>
          <h1>Prescrição real de treino vinculada ao aluno.</h1>
          <p>O treino nasce do aluno real, passa por revisão do professor, fica isolado por tenant e aparece para o aluno apenas quando pertence a ele.</p>
          <div className="actions">
            <Link className="button" href="/mvp-24.html">Abrir tela operacional</Link>
            <Link className="button secondary" href="/mvp-23.html">Cadastrar alunos</Link>
          </div>
        </div>
        <aside className="card"><strong>APIs</strong><span>/api/mvp-24/prescriptions · /api/mvp-24/my-workouts · /api/mvp-24/prescriptions/:id/review</span></aside>
      </section>
      <section className="grid">
        <article className="panel"><h2>Fluxo</h2><p>Aluno real → treino prescrito → revisão do professor → aprovação → visão do aluno.</p></article>
        <article className="panel"><h2>Segurança</h2><p>Tenant, papel, sessão assinada, RBAC e auditoria permanecem obrigatórios.</p></article>
      </section>
    </FitCoreShell>
  );
}
