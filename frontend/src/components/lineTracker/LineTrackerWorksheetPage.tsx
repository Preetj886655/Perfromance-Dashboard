type Props = {
  worksheetKey: string;
};

const ANALYTICS_DESTINATIONS: Record<string, string> = {
  production: "#/dashboard",
  summary: "#/dashboard",
  dashboard: "#/dashboard",
  "production-order": "#/line-tracker",
  "order-plan-monthly": "#/line-tracker",
  "rm-heat-plan-vs-actual": "#/line-tracker",
  entries: "#/line-tracker",
  "machine-master": "#/line-tracker",
  "oee-reliability": "#/line-tracker",
  "downtime-analysis": "#/line-tracker",
};

export function LineTrackerWorksheetPage({ worksheetKey }: Props) {
  const destination = ANALYTICS_DESTINATIONS[worksheetKey] ?? "#/line-tracker";

  return (
    <section className="line-tracker-worksheet__empty" aria-label="Operational analytics">
      <h2>Operational analytics</h2>
      <p>
        This view is available through the dashboard analytics and department workspaces.
      </p>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => {
          window.location.hash = destination;
        }}
      >
        Open analytics
      </button>
    </section>
  );
}
