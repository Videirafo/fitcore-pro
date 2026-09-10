type FitCoreVisualProps = { label?: string };

export function FitCoreBrandMark() {
  return <span className="fitcore-brand-mark" aria-hidden="true"><i>FC</i><b /></span>;
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="feature-visual" aria-label={label}>{children}</div>;
}

export function BusinessVisual(_: FitCoreVisualProps) {
  return <Frame label="Operação fitness">
    <svg viewBox="0 0 420 240" role="img"><defs><linearGradient id="v1" x1="0" x2="1"><stop stopColor="#4df36d"/><stop offset="1" stopColor="#9cff57"/></linearGradient></defs><rect x="30" y="38" width="360" height="170" rx="28"/><rect x="58" y="68" width="138" height="20" rx="10"/><rect x="58" y="102" width="112" height="12" rx="6"/><rect x="58" y="126" width="286" height="12" rx="6"/><rect x="58" y="150" width="250" height="12" rx="6"/><circle cx="300" cy="88" r="34"/><path d="M260 154c32-28 68-31 105-8"/><path d="M254 178c48-32 91-32 128 0"/><path className="accent" d="M308 58v60M278 88h60"/></svg>
    <strong>Unidade criada</strong><span>academia · estúdio · box · personal</span>
  </Frame>;
}

export function TeamVisual(_: FitCoreVisualProps) {
  return <Frame label="Equipe e permissões">
    <svg viewBox="0 0 420 240" role="img"><rect x="48" y="52" width="324" height="144" rx="30"/><circle cx="138" cy="100" r="30"/><circle cx="210" cy="92" r="38"/><circle cx="292" cy="102" r="28"/><path d="M84 168c18-35 51-45 88-23"/><path d="M148 172c25-48 82-51 122 0"/><path d="M250 168c19-34 52-38 86-16"/><path className="accent" d="M74 58h90M74 75h54M268 56h76"/></svg>
    <strong>Time por papel</strong><span>dono · professor · aluno</span>
  </Frame>;
}

export function StudentsVisual(_: FitCoreVisualProps) {
  return <Frame label="Alunos e acompanhamento">
    <svg viewBox="0 0 420 240" role="img"><rect x="42" y="34" width="336" height="180" rx="30"/><circle cx="115" cy="98" r="36"/><path d="M74 170c24-48 72-50 108 0"/><rect x="205" y="70" width="122" height="18" rx="9"/><rect x="205" y="105" width="86" height="12" rx="6"/><rect x="205" y="132" width="132" height="12" rx="6"/><path className="accent" d="M210 172h34l22-36 24 22 30-48 26 62"/></svg>
    <strong>Perfil do aluno</strong><span>objetivo · frequência · evolução</span>
  </Frame>;
}

export function WorkoutsVisual(_: FitCoreVisualProps) {
  return <Frame label="Prescrição de treino">
    <svg viewBox="0 0 420 240" role="img"><rect x="48" y="38" width="324" height="170" rx="28"/><path d="M90 120h240"/><rect x="76" y="97" width="28" height="46" rx="8"/><rect x="316" y="97" width="28" height="46" rx="8"/><rect x="112" y="78" width="26" height="84" rx="8"/><rect x="282" y="78" width="26" height="84" rx="8"/><circle cx="210" cy="120" r="40"/><path className="accent" d="M195 98v44l40-22z"/><rect x="78" y="166" width="106" height="16" rx="8"/><rect x="236" y="166" width="106" height="16" rx="8"/></svg>
    <strong>Treino prescrito</strong><span>séries · descanso · revisão</span>
  </Frame>;
}

export function ExecutionVisual(_: FitCoreVisualProps) {
  return <Frame label="Execução com mídia">
    <svg viewBox="0 0 420 240" role="img"><rect x="44" y="32" width="332" height="178" rx="30"/><rect x="70" y="62" width="148" height="104" rx="20"/><path className="accent" d="M130 92v44l40-22z"/><rect x="238" y="68" width="96" height="14" rx="7"/><rect x="238" y="100" width="72" height="12" rx="6"/><rect x="238" y="126" width="112" height="12" rx="6"/><circle cx="252" cy="170" r="16"/><path className="accent" d="M244 170l6 7 15-18"/><rect x="278" y="160" width="70" height="18" rx="9"/></svg>
    <strong>Execução guiada</strong><span>GIF · feito · esforço</span>
  </Frame>;
}

export function EvolutionVisual(_: FitCoreVisualProps) {
  return <Frame label="Evolução e métricas">
    <svg viewBox="0 0 420 240" role="img"><rect x="44" y="34" width="332" height="176" rx="30"/><path d="M84 168h260"/><path d="M84 168V72"/><rect x="112" y="132" width="34" height="36" rx="8"/><rect x="170" y="112" width="34" height="56" rx="8"/><rect x="228" y="90" width="34" height="78" rx="8"/><rect x="286" y="66" width="34" height="102" rx="8"/><path className="accent" d="M98 128c44-20 72-44 112-35 48 11 72-16 122-44"/><circle cx="332" cy="49" r="10"/></svg>
    <strong>Evolução real</strong><span>frequência · esforço · progresso</span>
  </Frame>;
}

export const featureVisuals = {
  business: BusinessVisual,
  team: TeamVisual,
  students: StudentsVisual,
  workouts: WorkoutsVisual,
  execution: ExecutionVisual,
  evolution: EvolutionVisual,
};
