import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function ExecutionPage() {
  return <FitCoreAppShell section="Execução"><FitCoreRouteClient mode="execution" /></FitCoreAppShell>;
}
