type ProductShotKind = "business" | "team" | "students" | "workouts" | "execution" | "evolution";

type ProductShotProps = {
  kind: ProductShotKind;
  title?: string;
};

const exerciseGif = "/media/exercises/0026-barbell-bench-squat.gif";

function StatusDot({ label }: { label: string }) {
  return <span className="shot-status"><i />{label}</span>;
}

export function ProductShot({ kind, title }: ProductShotProps) {
  if (kind === "business") {
    return <div className="product-shot product-shot-business" aria-label={title || "Gestão do negócio fitness"}>
      <div className="shot-window-bar"><span /><span /><span /><b>Setup da unidade</b></div>
      <div className="shot-dashboard-grid">
        <article><small>Tipo</small><strong>Academia</strong></article>
        <article><small>Slug</small><strong>fit-center</strong></article>
        <article><small>Status</small><StatusDot label="ativo" /></article>
      </div>
      <div className="shot-checklist"><b>Checklist inicial</b><span>Professor criado</span><span>Aluno cadastrado</span><span>Treino liberado</span></div>
    </div>;
  }

  if (kind === "team") {
    return <div className="product-shot product-shot-team" aria-label={title || "Equipe e permissões"}>
      <div className="shot-window-bar"><span /><span /><span /><b>Permissões por papel</b></div>
      <div className="shot-table">
        <div><b>Gestor</b><span>operação completa</span><em>ativo</em></div>
        <div><b>Professor</b><span>alunos e treinos</span><em>ativo</em></div>
        <div><b>Aluno</b><span>portal e execução</span><em>ativo</em></div>
      </div>
    </div>;
  }

  if (kind === "students") {
    return <div className="product-shot product-shot-students" aria-label={title || "Perfil operacional do aluno"}>
      <div className="shot-window-bar"><span /><span /><span /><b>Perfil do aluno</b></div>
      <div className="shot-profile">
        <i>FV</i><div><strong>Fernando</strong><span>Hipertrofia · Intermediário</span></div>
      </div>
      <div className="shot-progress"><b style={{width:"78%"}} /><span>Frequência semanal 3/4</span></div>
      <div className="shot-tags"><span>Objetivo</span><span>Medidas</span><span>Anamnese</span></div>
    </div>;
  }

  if (kind === "workouts") {
    return <div className="product-shot product-shot-workouts" aria-label={title || "Prescrição de treino"}>
      <div className="shot-window-bar"><span /><span /><span /><b>Builder de treino</b></div>
      <div className="shot-workout-builder">
        <img src={exerciseGif} alt="GIF de exercício no builder de treino" />
        <div><strong>Agachamento</strong><span>4 × 10 · 60s</span><StatusDot label="em revisão" /></div>
      </div>
      <div className="shot-tags"><span>Carga</span><span>Séries</span><span>Descanso</span></div>
    </div>;
  }

  if (kind === "execution") {
    return <div className="product-shot product-shot-execution" aria-label={title || "Execução guiada do treino"}>
      <div className="shot-window-bar"><span /><span /><span /><b>Execução do aluno</b></div>
      <div className="shot-execution-grid">
        <img src="/media/exercises/0150-cable-bar-lateral-pulldown.gif" alt="GIF de puxada alta" />
        <div><strong>Puxada alta</strong><span>Costas · Bíceps</span><button type="button">Marcar feito</button></div>
      </div>
    </div>;
  }

  return <div className="product-shot product-shot-evolution" aria-label={title || "Evolução e métricas"}>
    <div className="shot-window-bar"><span /><span /><span /><b>Evolução do aluno</b></div>
    <div className="shot-chart"><i style={{height:"34%"}}/><i style={{height:"48%"}}/><i style={{height:"57%"}}/><i style={{height:"72%"}}/><i style={{height:"86%"}}/></div>
    <div className="shot-dashboard-grid three"><article><small>Esforço</small><strong>8/10</strong></article><article><small>Freq.</small><strong>3/4</strong></article><article><small>Exec.</small><strong>18</strong></article></div>
  </div>;
}
