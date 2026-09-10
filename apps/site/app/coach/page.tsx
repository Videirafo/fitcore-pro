import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function CoachPage() {
  return <FitCoreAppShell section="Assistente IA"><FitCoreRouteClient mode="agents" /></FitCoreAppShell>;
}
