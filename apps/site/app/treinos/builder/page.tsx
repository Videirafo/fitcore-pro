import { FitCoreAppShell } from "../../../components/FitCoreAppShell";
import { WorkoutBuilderVNextClient } from "../../../components/WorkoutBuilderVNextClient";

export default function Page() {
  return (
    <FitCoreAppShell
      section="Treinos"
      eyebrow="Workout Builder VNext"
      title="Monte treinos por dia, bloco, exercício e série."
      description="Defina carga, descanso, RIR/RPE, periodização e revise o preview antes de enviar a prescrição."
    >
      <WorkoutBuilderVNextClient />
    </FitCoreAppShell>
  );
}
