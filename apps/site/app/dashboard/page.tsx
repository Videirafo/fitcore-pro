import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function DashboardPage() {
  return (
    <FitCoreAppShell section="Visão geral">
      <FitCoreRouteClient mode="home" />
    </FitCoreAppShell>
  );
}
