/**
 * KpiCard Component
 *
 * A compact KPI card for carousel slides.
 */

interface KpiCardProps {
  label: string;
  value: string;
  target?: string;
  variance?: string;
  status?: "Good" | "Warning" | "Critical";
}

export function KpiCard({ label, value, target, variance, status }: KpiCardProps) {
  const varianceClass = variance
    ? variance.startsWith("+") || variance.includes("▲")
      ? "carousel-kpi-card__variance--good"
      : variance.startsWith("-") || variance.includes("▼")
      ? status === "Critical"
        ? "carousel-kpi-card__variance--critical"
        : "carousel-kpi-card__variance--warning"
      : ""
    : "";

  return (
    <div className="carousel-kpi-card">
      <div className="carousel-kpi-card__label">{label}</div>
      <div className="carousel-kpi-card__value">{value}</div>
      {target && <div className="carousel-kpi-card__target">{target}</div>}
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
