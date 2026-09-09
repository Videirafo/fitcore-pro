import Link from "next/link";
import { FitCoreShell } from "../../components/FitCoreShell";

export default function Mvp22Page() {
  return (
    <FitCoreShell>
      <section className="hero">
        <div>
          <p className="kicker">MVP-22 · Next-ready</p>
          <h1>Gestão real de usuários do tenant.</h1>
          <p>O gestor cria professor/aluno no próprio tenant, gera convite com tenant_slug, bloqueia acesso cruzado e mantém auditoria por tenant.</p>
          <div className="actions">
            <Link className="button" href="/mvp-22.html">Abrir tela operacional</Link>
            <Link className="button secondary" href="/mvp-19.html">Entrar</Link>
          </div>
        </div>
        <aside className="card"><strong>APIs</strong><span>/api/mvp-22/users · /api/mvp-22/users/invite · /api/mvp-22/invites/accept</span></aside>
      </section>
      <section className="grid">
        <article className="panel"><h2>Contrato de front</h2><p>CSS global, componente shell, API client e página Next versionados em apps/site.</p></article>
        <article className="panel"><h2>Deploy seguro</h2><p>A produção segue servindo a UI estática validada até o switch final para Next.</p></article>
      </section>
    </FitCoreShell>
  );
}
