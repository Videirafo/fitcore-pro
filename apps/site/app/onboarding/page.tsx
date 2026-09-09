import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function OnboardingPage() {
  return <FitCoreAppShell section="Criar negócio"><FitCoreRouteClient mode="onboarding" /></FitCoreAppShell>;
}
