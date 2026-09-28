/**
 * KpiCard Component — Operations Command Center HUD Tile
 *
 * Compact HUD-style card with notched bracket corners, technical typography,
 * large readable numerals (Orbitron), and semantic status indication.
 */

interface KpiCardProps {
  label: string;
  value: string;
  exactValue?: string;
  unit?: string;
  target?: string;
  variance?: string;
  varianceType?: "good" | "warning" | "critical" | "neutral";
  status?: "Good" | "Warning" | "Critical";
  code?: string;
  icon?: React.ReactNode;
  iconClass?: string;
  valueColorClass?: string;
  onClick?: () => void;
}

export function KpiCard({ label, value, exactValue, unit, target, variance, varianceType, status, code, icon, iconClass, valueColorClass, onClick }: KpiCardProps) {
  const varianceClass = varianceType
    ? varianceType === "good"
      ? "carousel-kpi-card__variance--good"
      : varianceType === "warning"
      ? "carousel-kpi-card__variance--warning"
      : varianceType === "critical"
      ? "carousel-kpi-card__variance--critical"
      : ""
    : variance
    ? variance.startsWith("+") || variance.includes("▲")
      ? "carousel-kpi-card__variance--good"
      : variance.startsWith("-") || variance.includes("▼")
      ? status === "Critical"
        ? "carousel-kpi-card__variance--critical"
        : "carousel-kpi-card__variance--warning"
      : ""
    : "";

  const statusDotClass = status === "Good" 
    ? "kpi-status-dot--good" 
    : status === "Warning" 
    ? "kpi-status-dot--warning" 
    : status === "Critical" 
    ? "kpi-status-dot--critical" 
    : "";

  const isClickable = Boolean(onClick);
  const targetOrUnit = target ?? unit;

  return (
    <div
      className={`carousel-kpi-card ${status ? `carousel-kpi-card--${status.toLowerCase()}` : ""} ${isClickable ? "carousel-kpi-card--clickable" : ""}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      style={isClickable ? { cursor: "pointer" } : undefined}
    >
      <div className="carousel-kpi-card__header">
        {icon && <div className={`carousel-kpi-card__icon ${iconClass ?? ""}`}>{icon}</div>}
        <span className="carousel-kpi-card__label">{label}</span>
        {status && <span className={`kpi-status-dot ${statusDotClass}`} title={`Status: ${status}`} />}
        {code && <span className="carousel-kpi-card__code">{code}</span>}
      </div>
      <div className="carousel-kpi-card__value-group">
        <div className={`carousel-kpi-card__value ${valueColorClass ?? ""}`.trim()}>{value}</div>
        {exactValue && <div className="carousel-kpi-card__exact-value">{exactValue}</div>}
      </div>
      {targetOrUnit && <div className="carousel-kpi-card__target">{targetOrUnit}</div>}
      {variance && (
        <div className={`carousel-kpi-card__variance ${varianceClass}`}>{variance}</div>
      )}
    </div>
  );
}

interface KpiGridProps {
  children: React.ReactNode;
}

export function KpiGrid({ children }: KpiGridProps) {
  return <div className="carousel-kpi-grid">{children}</div>;
}
