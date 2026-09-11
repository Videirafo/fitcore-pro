type FitCoreBrandProps = {
  compact?: boolean;
  className?: string;
};

export function FitCoreBrandSymbol({ compact = false, className = "" }: FitCoreBrandProps) {
  const classes = ["fitcore-symbol", compact ? "is-compact" : "", className].filter(Boolean).join(" ");
  return <span className={classes} role="img" aria-label="FitCore Pro"><img src="/brand/fitcore-pro-symbol.png" alt="" aria-hidden="true" /></span>;
}

export function FitCoreBrandLockup({ compact = false, className = "" }: FitCoreBrandProps) {
  const classes = ["fitcore-lockup", compact ? "is-compact" : "", className].filter(Boolean).join(" ");
  return <span className={classes} role="img" aria-label="FitCore Pro — Treino, Gestão, Resultados"><img src="/brand/fitcore-pro-official.png" alt="" aria-hidden="true" /></span>;
}
