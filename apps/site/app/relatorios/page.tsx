import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function Page() {
  return <FitCoreAppShell section="Relatorios"><FitCoreRouteClient mode="reports" /></FitCoreAppShell>;
}
