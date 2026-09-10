import { ProductShot } from "./FitCoreProductShots";

type FitCoreVisualProps = { label?: string };

export function FitCoreBrandMark() {
  return <span className="fitcore-brand-mark fitcore-brand-mark-premium" aria-label="FitCore Pro"><i>FC</i><b /></span>;
}

export function BusinessVisual(_: FitCoreVisualProps) { return <ProductShot kind="business" title="Unidade fitness" />; }
export function TeamVisual(_: FitCoreVisualProps) { return <ProductShot kind="team" title="Equipe" />; }
export function StudentsVisual(_: FitCoreVisualProps) { return <ProductShot kind="students" title="Alunos" />; }
export function WorkoutsVisual(_: FitCoreVisualProps) { return <ProductShot kind="workouts" title="Treinos" />; }
export function ExecutionVisual(_: FitCoreVisualProps) { return <ProductShot kind="execution" title="Execução" />; }
export function EvolutionVisual(_: FitCoreVisualProps) { return <ProductShot kind="evolution" title="Evolução" />; }

export const featureVisuals = {
  business: BusinessVisual,
  team: TeamVisual,
  students: StudentsVisual,
  workouts: WorkoutsVisual,
  execution: ExecutionVisual,
  evolution: EvolutionVisual,
};
