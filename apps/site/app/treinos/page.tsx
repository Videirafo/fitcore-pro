import Link from "next/link";
import { FitCoreAppShell } from "../../components/FitCoreAppShell";
import { FitCoreRouteClient } from "../../components/FitCoreRouteClient";

export default function Page() {
  return (
    <FitCoreAppShell section="Treinos">
      <div className="hero-actions-inline">
        <Link className="primary-pill" href="/treinos/builder">Abrir Workout Builder VNext</Link>
      </div>
      <FitCoreRouteClient mode="training" />
    </FitCoreAppShell>
  );
}
