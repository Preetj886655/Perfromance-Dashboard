import { useEffect, useMemo, useState } from "react";
import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { CreateAccountPage } from "./pages/CreateAccountPage";
import "./App.css";

type ViewKey = "dashboard" | "users" | "masters";
type Screen = "login" | "forgot-password" | "reset-password" | "create-account" | "app";
type RouteKey =
  | "overview"
  | "production"
  | "oee"
  | "quality"
  | "ppc"
  | "scm"
  | "store"
  | "maintenance"
  | "npd"
  | "hr"
  | "safety"
  | "logistics"
  | "5s"
  | "kpi"
  | "actions"
  | "data-import"
  | "google-forms"
  | "reports"
  | "settings";

type FilterState = {
  date: string;
  shift: string;
  department: string;
  line: string;
  machine: string;
  part: string;
  product: string;
  customer: string;
  month: string;
  week: string;
  heatNo: string;
};

function resolveHashView(): ViewKey {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  if (hash === "#/users") return "users";
  if (hash === "#/masters") return "masters";
  return "dashboard";
}

function getScreenFromLocation(): Screen {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  if (hash === "#/forgot-password") return "forgot-password";
  if (hash.startsWith("#/reset-password")) return "reset-password";
  if (hash === "#/create-account") return "create-account";
  return "login";
}

function getRouteFromHash(): RouteKey {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const routeMap: Record<string, RouteKey> = {
    "#/overview": "overview",
    "#/production": "production",
    "#/oee": "oee",
    "#/quality": "quality",
    "#/ppc": "ppc",
    "#/scm": "scm",
    "#/store": "store",
    "#/maintenance": "maintenance",
    "#/npd": "npd",
    "#/hr": "hr",
    "#/safety": "safety",
    "#/logistics": "logistics",
    "#/5s": "5s",
    "#/kpi": "kpi",
    "#/actions": "actions",
    "#/data-import": "data-import",
    "#/google-forms": "google-forms",
    "#/reports": "reports",
    "#/settings": "settings",
    "#/dashboard": "overview",
  };
  return routeMap[hash] ?? "overview";
}

const defaultFilters: FilterState = {
  date: "2026-08-16",
  shift: "All",
  department: "All",
  line: "All",
  machine: "All",
  part: "All",
  product: "All",
  customer: "All",
  month: "Aug 2026",
  week: "W33",
  heatNo: "All",
};

const navItems = [
  { key: "overview", label: "Overview", icon: "▣" },
  { key: "production", label: "Production", icon: "▤" },
  { key: "oee", label: "OEE", icon: "◉" },
  { key: "quality", label: "Quality", icon: "◌" },
  { key: "ppc", label: "PPC", icon: "⌁" },
  { key: "scm", label: "SCM", icon: "◫" },
  { key: "store", label: "Store", icon: "▦" },
  { key: "maintenance", label: "Maintenance", icon: "⚙" },
  { key: "npd", label: "NPD / Design", icon: "✦" },
  { key: "hr", label: "HR", icon: "◍" },
  { key: "safety", label: "Safety", icon: "△" },
  { key: "logistics", label: "Logistics / Dispatch", icon: "⇄" },
  { key: "5s", label: "5S", icon: "▚" },
  { key: "kpi", label: "KPI & Reports", icon: "◫" },
  { key: "data-import", label: "Data Import", icon: "⤴" },
  { key: "google-forms", label: "Google Forms", icon: "▣" },
  { key: "actions", label: "Pending Actions", icon: "⚑" },
  { key: "settings", label: "Settings", icon: "⚙" },
] as const;

const overviewKpis = [
  { title: "Production Achievement", value: "8,420 / 10,000", target: "84.2%", variance: "-5.8% vs target", trend: "down", status: "Warning" },
  { title: "OEE", value: "72.4%", target: "75%", variance: "-2.6%", trend: "down", status: "Warning" },
  { title: "Quality", value: "98.1%", target: "98.5%", variance: "+0.6%", trend: "up", status: "Good" },
  { title: "Machine Utilization", value: "81.6%", target: "85%", variance: "-3.4%", trend: "down", status: "Warning" },
  { title: "Rejection Rate", value: "1.9%", target: "1.5%", variance: "+0.4%", trend: "down", status: "Warning" },
  { title: "Downtime", value: "184 min", target: "150 min", variance: "+34 min", trend: "down", status: "Critical" },
  { title: "On-Time Production", value: "92.4%", target: "95%", variance: "-2.6%", trend: "down", status: "Warning" },
  { title: "Pending Actions", value: "17", target: "10", variance: "+7", trend: "down", status: "Attention" },
] as const;

