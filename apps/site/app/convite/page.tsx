import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function Page() {
  return <FitCoreAppShell section="Convite"><FitCoreRouteClient mode="invite" /></FitCoreAppShell>;
}
