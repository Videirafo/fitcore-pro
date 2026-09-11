type FitCoreBrandSymbolProps = {
  compact?: boolean;
  className?: string;
};

export function FitCoreBrandSymbol({ compact = false, className = "" }: FitCoreBrandSymbolProps) {
  const classes = ["fitcore-symbol", compact ? "is-compact" : "", className].filter(Boolean).join(" ");
  return (
    <span className={classes} role="img" aria-label="FitCore Pro">
      <img src="/brand/fitcore-pro-symbol.svg" alt="" aria-hidden="true" />
    </span>
  );
}
