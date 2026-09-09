import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function StudentsPage() {
  return <FitCoreAppShell section="Alunos"><FitCoreRouteClient mode="students" /></FitCoreAppShell>;
}
