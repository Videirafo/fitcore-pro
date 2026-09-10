type FitCoreBrandSymbolProps = {
  compact?: boolean;
  className?: string;
};

export function FitCoreBrandSymbol({ compact = false, className = "" }: FitCoreBrandSymbolProps) {
  const classes = ["fitcore-symbol", compact ? "is-compact" : "", className].filter(Boolean).join(" ");
  return (
    <span className={classes} role="img" aria-label="FitCore Pro">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path className="fitcore-symbol-ring" d="M49 18.5A22 22 0 1 0 49 45.5" />
        <path className="fitcore-symbol-f" d="M17 17h28l-5.5 7H26v7.5h11.5l-5 6.5H26v10h-9V17Z" />
        <circle className="fitcore-symbol-core" cx="48" cy="32" r="3.4" />
      </svg>
    </span>
  );
}