const productionTrend = [52, 58, 61, 67, 64, 69, 73, 76, 74, 82, 79, 86];
const targetVsActual = [8400, 9100, 8700, 9200, 9400, 8900, 9700, 8950];
const downtimePareto = [
  { label: "Line 2", value: 42 },
  { label: "Changeover", value: 26 },
  { label: "Material Delay", value: 18 },
  { label: "Setup", value: 14 },
];
const defectPareto = [
  { label: "Surface Defect", value: 34 },
  { label: "Dimension", value: 27 },
  { label: "Scratch", value: 22 },
  { label: "Packing", value: 17 },
];
const actionRows = [
  { priority: "Critical", action: "Line 2 downtime analysis", department: "Production", owner: "R. Kulkarni", due: "2026-08-18", status: "Open", days: 3 },
  { priority: "High", action: "Material shortage on M-07", department: "SCM", owner: "S. Patil", due: "2026-08-17", status: "In progress", days: 2 },
  { priority: "High", action: "CAPA closure for PPM spike", department: "Quality", owner: "V. Shinde", due: "2026-08-20", status: "Open", days: 4 },
  { priority: "Medium", action: "PM check for compressor", department: "Maintenance", owner: "A. Jadhav", due: "2026-08-18", status: "Scheduled", days: 5 },
  { priority: "Medium", action: "Dispatch delay to customer A", department: "Logistics", owner: "M. Bandekar", due: "2026-08-19", status: "Tracking", days: 6 },
  { priority: "Low", action: "5S audit closure on bay 4", department: "5S", owner: "N. More", due: "2026-08-22", status: "Planned", days: 8 },
];

