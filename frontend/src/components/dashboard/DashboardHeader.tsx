type Props = {
  subtitle?: string;
  sseStatus?: "idle" | "connecting" | "live" | "offline";
};

export function DashboardHeader({ subtitle, sseStatus }: Props) {
  let statusLabel = "";
  let statusClass = "";

  if (sseStatus === "live") {
    statusLabel = "● Live";
    statusClass = "live";
  } else if (sseStatus === "connecting") {
    statusLabel = "◐ Connecting";
    statusClass = "connecting";
  } else if (sseStatus === "offline") {
    statusLabel = "○ Offline";
    statusClass = "offline";
  }

  return (
    <header className="dash-header">
      <div className="dash-header__branding">
        <div className="dash-header__brand-mark" aria-label="Patil Manufacturing Analytics brand mark">
          PG
        </div>
        <div>
          <p className="dash-header__eyebrow">Patil Manufacturing Analytics</p>
          <h1 className="dash-header__title">OEE &amp; Production Performance</h1>
          {subtitle ? <p className="dash-header__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="dash-header__info">
        <p className="dash-header__note">
          Read-only snapshots from <code>/api/v1/dashboard</code> — no live machine
          status, no client-side OEE math.
        </p>
        {statusLabel && (
          <p className={`dash-header__status dash-header__status--${statusClass}`}>
            {statusLabel}
          </p>
        )}
      </div>
    </header>
  );
}
