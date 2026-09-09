export type ProgressProps = {
  value?: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  indeterminate?: boolean;
  className?: string;
};

const sizeClass: Record<NonNullable<ProgressProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

/**
 * FitCore-owned adaptation of Lightswind's MIT `progress` registry primitive.
 * Source: codewithMUHILAN/Lightswind-UI-Library @ 53ef2ee.
 *
 * Kept dependency-free and mapped to FitCore tokens for mobile workout flows.
 */
export function Progress({
  value = 0,
  max = 100,
  label,
  showValue = false,
  size = 'md',
  indeterminate = false,
  className = '',
}: ProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
  const percentage = Math.round((safeValue / safeMax) * 100);

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      {label || (showValue && !indeterminate) ? (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-extrabold">
          <span className="truncate text-white/70">{label}</span>
          {showValue && !indeterminate ? <span className="tabular-nums text-white">{percentage}%</span> : null}
        </div>
      ) : null}
      <div
        className={`relative w-full overflow-hidden rounded-full bg-white/10 ${sizeClass[size]}`}
        role="progressbar"
        aria-label={label || 'Progresso'}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={indeterminate ? undefined : safeValue}
        aria-valuetext={indeterminate ? 'Em andamento' : `${percentage}%`}
      >
        <div
          className={[
            'h-full rounded-full bg-fitcore-green shadow-[0_0_20px_rgba(68,236,95,.28)] transition-[width] duration-500 ease-out',
            indeterminate ? 'w-1/2 animate-pulse motion-reduce:animate-none' : '',
          ].filter(Boolean).join(' ')}
          style={indeterminate ? undefined : { width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
