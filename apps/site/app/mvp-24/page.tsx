import Link from "next/link";
import { FitCoreShell } from "../../components/FitCoreShell";
import { Progress } from "../../components/ui/Progress";

const stages = [
  { label: "Aluno vinculado", done: true },
  { label: "Treino prescrito", done: true },
  { label: "Revisão do professor", done: true },
  { label: "Disponível ao aluno", done: false },
];

export default function Mvp24Page() {
  const completed = stages.filter((stage) => stage.done).length;
  const readiness = Math.round((completed / stages.length) * 100);

  return (
    <FitCoreShell>
      <section className="hero">
        <div>
          <p className="kicker">MVP-24 · treino conectado ao aluno</p>
          <h1>Prescrição real de treino vinculada ao aluno.</h1>
          <p>O treino nasce do aluno real, passa por revisão do professor, fica isolado por tenant e aparece para o aluno apenas quando pertence a ele.</p>
          <div className="actions">
            <Link className="button" href="/mvp-24.html">Abrir tela operacional</Link>
            <Link className="button secondary" href="/mvp-23.html">Cadastrar alunos</Link>
          </div>
        </div>

        <aside className="card">
          <p className="m-0 text-xs font-black uppercase tracking-[.16em] text-fitcore-lime">Prontidão do fluxo</p>
          <p className="mt-2 text-3xl font-black text-white">{completed}/{stages.length} etapas</p>
          <Progress className="mt-5" value={readiness} showValue size="lg" label="Treino pronto para o aluno" />
          <div className="mt-5 grid gap-2">
            {stages.map((stage) => (
              <div key={stage.label} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.045] px-3 py-2">
                <span className="text-sm font-bold text-white/75">{stage.label}</span>
                <span className={stage.done ? "text-fitcore-green" : "text-white/35"} aria-label={stage.done ? "Concluído" : "Pendente"}>
                  {stage.done ? "●" : "○"}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid">
        <article className="panel">
          <p className="m-0 text-xs font-black uppercase tracking-[.14em] text-fitcore-lime">Fluxo</p>
          <h2 className="mt-3">Da prescrição à execução</h2>
          <p>Aluno real → treino prescrito → revisão do professor → aprovação → visão do aluno.</p>
        </article>
        <article className="panel">
          <p className="m-0 text-xs font-black uppercase tracking-[.14em] text-fitcore-lime">Proteção</p>
          <h2 className="mt-3">Acesso no contexto certo</h2>
          <p>Tenant, papel, sessão assinada, RBAC e auditoria permanecem obrigatórios.</p>
        </article>
      </section>
    </FitCoreShell>
  );
}
