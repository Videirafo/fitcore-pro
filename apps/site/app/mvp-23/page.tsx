import Link from "next/link";
import { FitCoreShell } from "../../components/FitCoreShell";

export default function Mvp23Page() {
  return (
    <FitCoreShell>
      <section className="hero">
        <div>
          <p className="kicker">MVP-23 · Next-ready</p>
          <h1>Cadastro operacional de aluno real.</h1>
          <p>O aluno vira entidade completa do tenant, com vínculo de professor, usuário aluno, objetivo, frequência, status e auditoria LGPD mínima.</p>
          <div className="actions">
            <Link className="button" href="/mvp-23.html">Abrir tela operacional</Link>
            <Link className="button secondary" href="/mvp-22.html">Gerenciar equipe</Link>
          </div>
        </div>
        <aside className="card"><strong>APIs</strong><span>/api/mvp-23/students · /api/mvp-23/students/:id · /api/mvp-23/students/:id/status</span></aside>
      </section>
      <section className="grid">
        <article className="panel"><h2>Tenant-scoped</h2><p>Listagem, criação e status usam o tenant_id da sessão assinada.</p></article>
        <article className="panel"><h2>Front conectado</h2><p>A página estática tem CSS/JS próprios e esta página Next fica pronta para o switch gradual.</p></article>
      </section>
    </FitCoreShell>
  );
}
