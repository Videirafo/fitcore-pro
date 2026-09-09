import { FitCoreAppShell } from "../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../components/FitCoreRouteClient";

export default function HomePage() {
  return <FitCoreAppShell section="Visão geral"><FitCoreRouteClient mode="home" /></FitCoreAppShell>;
}
