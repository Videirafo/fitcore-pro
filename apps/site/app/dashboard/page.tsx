import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function DashboardPage() {
  return <FitCoreAppShell section="Dashboard"><FitCoreRouteClient mode="home" /></FitCoreAppShell>;
}