function AppView() {
  const { user, isAuthenticated, isLoading, isForbidden, login, logout, hasPermission } = useAuth();
  const [view, setView] = useState<ViewKey>(resolveHashView);
  const [screen, setScreen] = useState<Screen>(getScreenFromLocation);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [route, setRoute] = useState<RouteKey>(getRouteFromHash);

  useEffect(() => {
    const sync = () => {
      setView(resolveHashView());
      setScreen(getScreenFromLocation());
      setRoute(getRouteFromHash());
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const canManageUsers = hasPermission("users", "MANAGE");
  const canCreateMasters = hasPermission("masters", "CREATE");

  const currentPageTitle = useMemo(
    () => navItems.find((item) => item.key === route)?.label ?? "Overview",
    [route],
  );

  const openDashboard = () => {
    window.location.hash = "#/overview";
    setView("dashboard");
    setRoute("overview");
  };

  const openUsers = () => {
    window.location.hash = "#/users";
    setView("users");
  };

  const openMasters = () => {
    window.location.hash = "#/masters";
    setView("masters");
  };

  const itemClick = (key: RouteKey) => {
    window.location.hash = `#/${key}`;
    setRoute(key);
  };

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="shell shell--narrow">
        <div className="panel panel--muted auth-loading">
          <h2>Loading</h2>
          <p>Checking your session and permissions…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    if (screen === "forgot-password") {
      return <ForgotPasswordPage />;
    }
    if (screen === "reset-password") {
      return <ResetPasswordPage />;
    }
    if (screen === "create-account") {
      return <CreateAccountPage />;
    }
    return (
      <div className="shell shell--narrow">
        <LoginPage onSubmit={login} />
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="shell shell--narrow">
        <div className="panel panel--error auth-denied">
          <h2>Access denied</h2>
          <p>You do not have permission to access this application.</p>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (view === "masters") {
    return canCreateMasters ? <MasterDataPage /> : <AccessDenied onLogout={logout} />;
  }

  if (view === "users") {
    return canManageUsers ? <UserManagementPage /> : <AccessDenied onLogout={logout} />;
  }

  return (
    <div className="industrial-shell">
      <aside className={`sidebar ${sidebarCollapsed ? "sidebar--collapsed" : ""}`}>
        <div className="sidebar__brand-wrap">
          <div className="sidebar__brand-mark">PG</div>
          {!sidebarCollapsed ? (
            <div>
              <div className="sidebar__brand-name">Patil Group</div>
              <div className="sidebar__brand-sub">Manufacturing Dashboard</div>
            </div>
          ) : null}
        </div>
        <button className="sidebar__toggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)}>
          {sidebarCollapsed ? "→" : "←"}
        </button>
        <nav className="sidebar__nav" aria-label="Sidebar navigation">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sidebar__item ${route === item.key ? "sidebar__item--active" : ""}`}
              onClick={() => itemClick(item.key)}
            >
              <span className="sidebar__icon">{item.icon}</span>
              {!sidebarCollapsed ? <span>{item.label}</span> : null}
            </button>
          ))}
        </nav>
      </aside>

      <div className="dashboard-area">
        <header className="top-header">
          <div className="top-header__title-block">
            <div className="top-header__eyebrow">Patil Group</div>
            <h1>{currentPageTitle}</h1>
          </div>
          <div className="top-header__meta">
            <div className="top-header__datetime">16 Aug 2026, 20:10</div>
            <button type="button" className="top-header__action">🔔 3</button>
            <div className="top-header__profile">
              <div className="profile-avatar">LS</div>
              <div>
                <div className="profile-name">Dr. L. S. Patil</div>
                <div className="profile-role">Plant Leadership</div>
              </div>
            </div>
          </div>
        </header>

        <section className="filter-panel panel">
          <div className="filter-row">
            <label className="field">
              <span>Date</span>
              <input type="date" value={filters.date} onChange={(event) => handleFilterChange("date", event.target.value)} />
            </label>
            <label className="field">
              <span>Shift</span>
              <select value={filters.shift} onChange={(event) => handleFilterChange("shift", event.target.value)}>
                <option>All</option>
                <option>A</option>
                <option>B</option>
                <option>C</option>
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select value={filters.department} onChange={(event) => handleFilterChange("department", event.target.value)}>
                <option>All</option>
                <option>Production</option>
                <option>Quality</option>
                <option>Maintenance</option>
              </select>
            </label>
            <label className="field">
              <span>Line</span>
              <select value={filters.line} onChange={(event) => handleFilterChange("line", event.target.value)}>
                <option>All</option>
                <option>Line 1</option>
                <option>Line 2</option>
                <option>Line 3</option>
              </select>
            </label>
            <label className="field">
              <span>Machine</span>
              <select value={filters.machine} onChange={(event) => handleFilterChange("machine", event.target.value)}>
                <option>All</option>
                <option>M-01</option>
                <option>M-04</option>
                <option>M-07</option>
              </select>
            </label>
            <label className="field">
              <span>Part</span>
              <select value={filters.part} onChange={(event) => handleFilterChange("part", event.target.value)}>
                <option>All</option>
                <option>PR-220</option>
                <option>PR-345</option>
              </select>
            </label>
            <label className="field">
              <span>Product</span>
              <select value={filters.product} onChange={(event) => handleFilterChange("product", event.target.value)}>
                <option>All</option>
                <option>Rail Joint</option>
                <option>Track Bracket</option>
              </select>
            </label>
            <label className="field">
              <span>Customer</span>
              <select value={filters.customer} onChange={(event) => handleFilterChange("customer", event.target.value)}>
                <option>All</option>
                <option>Indian Railways</option>
                <option>Patil Infra</option>
              </select>
            </label>
            <label className="field">
              <span>Month</span>
              <select value={filters.month} onChange={(event) => handleFilterChange("month", event.target.value)}>
                <option>Aug 2026</option>
                <option>Sep 2026</option>
              </select>
            </label>
            <label className="field">
              <span>Week</span>
              <select value={filters.week} onChange={(event) => handleFilterChange("week", event.target.value)}>
                <option>W33</option>
                <option>W34</option>
              </select>
            </label>
            <label className="field">
              <span>Heat No.</span>
              <select value={filters.heatNo} onChange={(event) => handleFilterChange("heatNo", event.target.value)}>
                <option>All</option>
                <option>HT-401</option>
                <option>HT-442</option>
              </select>
            </label>
          </div>
          <div className="filter-actions">
            <button type="button" className="btn btn--primary" onClick={() => setRoute(route)}>
              Apply Filters
            </button>
            <button type="button" className="btn" onClick={() => setFilters(defaultFilters)}>
              Reset
            </button>
          </div>
        </section>

        <main className="content-area">
          {route === "overview" && <OverviewPage filters={filters} />}
          {route === "production" && <ProductionPage filters={filters} />}
          {route === "oee" && <OeePage filters={filters} />}
          {route === "quality" && <QualityPage filters={filters} />}
          {route === "ppc" && <PpcPage filters={filters} />}
          {route === "scm" && <ScmPage filters={filters} />}
          {route === "store" && <StorePage filters={filters} />}
          {route === "maintenance" && <MaintenancePage filters={filters} />}
          {route === "npd" && <NpdPage filters={filters} />}
          {route === "hr" && <HrPage filters={filters} />}
          {route === "safety" && <SafetyPage filters={filters} />}
          {route === "logistics" && <LogisticsPage filters={filters} />}
          {route === "5s" && <FiveSPage filters={filters} />}
          {route === "kpi" && <KpiPage filters={filters} />}
          {route === "actions" && <ActionsPage filters={filters} />}
          {route === "data-import" && <DataImportPage filters={filters} />}
          {route === "google-forms" && <GoogleFormsPage filters={filters} />}
          {route === "reports" && <ReportsPage filters={filters} />}
          {route === "settings" && <SettingsPage filters={filters} />}
        </main>

        <footer className="app-footer">
          <span>Last Updated: 16 Aug 2026, 20:10</span>
          <span>Data Source: Google Sheet / Excel / CSV / API</span>
          <span className="status-chip status-chip--live">● Live</span>
        </footer>
      </div>
    </div>
  );
}

function AccessDenied({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="shell shell--narrow">
      <div className="panel panel--error auth-denied">
        <h2>Access denied</h2>
        <p>You do not have permission to access this application.</p>
        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function OverviewPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header">
        <div>
          <div className="page-header__eyebrow">Overall Manufacturing Dashboard</div>
          <h2>Plant performance overview</h2>
        </div>
        <div className="inline-status">
          <span>Current Shift: {filters.shift === "All" ? "A / B / C" : filters.shift}</span>
          <span>Plant: Patil Rail Infrastructure</span>
          <span>Overall KPI: 88.6%</span>
        </div>
      </section>

      <section className="kpi-grid">
        {overviewKpis.map((card) => (
          <KpiCard
            key={card.title}
            title={card.title}
            value={card.value}
            target={card.target}
            variance={card.variance}
            status={card.status}
            trend={card.trend as "up" | "down"}
          />
        ))}
      </section>

      <section className="content-grid content-grid--two">
        <ChartPanel title="Plan vs Target vs Actual" subtitle="Production output and target achievement">
          <BarChartSeries values={[84, 92, 88, 97, 90, 95, 88, 93]} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Current"]} />
        </ChartPanel>
        <ChartPanel title="Production Trend" subtitle="Daily output trend">
          <LineChartSeries values={productionTrend} />
        </ChartPanel>
      </section>

      <section className="content-grid content-grid--three">
        <ChartPanel title="Quality Mix" subtitle="Defective vs good output">
          <DonutChart value={98.1} color="#6ee7b7" />
        </ChartPanel>
        <ChartPanel title="Downtime Pareto" subtitle="Most impactful interruptions">
          <ParetoList data={downtimePareto} />
        </ChartPanel>
        <ChartPanel title="Top Quality Problems" subtitle="Defect concentration by category">
          <ParetoList data={defectPareto} />
        </ChartPanel>
      </section>

      <section className="summary-grid">
        <div className="panel summary-box">
          <div className="summary-box__title">AI Manufacturing Insights</div>
          <ul>
            <li>Production achievement is 8% below target primarily due to Line 2 downtime.</li>
            <li>Machine M-04 has the highest downtime contribution this week.</li>
            <li>Quality rejection increased by 2.4% compared to last week.</li>
          </ul>
        </div>
        <div className="panel summary-box">
          <div className="summary-box__title">Management Summary</div>
          <div className="summary-box__columns">
            <div>
              <h4>What is going well?</h4>
              <ul>
                <li>Quality stable at 98.1%</li>
                <li>Safety compliance strong</li>
              </ul>
            </div>
            <div>
              <h4>What requires attention?</h4>
              <ul>
                <li>DOWNTIME on Line 2</li>
                <li>Material shortage</li>
                <li>CAPA backlog</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductionPage({ filters }: { filters: FilterState }) {
  const cards = [
    { title: "Production Achievement", value: "84.2%", target: "90%", variance: "-5.8%", status: "Warning" },
    { title: "Machine Utilization", value: "81.6%", target: "85%", variance: "-3.4%", status: "Warning" },
    { title: "Good Quantity", value: "7,430", target: "8,000", variance: "-570", status: "Warning" },
    { title: "Downtime", value: "184 min", target: "150 min", variance: "+34 min", status: "Critical" },
  ];
  return (
    <>
      <section className="page-header">
        <div>
          <div className="page-header__eyebrow">Production</div>
          <h2>Production performance and OEE</h2>
        </div>
        <div className="inline-status">
          <span>Shift: {filters.shift}</span>
          <span>Line: {filters.line}</span>
          <span>Data status: Live</span>
        </div>
      </section>
      <section className="kpi-grid">
        {cards.map((card) => (
          <KpiCard key={card.title} title={card.title} value={card.value} target={card.target} variance={card.variance} status={card.status} trend="down" />
        ))}
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Plan vs Target vs Actual" subtitle="By day">
          <BarChartSeries values={[82, 90, 84, 95, 88, 92, 89]} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} />
        </ChartPanel>
        <ChartPanel title="Production by Machine" subtitle="Machine-wise output">
          <HorizontalBar values={[72, 91, 68, 80, 88]} labels={["M-01", "M-02", "M-03", "M-04", "M-05"]} />
        </ChartPanel>
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Production by Shift" subtitle="Output and losses per shift">
          <BarChartSeries values={[76, 84, 71]} labels={["A", "B", "C"]} />
        </ChartPanel>
        <ChartPanel title="Downtime Analysis" subtitle="Pareto of production losses">
          <ParetoList data={downtimePareto} />
        </ChartPanel>
      </section>
    </>
  );
}

function OeePage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header">
        <div>
          <div className="page-header__eyebrow">OEE</div>
          <h2>Availability × Performance × Quality</h2>
        </div>
      </section>
      <section className="gauge-grid">
        <GaugeCard title="Availability" value={84.2} color="#67e8f9" />
        <GaugeCard title="Performance" value={88.4} color="#c4b5fd" />
        <GaugeCard title="Quality" value={98.1} color="#6ee7b7" />
        <GaugeCard title="OEE" value={72.4} color="#fbbf24" large />
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="OEE by Machine" subtitle="Current performance snapshot">
          <HorizontalBar values={[76, 72, 68, 80, 88]} labels={["M-01", "M-02", "M-03", "M-04", "M-05"]} />
        </ChartPanel>
        <ChartPanel title="OEE Trend" subtitle="Last 7 days">
          <LineChartSeries values={[66, 70, 71, 74, 72, 75, 72]} />
        </ChartPanel>
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Hourly Production Report" subtitle="HPR">
          <BarChartSeries values={[35, 45, 40, 55, 52, 60, 57, 50]} labels={["08", "09", "10", "11", "12", "13", "14", "15"]} />
        </ChartPanel>
        <ChartPanel title="Daily Production Report" subtitle="DPR">
          <BarChartSeries values={[8200, 9000, 9500, 8700, 9100, 9400, 9800]} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} />
        </ChartPanel>
      </section>
    </>
  );
}

function QualityPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header">
        <div>
          <div className="page-header__eyebrow">Quality</div>
          <h2>Quality and defect control</h2>
        </div>
      </section>
      <section className="kpi-grid">
        <KpiCard title="Customer Complaints" value="12" target="8" variance="+4" status="Warning" trend="down" />
        <KpiCard title="Internal Rejection" value="1.9%" target="1.5%" variance="+0.4%" status="Warning" trend="down" />
        <KpiCard title="CAPA Closure" value="86%" target="95%" variance="-9%" status="Warning" trend="down" />
        <KpiCard title="Inspection Pass Rate" value="98.7%" target="99%" variance="-0.3%" status="Good" trend="up" />
      </section>
      <section className="content-grid content-grid--three">
        <ChartPanel title="Rejection Trend" subtitle="Weekly trend"><LineChartSeries values={[1.1, 1.3, 1.5, 1.8, 1.7, 1.9, 2.2]} /></ChartPanel>
        <ChartPanel title="Defect Pareto" subtitle="Major contributors"><ParetoList data={defectPareto} /></ChartPanel>
        <ChartPanel title="Customer PPM" subtitle="Current benchmark"><DonutChart value={74} color="#fca5a5" /></ChartPanel>
      </section>
    </>
  );
}

function PpcPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header">
        <div>
          <div className="page-header__eyebrow">PPC</div>
          <h2>Production planning and schedule adherence</h2>
        </div>
      </section>
      <section className="kpi-grid">
        <KpiCard title="Plan vs Actual" value="94.2%" target="96%" variance="-1.8%" status="Warning" trend="down" />
        <KpiCard title="Material Availability" value="89%" target="95%" variance="-6%" status="Warning" trend="down" />
        <KpiCard title="On-Time Production" value="92.4%" target="95%" variance="-2.6%" status="Warning" trend="down" />
        <KpiCard title="Schedule Adherence" value="91%" target="95%" variance="-4%" status="Warning" trend="down" />
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Production Plan" subtitle="Today /Tomorrow /N+2"><BarChartSeries values={[92, 88, 90]} labels={["Today", "Tomorrow", "N+2"]} /></ChartPanel>
        <ChartPanel title="Delayed Orders" subtitle="Currently at risk"><ParetoList data={[{ label: "Order 204", value: 32 }, { label: "Order 118", value: 28 }, { label: "Order 201", value: 24 }, { label: "Order 190", value: 16 }]} /></ChartPanel>
      </section>
    </>
  );
}

function ScmPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">SCM</div><h2>Supply chain and vendor performance</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="Material Availability" value="89%" target="95%" variance="-6%" status="Warning" trend="down" />
        <KpiCard title="Incoming Materials" value="1,420" target="1,500" variance="-80" status="Warning" trend="down" />
        <KpiCard title="Low Stock Items" value="8" target="5" variance="+3" status="Attention" trend="down" />
        <KpiCard title="Supplier OTIF" value="93%" target="96%" variance="-3%" status="Warning" trend="down" />
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="GRN Status" subtitle="Incoming receipts"><BarChartSeries values={[76, 83, 88, 92, 79]} labels={["Mon", "Tue", "Wed", "Thu", "Fri"]} /></ChartPanel>
        <ChartPanel title="Critical Materials" subtitle="Risk items"><ParetoList data={[{ label: "Steel Coil", value: 41 }, { label: "Fasteners", value: 29 }, { label: "Rubber Seal", value: 18 }, { label: "Paint", value: 12 }]} /></ChartPanel>
      </section>
    </>
  );
}

function StorePage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Store</div><h2>Inventory and material availability</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="FG Stock" value="1,830" target="2,000" variance="-170" status="Warning" trend="down" />
        <KpiCard title="Stock-out Risk" value="6" target="3" variance="+3" status="Warning" trend="down" />
        <KpiCard title="GRN Status" value="94%" target="96%" variance="-2%" status="Good" trend="up" />
        <KpiCard title="Delivery Accuracy" value="95.2%" target="97%" variance="-1.8%" status="Warning" trend="down" />
      </section>
    </>
  );
}

function MaintenancePage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Maintenance</div><h2>Machine health and preventive maintenance</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="Preventive Maintenance" value="86%" target="95%" variance="-9%" status="Warning" trend="down" />
        <KpiCard title="Breakdown Frequency" value="6" target="4" variance="+2" status="Warning" trend="down" />
        <KpiCard title="MTTR" value="4.6h" target="3h" variance="+1.6h" status="Critical" trend="down" />
        <KpiCard title="MTBF" value="38h" target="45h" variance="-7h" status="Warning" trend="down" />
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title=" Breakdown Pareto" subtitle="Top failure drivers"><ParetoList data={[{ label: "Bearing", value: 35 }, { label: "Hydraulic", value: 25 }, { label: "Drive belt", value: 22 }, { label: "Sensor", value: 18 }]} /></ChartPanel>
        <ChartPanel title="Machine Health Matrix" subtitle="Status by machine"><HorizontalBar values={[90, 72, 58, 82, 67]} labels={["M-01", "M-02", "M-04", "M-05", "M-07"]} /></ChartPanel>
      </section>
    </>
  );
}

function NpdPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">NPD / Design / R&D</div><h2>Engineering and development controls</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="Drawing Release" value="3.2 days" target="2 days" variance="+1.2 days" status="Warning" trend="down" />
        <KpiCard title="ECR Closure" value="78%" target="90%" variance="-12%" status="Warning" trend="down" />
        <KpiCard title="BOM Accuracy" value="96.4%" target="98%" variance="-1.6%" status="Warning" trend="down" />
        <KpiCard title="Design Errors" value="11" target="8" variance="+3" status="Attention" trend="down" />
      </section>
    </>
  );
}

function HrPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">HR</div><h2>Workforce, attendance and training</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="Attendance" value="96.8%" target="98%" variance="-1.2%" status="Warning" trend="down" />
        <KpiCard title="Attrition Rate" value="3.1%" target="2.8%" variance="+0.3%" status="Warning" trend="down" />
        <KpiCard title="Training Completion" value="92%" target="95%" variance="-3%" status="Warning" trend="down" />
        <KpiCard title="Employee Availability" value="91.4%" target="95%" variance="-3.6%" status="Warning" trend="down" />
      </section>
    </>
  );
}

function SafetyPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Safety</div><h2>Safety and compliance</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="Safety Training" value="94%" target="100%" variance="-6%" status="Warning" trend="down" />
        <KpiCard title="Near Miss" value="4" target="2" variance="+2" status="Warning" trend="down" />
        <KpiCard title="Audit Score" value="87%" target="92%" variance="-5%" status="Warning" trend="down" />
        <KpiCard title="Lost Time Injury" value="1" target="0" variance="+1" status="Critical" trend="down" />
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Safety Rules" subtitle="Compliance"><div className="mini-list"><div>PPE usage • 96%</div><div>Machine guarding • 91%</div><div>Lockout tagout • 90%</div><div>Hot work permits • 93%</div></div></ChartPanel>
        <ChartPanel title="Incident Trend" subtitle="Last 6 months"><LineChartSeries values={[2, 3, 1, 2, 3, 1]} /></ChartPanel>
      </section>
    </>
  );
}

function LogisticsPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Logistics / Dispatch</div><h2>Dispatch and delivery tracking</h2></div></section>
      <section className="kpi-grid">
        <KpiCard title="Today's Dispatch Plan" value="1,240" target="1,300" variance="-60" status="Warning" trend="down" />
        <KpiCard title="Actual Dispatch" value="1,160" target="1,300" variance="-140" status="Warning" trend="down" />
        <KpiCard title="Delivery Accuracy" value="94.8%" target="97%" variance="-2.2%" status="Warning" trend="down" />
        <KpiCard title="Pending Dispatch" value="23" target="15" variance="+8" status="Attention" trend="down" />
      </section>
    </>
  );
}

function FiveSPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">5S</div><h2>5S compliance and operational discipline</h2></div></section>
      <section className="gauge-grid">
        <GaugeCard title="Sort" value={86} color="#60a5fa" />
        <GaugeCard title="Set in Order" value={91} color="#67e8f9" />
        <GaugeCard title="Shine" value={89} color="#6ee7b7" />
        <GaugeCard title="Overall 5S" value={88} color="#fbbf24" large />
      </section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Audit Comments" subtitle="Spot observations"><div className="mini-list"><div>Storage labels missing in bay 3.</div><div>Tool rack not standardized.</div><div>Near misses due to poor housekeeping.</div></div></ChartPanel>
        <ChartPanel title="Stage-wise Scores" subtitle="Audit scorecard"><BarChartSeries values={[86, 91, 89, 84, 88]} labels={["Sort", "Set", "Shine", "Standardize", "Sustain"]} /></ChartPanel>
      </section>
    </>
  );
}

function KpiPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">KPI & Reports</div><h2>Cross-department KPI scorecards</h2></div></section>
      <section className="scorecard-list">
        <KpiScorecard title="Production" target="90%" actual="84.2%" achievement="93.6%" status="Warning" owner="Production Manager" />
        <KpiScorecard title="Quality" target="98.5%" actual="98.1%" achievement="99.6%" status="Good" owner="Quality Manager" />
        <KpiScorecard title="Cost" target="100" actual="94" achievement="94%" status="Warning" owner="Finance" />
        <KpiScorecard title="Safety" target="100%" actual="96%" achievement="96%" status="Good" owner="Safety Officer" />
      </section>
    </>
  );
}

function ActionsPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Pending Actions</div><h2>Top 10 pending actions</h2></div></section>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Action</th>
              <th>Department</th>
              <th>Owner</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Days Pending</th>
            </tr>
          </thead>
          <tbody>
            {actionRows.map((row) => (
              <tr key={`${row.action}-${row.owner}`}>
                <td><span className={`priority priority--${row.priority.toLowerCase()}`}>{row.priority}</span></td>
                <td>{row.action}</td>
                <td>{row.department}</td>
                <td>{row.owner}</td>
                <td>{row.due}</td>
                <td>{row.status}</td>
                <td>{row.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DataImportPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Data Import</div><h2>Upload, validate and map incoming data</h2></div></section>
      <section className="import-steps">
        {['Upload file', 'Detect columns', 'Preview rows', 'Map columns', 'Validate', 'Import', 'Refresh dashboard'].map((step, index) => (
          <div className="step-card" key={step}><span>{index + 1}</span>{step}</div>
        ))}
      </section>
      <section className="panel inline-upload">
        <div className="upload-box">
          <div className="upload-icon">⇪</div>
          <div>
            <strong>Drop Excel / CSV</strong>
            <p>Upload production, quality, PPC or maintenance data.</p>
          </div>
        </div>
        <div className="upload-actions">
          <button type="button" className="btn btn--primary">Upload File</button>
          <button type="button" className="btn">Download Sample Template</button>
        </div>
      </section>
    </>
  );
}

function GoogleFormsPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Google Forms</div><h2>Department-wise data collection</h2></div></section>
      <section className="form-grid">
        {['Production', 'Quality', 'PPC', 'SCM', 'Store', 'Maintenance', 'NPD', 'HR', 'Safety', 'Logistics'].map((label) => (
          <div className="form-card" key={label}><strong>{label}</strong><button type="button" className="btn btn--tiny">Open Form</button></div>
        ))}
      </section>
    </>
  );
}

function ReportsPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Reports</div><h2>Trend analysis and management reports</h2></div></section>
      <section className="content-grid content-grid--two">
        <ChartPanel title="Production report" subtitle="Monthly performance"><BarChartSeries values={[68, 72, 79, 85, 81, 88, 93]} labels={["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"]} /></ChartPanel>
        <ChartPanel title="Quality report" subtitle="PPM trend"><LineChartSeries values={[1200, 980, 760, 670, 540, 500]} /></ChartPanel>
      </section>
    </>
  );
}

function SettingsPage({ filters }: { filters: FilterState }) {
  return (
    <>
      <section className="page-header"><div><div className="page-header__eyebrow">Settings</div><h2>Dashboard configuration</h2></div></section>
      <div className="panel settings-list">
        <div><label><input type="checkbox" defaultChecked /> Executive mode</label></div>
        <div><label><input type="checkbox" defaultChecked /> Live data refresh</label></div>
        <div><label><input type="checkbox" defaultChecked /> KPI alerts</label></div>
        <div><label><input type="checkbox" /> Demo mode</label></div>
      </div>
    </>
  );
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="panel chart-panel">
      <div className="chart-panel__header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  target,
  variance,
  status,
  trend,
}: {
  title: string;
  value: string;
  target: string;
  variance: string;
  status: string;
  trend: "up" | "down";
}) {
  return (
    <div className="panel kpi-card">
      <div className="kpi-card__header">
        <span className="kpi-card__title">{title}</span>
        <span className={`status-pill status-pill--${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
      </div>
      <div className="kpi-card__value">{value}</div>
      <div className="kpi-card__meta">
        <span>Target {target}</span>
        <span className={trend === "up" ? "trend trend--up" : "trend trend--down"}>{trend === "up" ? "↑" : "↓"} {variance}</span>
      </div>
      <Sparkline values={[44, 52, 46, 58, 60, 62, 69, 74]} />
    </div>
  );
}

function GaugeCard({ title, value, color, large = false }: { title: string; value: number; color: string; large?: boolean }) {
  return (
    <div className="panel gauge-card">
      <div className="gauge-card__title">{title}</div>
      <div className="gauge-card__wrapper">
        <div className="gauge-ring" style={{ background: `conic-gradient(${color} 0 ${value}%, rgba(148,163,184,0.2) ${value}% 100%)` }}>
          <div className="gauge-ring__disc">
            <span>{value.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / Math.max(max - min, 1)) * 80 - 10;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 30" className="sparkline" preserveAspectRatio="none" aria-label="trend sparkline">
      <polyline points={points} fill="none" stroke="#7dd3fc" strokeWidth="2.5" />
    </svg>
  );
}

function BarChartSeries({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values, 100);

  return (
    <div className="chart-grid">
      {values.map((value, index) => (
        <div key={`${labels[index]}-${value}`} className="chart-bar-group">
          <div className="chart-bar-wrap">
            <div className="chart-bar" style={{ height: `${(value / max) * 100}%` }} />
          </div>
          <div className="chart-label">{labels[index]}</div>
        </div>
      ))}
    </div>
  );
}

function LineChartSeries({ values }: { values: number[] }) {
  const max = Math.max(...values) + 10;
  const min = Math.min(...values) - 10;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / Math.max(max - min, 1)) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 40" className="line-chart" preserveAspectRatio="none" aria-label="line chart">
      <polyline points={points} fill="none" stroke="#7dd3fc" strokeWidth="2" />
    </svg>
  );
}

function HorizontalBar({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values, 100);
  return (
    <div className="horizontal-bars">
      {values.map((value, index) => (
        <div className="horizontal-bar-row" key={`${labels[index]}-${value}`}>
          <span>{labels[index]}</span>
          <div className="horizontal-bar-track">
            <div className="horizontal-bar-fill" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <strong>{value}%</strong>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ value, color }: { value: number; color: string }) {
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${color} 0 ${value}%, rgba(148,163,184,0.18) ${value}% 100%)` }}>
        <div className="donut__inner">{value.toFixed(1)}%</div>
      </div>
    </div>
  );
}

function ParetoList({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((item) => item.value), 100);
  return (
    <div className="pareto-list">
      {data.map((item) => (
        <div key={item.label} className="pareto-row">
          <div className="pareto-row__label">
            <span>{item.label}</span>
            <strong>{item.value}%</strong>
          </div>
          <div className="pareto-track">
            <div className="pareto-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiScorecard({ title, target, actual, achievement, status, owner }: { title: string; target: string; actual: string; achievement: string; status: string; owner: string }) {
  return (
    <div className="panel scorecard-row">
      <div className="scorecard-row__title">{title}</div>
      <div className="scorecard-row__values">
        <span>Target: {target}</span>
        <span>Actual: {actual}</span>
        <span>Achievement: {achievement}</span>
      </div>
      <div className="scorecard-row__meta">
        <span className={`status-pill status-pill--${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
        <span>Owner: {owner}</span>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppView />
    </AuthProvider>
  );
}

export default App;
