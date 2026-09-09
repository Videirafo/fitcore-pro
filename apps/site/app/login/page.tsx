import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function Page() {
  return <FitCoreAppShell section="Login"><FitCoreRouteClient mode="login" /></FitCoreAppShell>;
}
