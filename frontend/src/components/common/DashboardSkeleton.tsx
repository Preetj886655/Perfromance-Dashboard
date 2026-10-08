import { motion } from "motion/react";

export function KpiCardSkeleton() {
  return (
    <div className="skeleton-kpi-card">
      <div className="skeleton-kpi-card__header">
        <div className="skeleton-box skeleton-box--icon" />
        <div className="skeleton-box skeleton-box--label" />
      </div>
      <div className="skeleton-box skeleton-box--val" />
      <div className="skeleton-box skeleton-box--subval" />
      <div className="skeleton-box skeleton-box--target" />
    </div>
  );
}

export function ChartSkeleton({ titleWidth = "140px", height = 220 }: { titleWidth?: string; height?: number }) {
  return (
    <div className="skeleton-chart-card">
      <div className="skeleton-chart-card__header">
        <div className="skeleton-box skeleton-box--title" style={{ width: titleWidth }} />
        <div className="skeleton-box skeleton-box--subtitle" />
      </div>
      <div className="skeleton-chart-card__body" style={{ height: `${height}px` }}>
        <div className="skeleton-chart-bars">
          <div className="skeleton-bar" style={{ height: "45%" }} />
          <div className="skeleton-bar" style={{ height: "70%" }} />
          <div className="skeleton-bar" style={{ height: "55%" }} />
          <div className="skeleton-bar" style={{ height: "85%" }} />
          <div className="skeleton-bar" style={{ height: "60%" }} />
          <div className="skeleton-bar" style={{ height: "92%" }} />
          <div className="skeleton-bar" style={{ height: "78%" }} />
          <div className="skeleton-bar" style={{ height: "65%" }} />
        </div>
      </div>
    </div>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <motion.div
      className="dashboard-skeleton-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="skeleton-banner">
        <div className="skeleton-banner__spinner" />
        <div className="skeleton-banner__text">
          <strong>Synchronizing Live Manufacturing Dataset...</strong>
          <span>Connecting to Google Sheets data pipeline and aggregating operational records</span>
        </div>
      </div>

      <div className="skeleton-kpi-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCardSkeleton key={`skeleton-kpi-${i}`} />
        ))}
      </div>

      <div className="skeleton-horizons-grid">
        <ChartSkeleton titleWidth="180px" height={220} />
        <ChartSkeleton titleWidth="160px" height={220} />
      </div>
    </motion.div>
  );
}
