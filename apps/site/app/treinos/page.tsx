import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function TrainingPage() {
  return <FitCoreAppShell section="Treinos"><FitCoreRouteClient mode="training" /></FitCoreAppShell>;
}
