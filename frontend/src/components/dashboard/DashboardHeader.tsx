type Props = {
  subtitle?: string;
};

export function DashboardHeader({ subtitle }: Props) {
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
      <p className="dash-header__note">
        Read-only snapshots from <code>/api/v1/dashboard</code> — no live machine
        status, no client-side OEE math.
      </p>
    </header>
  );
}
