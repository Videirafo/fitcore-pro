type FitCoreBrandSymbolProps = {
  compact?: boolean;
  className?: string;
};

export function FitCoreBrandSymbol({ compact = false, className = "" }: FitCoreBrandSymbolProps) {
  const classes = ["fitcore-symbol", compact ? "is-compact" : "", className].filter(Boolean).join(" ");
  return (
    <span className={classes} role="img" aria-label="FitCore Pro">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path className="fitcore-symbol-f" d="M17 17h23v7H25v8h12v7H25v14h-8V17Z" />
        <path className="fitcore-symbol-c" d="M49 22.5c-2.8-3.1-6.5-4.8-10.8-4.8-8.7 0-15.7 6.9-15.7 15.4 0 8.6 7 15.6 15.7 15.6 4.4 0 8.2-1.7 11-5" />
      </svg>
    </span>
  );
}
