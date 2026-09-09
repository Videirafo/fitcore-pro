import { FitCoreShell } from "../../components/FitCoreShell";
import { Progress } from "../../components/ui/Progress";
import { Skeleton } from "../../components/ui/Skeleton";

export default function Mvp24Loading() {
  return (
    <FitCoreShell>
      <section className="hero" aria-busy="true" aria-live="polite">
        <div>
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-5 h-16 w-full max-w-3xl" variant="rounded" />
          <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-5 w-4/5 max-w-xl" />
          <div className="mt-6 flex gap-3">
            <Skeleton className="h-12 w-44" variant="rounded" />
            <Skeleton className="h-12 w-36" variant="rounded" />
          </div>
        </div>
        <aside className="card">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-9 w-28" />
          <Progress className="mt-5" indeterminate label="Carregando treino" size="lg" />
          <div className="mt-5 grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" variant="rounded" />
            ))}
          </div>
        </aside>
      </section>
    </FitCoreShell>
  );
}
