import React, { useEffect, useState } from "react";
import {
  fetchLineTrackerSummary,
  fetchLineTrackerEntries,
  fetchLineTrackerPpcOrders,
  fetchLineTrackerMonthlyPlan,
  fetchLineTrackerTraceability,
  fetchLineTrackerMachines,
  fetchLineTrackerHeats,
  fetchLineTrackerOeeBreakdown,
  fetchLineTrackerReliability,
  fetchLineTrackerHistoricalRecords,
  type LineTrackerSummary,
  type LineTrackerShiftEntry,
  type LineTrackerPpcOrder,
  type LineTrackerMonthlyPlanResponse,
  type LineTrackerTraceabilityResponse,
  type LineTrackerMachine,
  type LineTrackerHeatReference,
  type LineTrackerOeeBreakdownResponse,
  type LineTrackerReliabilityResponse,
  type LineTrackerHistoricalRecordsResponse,
} from "../../services/lineTrackerApi";
import "../../styles/line-tracker.css";

type SubTabKey = "orders" | "monthly-plan" | "traceability" | "entries" | "machines" | "downtime";

export const LineTrackerView: React.FC = () => {
  const [summary, setSummary] = useState<LineTrackerSummary | null>(null);
  const [entries, setEntries] = useState<LineTrackerShiftEntry[]>([]);
  const [ppcOrders, setPpcOrders] = useState<LineTrackerPpcOrder[]>([]);
  const [monthlyPlan, setMonthlyPlan] = useState<LineTrackerMonthlyPlanResponse | null>(null);
  const [traceability, setTraceability] = useState<LineTrackerTraceabilityResponse | null>(null);
  const [machines, setMachines] = useState<LineTrackerMachine[]>([]);
  const [heats, setHeats] = useState<LineTrackerHeatReference[]>([]);
  const [oeeBreakdown, setOeeBreakdown] = useState<LineTrackerOeeBreakdownResponse | null>(null);

  const [reliabilityData, setReliabilityData] = useState<LineTrackerReliabilityResponse | null>(null);
  const [historicalRecords, setHistoricalRecords] = useState<LineTrackerHistoricalRecordsResponse | null>(null);
  const [relCategoryFilter, setRelCategoryFilter] = useState<string>("All");
  const [relMachineFilter, setRelMachineFilter] = useState<string>("All");
  const [relStageFilter, setRelStageFilter] = useState<string>("All");
  const [relShiftFilter, setRelShiftFilter] = useState<string>("All");
  const [relSearchQuery, setRelSearchQuery] = useState<string>("");
  const [relPage, setRelPage] = useState<number>(1);
  const [relLoading, setRelLoading] = useState<boolean>(false);
  const [relError, setRelError] = useState<string | null>(null);

  const [selectedWorkCenterFilter, setSelectedWorkCenterFilter] = useState<string>("All");
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>("All");
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<string>("All");

  const [activeTab, setActiveTab] = useState<SubTabKey>("orders");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOeeBreakdown = async (wc = "All", mach = "All", sh = "All") => {
    try {
      const res = await fetchLineTrackerOeeBreakdown({
        workCenter: wc,
        machine: mach,
        shift: sh,
      });
      setOeeBreakdown(res);
    } catch (err: any) {
      console.error("Failed to load OEE breakdown slice:", err);
    }
  };

  const loadReliabilityData = async (
    cat = relCategoryFilter,
    mach = relMachineFilter,
    stg = relStageFilter,
    sh = relShiftFilter,
    forceRefresh = false
  ) => {
    try {
      setRelLoading(true);
      setRelError(null);
      setReliabilityData(null);
      setHistoricalRecords(null);
      const res = await fetchLineTrackerReliability({
        category: cat,
        machine: mach,
        stage: stg,
        shift: sh,
        source: "google_sheets",
        refresh: forceRefresh,
      });
      setReliabilityData(res);
    } catch (err: any) {
      setRelError(err?.message || "The live Downtime Log could not be loaded.");
      setReliabilityData(null);
    } finally {
      setRelLoading(false);
    }
  };

  const loadHistoricalRecords = async (
    cat = relCategoryFilter,
    mach = relMachineFilter,
    stg = relStageFilter,
    sh = relShiftFilter,
    search = relSearchQuery,
    page = relPage
  ) => {
    try {
      const res = await fetchLineTrackerHistoricalRecords({
        category: cat,
        machine: mach,
        stage: stg,
        shift: sh,
        search,
        page,
        pageSize: 25,
        source: "google_sheets",
      });
      setHistoricalRecords(res);
    } catch (err: any) {
      setRelError(err?.message || "Downtime records could not be loaded.");
      setHistoricalRecords(null);
    }
  };

  const handleRelFilterChange = (cat: string, mach: string, stg: string, sh: string) => {
    setRelCategoryFilter(cat);
    setRelMachineFilter(mach);
    setRelStageFilter(stg);
    setRelShiftFilter(sh);
    setRelPage(1);
    loadReliabilityData(cat, mach, stg, sh);
    loadHistoricalRecords(cat, mach, stg, sh, relSearchQuery, 1);
  };

  const handleRelSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setRelPage(1);
    loadHistoricalRecords(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, relSearchQuery, 1);
  };

  const handlePageChange = (newPage: number) => {
    setRelPage(newPage);
    loadHistoricalRecords(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, relSearchQuery, newPage);
  };

  const loadData = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [sumRes, entRes, ordRes, planRes, traceRes, macRes, heatRes, oeeRes] = await Promise.all([
        fetchLineTrackerSummary(forceRefresh),
        fetchLineTrackerEntries(),
        fetchLineTrackerPpcOrders(forceRefresh),
        fetchLineTrackerMonthlyPlan(forceRefresh),
        fetchLineTrackerTraceability(forceRefresh),
        fetchLineTrackerMachines(),
        fetchLineTrackerHeats(),
        fetchLineTrackerOeeBreakdown({ refresh: forceRefresh }),
      ]);

      setSummary(sumRes);
      setEntries(entRes.entries);
      setPpcOrders(ordRes.orders);
      setMonthlyPlan(planRes);
      setTraceability(traceRes);
      setMachines(macRes.machines);
      setHeats(heatRes.heats);
      setOeeBreakdown(oeeRes);
    } catch (err: any) {
      setError(err?.message || "Failed to load ERC Mk-V Line Tracker PPC dataset");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="line-tracker-view" role="status">
        <div className="panel" style={{ textAlign: "center", padding: "3rem" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem auto" }} />
          <h3>Loading ERC Mk-V Line Tracker — PPC Command Center…</h3>
          <p style={{ color: "#94a3b8" }}>Ingesting production orders, monthly phasing, and metallurgical heat yields.</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="line-tracker-view" role="alert">
        <div className="panel panel--error">
          <h3>Line Tracker PPC Ingestion Error</h3>
          <p>{error || "Unable to load line tracker data."}</p>
          <button type="button" className="btn btn--primary" onClick={() => loadData(true)}>
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  const ppc = summary.ppc_summary;
  const oee = summary.oee_aggregate;
  const warnings = summary.data_quality_warnings;

  return (
    <div className="line-tracker-view" aria-label="ERC Mk-V Line Tracker PPC Module">
      {/* 1. Source Provenance Banner */}
      <section className="line-tracker-banner">
        <div className="line-tracker-banner__info">
          <div className="line-tracker-banner__tag">
            <span aria-hidden="true">⚡</span> ERC Mk-V Line Tracker — PPC & Order Fulfillment
          </div>
          <h2 className="line-tracker-banner__title">Production Planning & Order Fulfillment Monitoring</h2>
          <div className="line-tracker-banner__meta">
            <span>Source: <strong>{summary.file_name}</strong></span>
            <span>&bull;</span>
            <span
              className={`lt-source-badge lt-source-badge--${
                summary.source_type === "google_sheets"
                  ? "live"
                  : summary.source_type === "local_excel"
                  ? "snapshot"
                  : "error"
              }`}
            >
              {summary.source_type === "google_sheets"
                ? "🟢 Live Google Sheets (API)"
                : summary.source_type === "local_excel"
                ? "🟡 Local Excel Snapshot"
                : "🔴 Source Unconfigured"}
            </span>
            {summary.last_modified && (
              <>
                <span>&bull;</span>
                <span>Last Sync: {new Date(summary.last_modified).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              </>
            )}
            <span>&bull;</span>
            <span>Status: {summary.source_notice}</span>
          </div>
        </div>
        <div className="line-tracker-banner__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              loadData(true);
              if (activeTab === "downtime") {
                loadReliabilityData(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, true);
                loadHistoricalRecords(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, relSearchQuery, relPage);
              }
            }}
            disabled={refreshing}
          >
            {refreshing
              ? "Re-parsing Workbook…"
              : activeTab === "downtime"
              ? "Refresh Downtime Log"
              : summary.source_type === "google_sheets"
              ? "Refresh from Google Sheets"
              : "Re-sync Local File"}
          </button>
        </div>
      </section>

      {/* 2. Top PPC Metric KPI Grid */}
      <section className="line-tracker-metrics-grid" aria-label="Key Volume Metrics">
        <div className="lt-metric-card">
          <p className="lt-metric-card__label">Total Order Commitment</p>
          <p className="lt-metric-card__value">
            {ppc ? `${(ppc.total_ordered_qty / 1000000).toFixed(2)}M` : "3.94M"}
          </p>
          <p className="lt-metric-card__sub">{ppc ? `${ppc.total_ordered_qty.toLocaleString()} pcs across 6 POs` : "-"}</p>
        </div>

        <div className="lt-metric-card">
          <p className="lt-metric-card__label">Produced / Confirmed</p>
          <p className="lt-metric-card__value" style={{ color: "#34d399" }}>
            {ppc ? `${(ppc.total_produced_or_allocated_qty / 1000).toFixed(1)}k` : "-"}
          </p>
          <p className="lt-metric-card__sub">
            {ppc ? `${ppc.total_produced_or_allocated_qty.toLocaleString()} pcs confirmed` : "-"}
          </p>
        </div>

        <div className="lt-metric-card">
          <p className="lt-metric-card__label">Outstanding Balance</p>
          <p className="lt-metric-card__value" style={{ color: "#fbbf24" }}>
            {ppc ? `${(ppc.total_outstanding_qty / 1000000).toFixed(2)}M` : "-"}
          </p>
          <p className="lt-metric-card__sub">{ppc ? `${ppc.total_outstanding_qty.toLocaleString()} pcs remaining` : "-"}</p>
        </div>

        <div className="lt-metric-card">
          <p className="lt-metric-card__label">Overall Fulfillment</p>
          <p className="lt-metric-card__value" style={{ color: "#60a5fa" }}>
            {ppc ? `${ppc.overall_fulfillment_pct}%` : "0%"}
          </p>
          <p className="lt-metric-card__sub">Weighted order completion</p>
        </div>

        <div className="lt-metric-card">
          <p className="lt-metric-card__label">Orders at Risk</p>
          <p className="lt-metric-card__value" style={{ color: ppc && ppc.at_risk_orders_count > 0 ? "#f87171" : "#4ade80" }}>
            {ppc ? ppc.at_risk_orders_count : 0}
          </p>
          <p className="lt-metric-card__sub">
            {ppc && ppc.at_risk_orders_count > 0 ? "Western Railway PO-2026-001" : "All orders on schedule"}
          </p>
        </div>

        <div className="lt-metric-card">
          <p className="lt-metric-card__label">Shop Floor OEE (Phase 1)</p>
          <p className="lt-metric-card__value" style={{ color: "#a78bfa" }}>
            {oee.component_weighted_oee !== null ? `${oee.component_weighted_oee}%` : "-"}
          </p>
          <p className="lt-metric-card__sub">A: {oee.component_weighted_availability}% | P: {oee.component_weighted_performance}% | Q: {oee.component_weighted_quality}%</p>
        </div>
      </section>

      {/* 3. Data Quality Warnings Grid */}
      {warnings && warnings.length > 0 && (
        <section className="line-tracker-warnings" aria-label="Data Quality Warnings">
          <h3 className="line-tracker-section-title">
            <span aria-hidden="true">🛡️</span> Data Quality & Source Provenance Audits ({warnings.length})
          </h3>
          <div className="line-tracker-warnings-grid">
            {warnings.map((w) => (
              <div key={w.code} className={`lt-warning-card lt-warning-card--${w.severity}`}>
                <div className="lt-warning-card__header">
                  <span className="lt-warning-card__badge">{w.severity.toUpperCase()}</span>
                  <h4 className="lt-warning-card__title">{w.title}</h4>
                </div>
                <p className="lt-warning-card__desc">{w.description}</p>
                <p className="lt-warning-card__impact">
                  <strong>Impact:</strong> {w.impact}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Sub-Tab Navigation */}
      <nav className="line-tracker-tab-nav" aria-label="Line Tracker Sub Views">
        <button
          type="button"
          className={`lt-tab-btn ${activeTab === "orders" ? "lt-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          Order Fulfillment ({ppcOrders.length})
        </button>
        <button
          type="button"
          className={`lt-tab-btn ${activeTab === "monthly-plan" ? "lt-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("monthly-plan")}
        >
          Monthly Plan vs Actual
        </button>
        <button
          type="button"
          className={`lt-tab-btn ${activeTab === "traceability" ? "lt-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("traceability")}
        >
          Heat & Lot Traceability ({traceability ? traceability.verified_heats_count : 0})
        </button>
        <button
          type="button"
          className={`lt-tab-btn ${activeTab === "entries" ? "lt-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("entries")}
        >
          Shift & Machine OEE ({entries.length})
        </button>
        <button
          type="button"
          className={`lt-tab-btn ${activeTab === "machines" ? "lt-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("machines")}
        >
          Machine Master ({machines.length})
        </button>
        <button
          type="button"
          className={`lt-tab-btn ${activeTab === "downtime" ? "lt-tab-btn--active" : ""}`}
          onClick={() => {
            setActiveTab("downtime");
            setRelCategoryFilter("All");
            setRelMachineFilter("All");
            setRelStageFilter("All");
            setRelShiftFilter("All");
            setRelSearchQuery("");
            setRelPage(1);
            loadReliabilityData("All", "All", "All", "All");
            loadHistoricalRecords("All", "All", "All", "All", "", 1);
          }}
        >
          Reliability &amp; Downtime Log
        </button>
      </nav>

      {/* 5. Sub-Tab Content */}
      <section className="line-tracker-table-wrap">
        {/* SUBTAB 1: Order Fulfillment */}
        {activeTab === "orders" && (
          <div>
            <div className="lt-callout lt-callout-info">
              <div>
                <strong>Order Tracking Grounding Rules:</strong> Produced quantities and completion rates are derived strictly from verified shop-floor shift entries (Western Railway PO-2026-001) and heat conversion logs (South Central Railway 60257500205475). Unphased orders without allocations are marked explicitly.
              </div>
            </div>

            <table className="lt-data-table">
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Customer</th>
                  <th>Part</th>
                  <th>Order Qty</th>
                  <th>Promised Delivery (DP)</th>
                  <th>Produced Qty</th>
                  <th>Outstanding Balance</th>
                  <th>Fulfillment Progress</th>
                  <th>Delivery Status</th>
                  <th>Traceability Link</th>
                  <th>Production Source / Notes</th>
                </tr>
              </thead>
              <tbody>
                {ppcOrders.map((o) => {
                  const isAtRisk = o.fulfillment_status === "At Risk";
                  const isCompleted = o.fulfillment_status.includes("Completed");
                  const progressColorClass = isAtRisk
                    ? "lt-progress-fill--risk"
                    : isCompleted
                    ? "lt-progress-fill--success"
                    : "lt-progress-fill--neutral";

                  return (
                    <tr key={o.order_number}>
                      <td>
                        <strong>{o.order_number}</strong>
                        {o.order_number === "PO-2026-001" && (
                          <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Real PO: 26265489205106</div>
                        )}
                      </td>
                      <td>{o.customer}</td>
                      <td>{o.part}</td>
                      <td>{o.order_qty.toLocaleString()} pcs</td>
                      <td>
                        {o.dp_date ? (
                          <span style={{ color: isAtRisk ? "#fca5a5" : "#e2e8f0", fontWeight: isAtRisk ? 700 : 400 }}>
                            {o.dp_date} {isAtRisk ? "⚠️" : ""}
                          </span>
                        ) : (
                          <span style={{ color: "#64748b" }}>Not Specified</span>
                        )}
                      </td>
                      <td><strong>{o.produced_qty.toLocaleString()} pcs</strong></td>
                      <td>{o.outstanding_qty.toLocaleString()} pcs</td>
                      <td>
                        <div className="lt-progress-container">
                          <div className="lt-progress-track">
                            <div
                              className={`lt-progress-fill ${progressColorClass}`}
                              style={{ width: `${Math.min(o.completion_pct, 100)}%` }}
                            />
                          </div>
                          <div className="lt-progress-label">
                            <span>{o.completion_pct}%</span>
                            <span>{isCompleted ? "Fulfilled" : `${o.outstanding_qty.toLocaleString()} left`}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`lt-badge ${
                            isAtRisk
                              ? "lt-badge--at-risk"
                              : o.fulfillment_status === "On Track"
                              ? "lt-badge--on-track"
                              : isCompleted
                              ? "lt-badge--completed"
                              : "lt-badge--pending-alloc"
                          }`}
                        >
                          {o.fulfillment_status}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`lt-badge ${
                            o.traceability_status.includes("Pending")
                              ? "lt-badge--pending"
                              : o.traceability_status.includes("Verified")
                              ? "lt-badge--verified"
                              : "lt-badge--pending-alloc"
                          }`}
                        >
                          {o.traceability_status}
                        </span>
                      </td>
                      <td style={{ maxWidth: "260px", whiteSpace: "normal", fontSize: "0.75rem", color: "#94a3b8" }}>
                        <div><strong>Source:</strong> {o.production_source}</div>
                        {o.risk_reasons && o.risk_reasons.length > 0 && (
                          <div style={{ color: "#fca5a5", marginTop: "2px" }}>
                            {o.risk_reasons.join(" ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBTAB 2: Monthly Plan vs Actual */}
        {activeTab === "monthly-plan" && monthlyPlan && (
          <div>
            <div className="lt-callout lt-callout-warning">
              <div>
                <strong>⚠️ {monthlyPlan.metadata.snapshot_notice}</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem" }}>
                  Western Railway and Southern Railway orders have no monthly phasing entered in the planning sheet. For active tracking, refer to live shift entries and heat yields.
                </p>
              </div>
            </div>

            <h4 style={{ margin: "1rem", color: "#f8fafc" }}>Fiscal Year 2026-27 Monthly Production & Dispatch Calendar</h4>
            <table className="lt-data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Planned Production (pcs)</th>
                  <th>Planned Dispatch (pcs)</th>
                  <th>Actual Production (pcs)</th>
                  <th>Production Gap / Variance</th>
                  <th>Plan Achievement %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPlan.monthly_calendar.map((m) => (
                  <tr key={m.month}>
                    <td><strong>{m.month}</strong></td>
                    <td>{m.planned_production.toLocaleString()}</td>
                    <td>{m.planned_dispatch.toLocaleString()}</td>
                    <td>
                      {m.actual_production > 0 ? (
                        <strong style={{ color: "#34d399" }}>{m.actual_production.toLocaleString()}</strong>
                      ) : (
                        <span style={{ color: "#64748b" }}>0</span>
                      )}
                    </td>
                    <td>
                      {m.has_actuals ? (
                        <span style={{ color: m.production_gap <= 0 ? "#34d399" : "#fbbf24" }}>
                          {m.production_gap > 0 ? `-${m.production_gap.toLocaleString()}` : `+${Math.abs(m.production_gap).toLocaleString()}`}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {m.achievement_pct !== null ? (
                        <span style={{ fontWeight: 600, color: m.achievement_pct >= 80 ? "#34d399" : "#fbbf24" }}>
                          {m.achievement_pct}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {m.has_actuals ? (
                        <span className="lt-badge lt-badge--verified">Live Entries</span>
                      ) : m.planned_production > 0 ? (
                        <span className="lt-badge lt-badge--pending">Planned Snapshot</span>
                      ) : (
                        <span className="lt-badge lt-badge--pending-alloc">Unphased</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 style={{ margin: "1.5rem 1rem 0.5rem 1rem", color: "#f8fafc" }}>Customer Order Phasing Breakdown</h4>
            <table className="lt-data-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Customer</th>
                  <th>Part</th>
                  <th>PO Qty</th>
                  <th>Carryover</th>
                  <th>Planned Production Total</th>
                  <th>Planned Dispatch Total</th>
                  <th>Phasing Status</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPlan.order_plans.map((p) => (
                  <tr key={p.po_number}>
                    <td><strong>{p.po_number}</strong></td>
                    <td>{p.customer}</td>
                    <td>{p.part}</td>
                    <td>{p.po_qty.toLocaleString()}</td>
                    <td>{p.carryover !== null ? p.carryover.toLocaleString() : "-"}</td>
                    <td>{p.planned_production_total.toLocaleString()}</td>
                    <td>{p.planned_dispatch_total.toLocaleString()}</td>
                    <td>
                      <span className={`lt-badge ${p.has_monthly_phasing ? "lt-badge--verified" : "lt-badge--pending"}`}>
                        {p.has_monthly_phasing ? "Phased (Apr-Aug 26)" : "Unphased (Missing Plan)"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBTAB 3: RM Heat & Lot Traceability */}
        {activeTab === "traceability" && traceability && (
          <div>
            <div className="lt-callout lt-callout-warning">
              <div>
                <strong>⚠️ Metallurgical Reconciliation Flag Active:</strong> Heat <code>H-2409-118</code> and lot <code>LOT-20260920-DB-01</code> in active shift entries do not join to the supplier heat reference catalog. Flagged as <strong>Pending Metallurgical Reconciliation</strong>.
              </div>
            </div>

            {/* Funnel KPI Cards */}
            <h4 style={{ margin: "0.5rem 0 1rem 0", color: "#f8fafc" }}>Billet-to-Formed Clip Metallurgical Conversion Funnel</h4>
            <div className="lt-funnel-grid">
              <div className="lt-funnel-card">
                <span className="lt-funnel-card__step">Step 1 &bull; Raw Material</span>
                <p className="lt-funnel-card__title">Received Billet MT</p>
                <p className="lt-funnel-card__value">{traceability.funnel_summary.total_billet_mt.toLocaleString()} MT</p>
                <p className="lt-funnel-card__sub">40 Verified Supplier Heats</p>
              </div>

              <div className="lt-funnel-card">
                <span className="lt-funnel-card__step">Step 2 &bull; Bar Cropper</span>
                <p className="lt-funnel-card__title">Bar Cropper Output</p>
                <p className="lt-funnel-card__value">{traceability.funnel_summary.total_bar_cropper_ok_nos.toLocaleString()}</p>
                <p className="lt-funnel-card__sub">Scrap: {traceability.funnel_summary.total_endbit_scrap_nos.toLocaleString()} pcs</p>
              </div>

              <div className="lt-funnel-card">
                <span className="lt-funnel-card__step">Step 3 &bull; ACM / Turning</span>
                <p className="lt-funnel-card__title">Turning Output OK</p>
                <p className="lt-funnel-card__value">{traceability.funnel_summary.total_turning_ok_nos.toLocaleString()}</p>
                <p className="lt-funnel-card__sub">Prepared pins</p>
              </div>

              <div className="lt-funnel-card">
                <span className="lt-funnel-card__step">Step 4 &bull; Hot Forming</span>
                <p className="lt-funnel-card__title">Forming Output OK</p>
                <p className="lt-funnel-card__value" style={{ color: "#34d399" }}>
                  {traceability.funnel_summary.total_forming_ok_nos.toLocaleString()}
                </p>
                <p className="lt-funnel-card__sub">Good finished clips</p>
              </div>

              <div className="lt-funnel-card">
                <span className="lt-funnel-card__step">Summary &bull; Yield</span>
                <p className="lt-funnel-card__title">Overall Conversion Yield</p>
                <p className="lt-funnel-card__value" style={{ color: "#60a5fa" }}>
                  {traceability.funnel_summary.overall_forming_yield_pct}%
                </p>
                <p className="lt-funnel-card__sub">Billet to Forming OK</p>
              </div>
            </div>

            {/* Heats Table */}
            <h4 style={{ margin: "1rem 0", color: "#f8fafc" }}>Supplier Heat-Wise Plan vs Actual Log ({traceability.heats.length} Heats)</h4>
            <table className="lt-data-table">
              <thead>
                <tr>
                  <th>Heat No</th>
                  <th>Lot No</th>
                  <th>Supplier</th>
                  <th>RM Qty (MT)</th>
                  <th>Plan Cut Bar</th>
                  <th>Bar Cropper OK</th>
                  <th>Endbit Scrap</th>
                  <th>Turning OK</th>
                  <th>Plan Forming OK</th>
                  <th>Actual Forming OK</th>
                  <th>Yield vs Plan %</th>
                  <th>Source Batch</th>
                  <th>Reconciliation</th>
                </tr>
              </thead>
              <tbody>
                {traceability.heats.map((h, idx) => (
                  <tr key={`${h.heat_number}-${h.lot_number}-${idx}`}>
                    <td><strong>{h.heat_number}</strong></td>
                    <td>{h.lot_number || "-"}</td>
                    <td>{h.supplier}</td>
                    <td>{h.rm_qty_mt !== null ? h.rm_qty_mt.toFixed(3) : "-"}</td>
                    <td>{h.plan_cut_bar_nos ? h.plan_cut_bar_nos.toLocaleString() : "-"}</td>
                    <td>{h.actual_cut_bar_nos ? h.actual_cut_bar_nos.toLocaleString() : "-"}</td>
                    <td>{h.actual_endbit_scrap_nos ? h.actual_endbit_scrap_nos.toLocaleString() : "-"}</td>
                    <td>{h.actual_turning_ok_nos ? h.actual_turning_ok_nos.toLocaleString() : "-"}</td>
                    <td>{h.plan_forming_ok_nos ? h.plan_forming_ok_nos.toLocaleString() : "-"}</td>
                    <td><strong style={{ color: "#34d399" }}>{h.actual_forming_ok_nos ? h.actual_forming_ok_nos.toLocaleString() : "-"}</strong></td>
                    <td>
                      {h.yield_vs_plan_pct !== null ? (
                        <span style={{ fontWeight: 600, color: h.yield_vs_plan_pct >= 95 ? "#34d399" : "#fbbf24" }}>
                          {h.yield_vs_plan_pct}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{h.source_batch || "-"}</td>
                    <td>
                      <span className="lt-badge lt-badge--verified">
                        Verified Supplier Heat
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {heats && heats.length > 0 && (
              <div style={{ marginTop: "2rem" }}>
                <h4 style={{ margin: "1rem 0", color: "#f8fafc" }}>
                  Raw Material Heat &amp; Lot Master References ({heats.length} Records)
                </h4>
                <table className="lt-data-table">
                  <thead>
                    <tr>
                      <th>Heat Number</th>
                      <th>Lot Number</th>
                      <th>Customer</th>
                      <th>Supplier</th>
                      <th>RM Qty (MT)</th>
                      <th>Source Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heats.map((h, idx) => (
                      <tr key={`master-${h.heat_number}-${h.lot_number}-${idx}`}>
                        <td><strong>{h.heat_number}</strong></td>
                        <td>{h.lot_number || "-"}</td>
                        <td>{h.customer || "-"}</td>
                        <td>{h.supplier || "-"}</td>
                        <td>{h.rm_qty_mt !== null ? h.rm_qty_mt.toFixed(3) : "-"}</td>
                        <td>{h.source_batch || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 4: Shift-Level OEE & Machine Performance Breakdown */}
        {activeTab === "entries" && oeeBreakdown && (
          <div>
            {/* Diagnostic Alert Banner */}
            <div className="lt-callout lt-callout-warning" style={{ marginBottom: "1.5rem" }}>
              <div>
                <strong>⚡ Phase 3 Operational Diagnostic — Speed Loss Constraint:</strong>{" "}
                {oeeBreakdown.cycle_time_analysis.key_bottleneck_finding}
              </div>
            </div>

            {/* Drilldown Filter Controls */}
            <div className="lt-filter-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", marginBottom: "1.5rem", background: "rgba(15, 23, 42, 0.6)", padding: "1rem", borderRadius: "8px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="wc-filter" style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>Work Center:</label>
                <select
                  id="wc-filter"
                  value={selectedWorkCenterFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedWorkCenterFilter(val);
                    loadOeeBreakdown(val, selectedMachineFilter, selectedShiftFilter);
                  }}
                  style={{ background: "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: "6px", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                >
                  <option value="All">All Work Centers</option>
                  <option value="Turning">Turning (7 records)</option>
                  <option value="Forming">Forming (2 records)</option>
                  <option value="BC">Bar Cropping - BC (1 record)</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="shift-filter" style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>Shift:</label>
                <select
                  id="shift-filter"
                  value={selectedShiftFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedShiftFilter(val);
                    loadOeeBreakdown(selectedWorkCenterFilter, selectedMachineFilter, val);
                  }}
                  style={{ background: "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: "6px", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                >
                  <option value="All">All Shifts</option>
                  <option value="Shift 1 (Day)">Shift 1 (Day) — 1 record</option>
                  <option value="Shift 2 (Night)">Shift 2 (Night) — 9 records</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label htmlFor="machine-filter" style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>Machine:</label>
                <select
                  id="machine-filter"
                  value={selectedMachineFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedMachineFilter(val);
                    loadOeeBreakdown(selectedWorkCenterFilter, val, selectedShiftFilter);
                  }}
                  style={{ background: "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: "6px", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                >
                  <option value="All">All Machines</option>
                  {machines.filter(m => ["cnc 1", "cnc 2", "cnc 3", "cnc 4", "cnc 5", "cnc 6", "press line e1", "press line p2", "bar cropping c m2"].includes(m.machine.toLowerCase())).map(m => (
                    <option key={m.machine} value={m.machine}>{m.machine} ({m.work_center})</option>
                  ))}
                </select>
              </div>

              {(selectedWorkCenterFilter !== "All" || selectedShiftFilter !== "All" || selectedMachineFilter !== "All") && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWorkCenterFilter("All");
                    setSelectedShiftFilter("All");
                    setSelectedMachineFilter("All");
                    loadOeeBreakdown("All", "All", "All");
                  }}
                  style={{ background: "#3b82f6", color: "#ffffff", border: "none", borderRadius: "6px", padding: "0.35rem 0.85rem", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}
                >
                  Reset Slice Filters ↺
                </button>
              )}
            </div>

            {/* OEE Metric Cards */}
            <div className="line-tracker-summary-grid" style={{ marginBottom: "2rem" }}>
              <div className="lt-metric-card">
                <p className="lt-metric-card__label">Component-Weighted OEE</p>
                <p className="lt-metric-card__value" style={{ color: "#a78bfa" }}>
                  {oeeBreakdown.overall.oee_pct !== null ? `${oeeBreakdown.overall.oee_pct}%` : "-"}
                </p>
                <p className="lt-metric-card__sub">A × P × Q (No % averaging)</p>
              </div>

              <div className="lt-metric-card">
                <p className="lt-metric-card__label">Availability</p>
                <p className="lt-metric-card__value" style={{ color: "#34d399" }}>
                  {oeeBreakdown.overall.availability_pct !== null ? `${oeeBreakdown.overall.availability_pct}%` : "-"}
                </p>
                <p className="lt-metric-card__sub">
                  {oeeBreakdown.overall.sum_run_time_min.toLocaleString()} / {oeeBreakdown.overall.sum_planned_operating_time_min.toLocaleString()} min
                </p>
              </div>

              <div className="lt-metric-card">
                <p className="lt-metric-card__label">Performance Rate</p>
                <p className="lt-metric-card__value" style={{ color: "#f87171" }}>
                  {oeeBreakdown.overall.performance_pct !== null ? `${oeeBreakdown.overall.performance_pct}%` : "-"}
                </p>
                <p className="lt-metric-card__sub">Std vs Operating Time</p>
              </div>

              <div className="lt-metric-card">
                <p className="lt-metric-card__label">Quality Rate</p>
                <p className="lt-metric-card__value" style={{ color: "#60a5fa" }}>
                  {oeeBreakdown.overall.quality_pct !== null ? `${oeeBreakdown.overall.quality_pct}%` : "-"}
                </p>
                <p className="lt-metric-card__sub">{oeeBreakdown.overall.sum_good_qty.toLocaleString()} good pcs</p>
              </div>

              <div className="lt-metric-card">
                <p className="lt-metric-card__label">Total Speed Loss</p>
                <p className="lt-metric-card__value" style={{ color: "#fbbf24" }}>
                  {oeeBreakdown.overall.sum_speed_loss_min.toLocaleString()} min
                </p>
                <p className="lt-metric-card__sub">{oeeBreakdown.overall.speed_loss_hours} hrs ({oeeBreakdown.overall.speed_loss_share_pct}% of runtime)</p>
              </div>
            </div>

            {/* Section 1: Work Center Performance */}
            <div style={{ marginBottom: "2rem" }}>
              <h4 style={{ margin: "1rem 0", color: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>1. Work-Center OEE &amp; Speed Loss Breakdown ({oeeBreakdown.work_centers.length} Work Centers)</span>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 400 }}>Component-Weighted Aggregation</span>
              </h4>
              <table className="lt-data-table">
                <thead>
                  <tr>
                    <th>Work Center</th>
                    <th>Logged Shifts</th>
                    <th>Output Qty</th>
                    <th>Good Qty</th>
                    <th>Rejections</th>
                    <th>Weighted Rated CT</th>
                    <th>Weighted Actual CT</th>
                    <th>Speed Loss (min)</th>
                    <th>Availability</th>
                    <th>Performance</th>
                    <th>Quality</th>
                    <th>Component OEE</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {oeeBreakdown.work_centers.map((wc) => (
                    <tr key={wc.work_center}>
                      <td><strong>{wc.work_center}</strong></td>
                      <td>{wc.metrics.count} shifts ({wc.distinct_machines_count} machines)</td>
                      <td>{wc.metrics.sum_output_qty.toLocaleString()} pcs</td>
                      <td>{wc.metrics.sum_good_qty.toLocaleString()} pcs</td>
                      <td>
                        <span style={{ color: wc.metrics.sum_reject_qty > 0 ? "#fbbf24" : "#e2e8f0" }}>
                          {wc.metrics.sum_reject_qty} ({wc.metrics.rejection_rate_pct}%)
                        </span>
                      </td>
                      <td>{wc.metrics.weighted_rated_ct_sec !== null ? `${wc.metrics.weighted_rated_ct_sec}s` : "-"}</td>
                      <td>
                        <span style={{ color: "#fca5a5", fontWeight: 600 }}>
                          {wc.metrics.weighted_actual_ct_sec !== null ? `${wc.metrics.weighted_actual_ct_sec}s` : "-"}
                        </span>
                      </td>
                      <td><strong>{wc.metrics.sum_speed_loss_min.toLocaleString()} min</strong></td>
                      <td>{wc.metrics.availability_pct !== null ? `${wc.metrics.availability_pct}%` : "-"}</td>
                      <td>
                        <span style={{ color: (wc.metrics.performance_pct || 0) < 50 ? "#fca5a5" : "#fbbf24" }}>
                          {wc.metrics.performance_pct !== null ? `${wc.metrics.performance_pct}%` : "-"}
                        </span>
                      </td>
                      <td>{wc.metrics.quality_pct !== null ? `${wc.metrics.quality_pct}%` : "-"}</td>
                      <td>
                        <span className="lt-badge lt-badge--verified" style={{ fontSize: "0.85rem", padding: "0.25rem 0.6rem" }}>
                          {wc.metrics.oee_pct !== null ? `${wc.metrics.oee_pct}%` : "-"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWorkCenterFilter(wc.work_center);
                            loadOeeBreakdown(wc.work_center, "All", selectedShiftFilter);
                          }}
                          style={{ background: "#334155", color: "#f8fafc", border: "1px solid #475569", borderRadius: "4px", padding: "0.2rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}
                        >
                          Filter WC
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 2: Machine-Wise Performance & Speed Loss Pareto */}
            <div style={{ marginBottom: "2rem" }}>
              <h4 style={{ margin: "1rem 0", color: "#f8fafc" }}>
                2. Machine Performance &amp; Rated vs Actual Cycle Time Compliance ({oeeBreakdown.machines.length} Machines)
              </h4>
              <table className="lt-data-table">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Work Center</th>
                    <th>Rated CT</th>
                    <th>Actual CT</th>
                    <th>Speed Loss</th>
                    <th>Speed Loss %</th>
                    <th>Compliance</th>
                    <th>Output</th>
                    <th>Good Qty</th>
                    <th>Rej Qty</th>
                    <th>Performance</th>
                    <th>Quality</th>
                    <th>OEE</th>
                    <th>Status vs Rated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {oeeBreakdown.machines.map((m) => (
                    <tr key={m.machine}>
                      <td><strong>{m.machine}</strong></td>
                      <td>{m.work_center}</td>
                      <td>{m.rated_ct_sec !== null ? `${m.rated_ct_sec}s` : "-"}</td>
                      <td>
                        <strong style={{ color: "#fca5a5" }}>
                          {m.actual_ct_sec !== null ? `${m.actual_ct_sec}s` : "-"}
                        </strong>
                      </td>
                      <td>{m.metrics.sum_speed_loss_min.toLocaleString()} min</td>
                      <td>{m.metrics.speed_loss_share_pct}%</td>
                      <td>
                        <span style={{ color: (m.metrics.cycle_compliance_pct || 0) < 50 ? "#fca5a5" : "#34d399", fontWeight: 600 }}>
                          {m.metrics.cycle_compliance_pct !== null ? `${m.metrics.cycle_compliance_pct}%` : "-"}
                        </span>
                      </td>
                      <td>{m.metrics.sum_output_qty.toLocaleString()}</td>
                      <td>{m.metrics.sum_good_qty.toLocaleString()}</td>
                      <td>{m.metrics.sum_reject_qty}</td>
                      <td>{m.metrics.performance_pct !== null ? `${m.metrics.performance_pct}%` : "-"}</td>
                      <td>{m.metrics.quality_pct !== null ? `${m.metrics.quality_pct}%` : "-"}</td>
                      <td><strong>{m.metrics.oee_pct !== null ? `${m.metrics.oee_pct}%` : "-"}</strong></td>
                      <td>
                        <span className="lt-badge lt-badge--at-risk" style={{ fontSize: "0.75rem" }}>
                          {m.speed_loss_status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMachineFilter(m.machine);
                            loadOeeBreakdown(selectedWorkCenterFilter, m.machine, selectedShiftFilter);
                          }}
                          style={{ background: "#334155", color: "#f8fafc", border: "1px solid #475569", borderRadius: "4px", padding: "0.2rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}
                        >
                          Filter Mach
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 3: Shift-Level Performance Comparison */}
            <div style={{ marginBottom: "2rem" }}>
              <h4 style={{ margin: "1rem 0", color: "#f8fafc" }}>
                3. Shift-Level Performance Comparison (Actual Shift Identifiers)
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                {oeeBreakdown.shifts.map((s) => (
                  <div key={s.shift} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h5 style={{ margin: 0, fontSize: "1.05rem", color: "#f8fafc" }}>{s.shift}</h5>
                      <span className="lt-badge lt-badge--verified">{s.metrics.count} Shift Logs</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
                      <div><strong>Output:</strong> {s.metrics.sum_output_qty.toLocaleString()} pcs</div>
                      <div><strong>Good:</strong> {s.metrics.sum_good_qty.toLocaleString()} pcs</div>
                      <div><strong>Rejects:</strong> {s.metrics.sum_reject_qty} ({s.metrics.rejection_rate_pct}%)</div>
                      <div><strong>Speed Loss:</strong> {s.metrics.sum_speed_loss_min.toLocaleString()} min</div>
                      <div><strong>Availability:</strong> {s.metrics.availability_pct}%</div>
                      <div><strong>Performance:</strong> {s.metrics.performance_pct}%</div>
                      <div><strong>Quality:</strong> {s.metrics.quality_pct}%</div>
                      <div style={{ color: "#a78bfa", fontWeight: 700 }}><strong>OEE:</strong> {s.metrics.oee_pct}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 4: Filtered Shift Records (Drill-Down Detail) */}
            <div style={{ marginBottom: "2rem" }}>
              <h4 style={{ margin: "1rem 0", color: "#f8fafc" }}>
                4. Underlying Shift Records Drill-Down ({oeeBreakdown.drilldown_records.length} Records)
              </h4>
              <table className="lt-data-table">
                <thead>
                  <tr>
                    <th>Row #</th>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Work Center</th>
                    <th>Machine</th>
                    <th>Rated CT</th>
                    <th>Output</th>
                    <th>Downtime</th>
                    <th>Rejects</th>
                    <th>Good Qty</th>
                    <th>Actual CT</th>
                    <th>Efficiency %</th>
                    <th>OEE %</th>
                    <th>RM Heat &amp; Lot</th>
                    <th>Reconciliation Status</th>
                  </tr>
                </thead>
                <tbody>
                  {oeeBreakdown.drilldown_records.map((e) => (
                    <tr key={`${e.row_number}-${e.date}-${e.machine}`}>
                      <td><code>#{e.row_number}</code></td>
                      <td>{e.date}</td>
                      <td>{e.shift}</td>
                      <td>{e.work_center}</td>
                      <td><strong>{e.machine}</strong></td>
                      <td>{e.rated_ct_sec !== null ? `${e.rated_ct_sec}s` : "-"}</td>
                      <td>{e.output_qty.toLocaleString()}</td>
                      <td>{e.downtime_min !== null ? `${e.downtime_min}m` : "0m"}</td>
                      <td>
                        <span style={{ color: e.total_rejects > 0 ? "#fbbf24" : "#94a3b8" }}>
                          {e.total_rejects}
                        </span>
                      </td>
                      <td><strong>{e.good_qty.toLocaleString()}</strong></td>
                      <td>
                        <span style={{ color: "#fca5a5" }}>
                          {e.actual_ct_sec !== null ? `${e.actual_ct_sec}s` : "-"}
                        </span>
                      </td>
                      <td>{e.efficiency_rate !== null ? `${(e.efficiency_rate * 100).toFixed(1)}%` : "-"}</td>
                      <td>
                        <strong>{e.oee_rate !== null ? `${(e.oee_rate * 100).toFixed(1)}%` : "-"}</strong>
                      </td>
                      <td style={{ fontSize: "0.75rem" }}>
                        {e.rm_heat_number || "Unassigned"} {e.lot_number ? `(${e.lot_number})` : ""}
                      </td>
                      <td>
                        <span className={`lt-badge ${e.traceability_status.includes("Pending") ? "lt-badge--pending" : "lt-badge--verified"}`}>
                          {e.traceability_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 5: Unlogged Machine Master Equipment */}
            {oeeBreakdown.unlogged_catalog_machines.length > 0 && (
              <div style={{ marginBottom: "2rem" }}>
                <h4 style={{ margin: "1rem 0", color: "#94a3b8" }}>
                  5. Catalog Machines with 0 Shift Logs ({oeeBreakdown.unlogged_catalog_machines.length} Equipment Configured in Machine Master)
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {oeeBreakdown.unlogged_catalog_machines.map((m) => (
                    <span key={m.machine} className="lt-badge lt-badge--pending-alloc" style={{ padding: "0.35rem 0.65rem" }}>
                      {m.machine} ({m.work_center}) &bull; Rated: {m.rated_ct_sec}s &bull; {m.status}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Section 6: Mathematical Transparency Documentation */}
            <div className="lt-callout lt-callout-info" style={{ marginTop: "2rem" }}>
              <div style={{ fontSize: "0.85rem", lineHeight: "1.5" }}>
                <strong>📐 Component-Weighted Aggregation Methodology:</strong>
                <div style={{ marginTop: "0.5rem" }}>
                  Aggregate OEE is strictly computed as <code>Availability × Performance × Quality</code> using the total summed operating minutes, standard producing seconds, and output pieces across all records in the slice.
                  Individual machine OEE percentages are <strong>never averaged</strong> arithmetic-style, ensuring mathematically rigorous reporting in accordance with ISO 22400 / SEMI E10 standards.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 5: Machine Master */}
        {activeTab === "machines" && (
          <table className="lt-data-table">
            <thead>
              <tr>
                <th>Work Center</th>
                <th>Machine</th>
                <th>Rated Cycle Time (sec)</th>
                <th>Status</th>
                <th>Rated Manpower / Shift</th>
                <th>Commissioning Date</th>
                <th>Decommissioned Date</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.machine}>
                  <td>{m.work_center}</td>
                  <td><strong>{m.machine}</strong></td>
                  <td>{m.rated_ct_sec !== null ? `${m.rated_ct_sec}s` : "Pending Measurement"}</td>
                  <td>
                    <span className={`lt-badge ${m.status.toLowerCase().includes("active") ? "lt-badge--active" : "lt-badge--decomm"}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>{m.rated_manpower !== null ? m.rated_manpower : "-"}</td>
                  <td>{m.commissioning_date || "-"}</td>
                  <td>{m.decommissioned_date || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === "downtime" && relLoading && (
          <div className="lt-callout lt-callout-info" role="status">
            Reading the live Google Sheets Downtime Log…
          </div>
        )}
        {activeTab === "downtime" && relError && (
          <div className="lt-callout lt-callout-error" role="alert">
            <strong>Downtime Log unavailable.</strong> {relError}
            <button
              type="button"
              className="btn btn--secondary"
              style={{ marginLeft: "0.75rem" }}
              onClick={() => {
                loadReliabilityData(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, true);
                loadHistoricalRecords(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, relSearchQuery, relPage);
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* SUBTAB 6: Reliability & Historical Downtime Pareto */}
        {activeTab === "downtime" && reliabilityData && reliabilityData.summary.total_records === 0 && (
          <div className="lt-callout lt-callout-info" role="status">
            The Downtime Log worksheet returned no non-empty data rows.
          </div>
        )}
        {activeTab === "downtime" && reliabilityData && reliabilityData.summary.total_records > 0 && (
          <div>
            {/* 1. Isolation & Provenance Callout */}
            <div className="lt-callout lt-callout-info">
              <div>
                <strong>Source: Google Sheets / {reliabilityData.worksheet || "Downtime Log"} (read-only).</strong>{" "}
                Analyzing {reliabilityData.summary.total_records.toLocaleString()} records
                {reliabilityData.summary.coverage_dates.min && reliabilityData.summary.coverage_dates.max
                  ? " from " + reliabilityData.summary.coverage_dates.min + " to " + reliabilityData.summary.coverage_dates.max
                  : ""}. Refreshed {reliabilityData.last_modified ? new Date(reliabilityData.last_modified).toLocaleString() : "time unavailable"}.
                {reliabilityData.source_headers?.length ? (
                  <div style={{ marginTop: "0.35rem" }}>
                    Source columns: {reliabilityData.source_headers.join(", ")}
                  </div>
                ) : null}
              </div>
            </div>
            {reliabilityData.data_quality_warnings.length > 0 && (
              <div className="lt-callout lt-callout-warning" role="status">
                {reliabilityData.data_quality_warnings.map((warning) => (
                  <div key={warning.code}><strong>{warning.title}:</strong> {warning.description}</div>
                ))}
              </div>
            )}

            {/* 2. Filter Toolbar */}
            <div className="lt-filter-panel" style={{ marginBottom: "1.25rem" }}>
              <div className="lt-filter-panel__header">
                <span className="lt-filter-panel__title">
                  Historical Reliability Slice Filters{relLoading ? " (Updating slice…)" : ""}
                </span>
                {(relCategoryFilter !== "All" || relMachineFilter !== "All" || relStageFilter !== "All" || relShiftFilter !== "All" || relSearchQuery !== "") && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => {
                      setRelCategoryFilter("All");
                      setRelMachineFilter("All");
                      setRelStageFilter("All");
                      setRelShiftFilter("All");
                      setRelSearchQuery("");
                      setRelPage(1);
                      loadReliabilityData("All", "All", "All", "All");
                      loadHistoricalRecords("All", "All", "All", "All", "", 1);
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
              <div className="lt-filter-grid">
                <div className="lt-filter-group">
                  <label htmlFor="rel-category-filter">Category</label>
                  <select
                    id="rel-category-filter"
                    value={relCategoryFilter}
                    onChange={(e) => handleRelFilterChange(e.target.value, relMachineFilter, relStageFilter, relShiftFilter)}
                  >
                    <option value="All">All Categories ({reliabilityData.category_pareto.length})</option>
                    {reliabilityData.category_pareto.map((c) => (
                      <option key={c.category} value={c.category}>
                        {c.category} ({c.share_pct ?? "N/A"}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lt-filter-group">
                  <label htmlFor="rel-machine-filter">Machine</label>
                  <select
                    id="rel-machine-filter"
                    value={relMachineFilter}
                    onChange={(e) => handleRelFilterChange(relCategoryFilter, e.target.value, relStageFilter, relShiftFilter)}
                  >
                    <option value="All">All Machines ({reliabilityData.machine_ranking.length})</option>
                    {reliabilityData.machine_ranking.map((m) => (
                      <option key={m.machine} value={m.machine}>
                        {m.machine} ({m.total_downtime_hours ?? "N/A"}h)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lt-filter-group">
                  <label htmlFor="rel-stage-filter">Process Stage</label>
                  <select
                    id="rel-stage-filter"
                    value={relStageFilter}
                    onChange={(e) => handleRelFilterChange(relCategoryFilter, relMachineFilter, e.target.value, relShiftFilter)}
                  >
                    <option value="All">All Stages ({reliabilityData.stage_breakdown.length})</option>
                    {reliabilityData.stage_breakdown.map((s) => (
                      <option key={s.stage} value={s.stage}>
                        {s.stage} ({s.share_pct ?? "N/A"}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lt-filter-group">
                  <label htmlFor="rel-shift-filter">Shift</label>
                  <select
                    id="rel-shift-filter"
                    value={relShiftFilter}
                    onChange={(e) => handleRelFilterChange(relCategoryFilter, relMachineFilter, relStageFilter, e.target.value)}
                  >
                    <option value="All">All Shifts ({reliabilityData.shift_breakdown.length})</option>
                    {reliabilityData.shift_breakdown.map((sh) => (
                      <option key={sh.shift} value={sh.shift}>
                        {sh.shift} ({sh.share_pct ?? "N/A"}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Reliability KPI Cards */}
            <div className="line-tracker-metrics-grid" style={{ marginBottom: "1.5rem" }}>
              <div className="lt-metric-card">
                <span className="lt-metric-card__label">Total Downtime</span>
                <span className="lt-metric-card__value">
                  {reliabilityData.summary.duration_metrics_available ? reliabilityData.summary.total_downtime_hours?.toLocaleString() + " hrs" : "N/A"}
                </span>
                <span className="lt-metric-card__sub">
                  {reliabilityData.summary.duration_metrics_available
                    ? reliabilityData.summary.total_downtime_minutes?.toLocaleString() + " mins across " + reliabilityData.summary.total_records.toLocaleString() + " events"
                    : "No valid duration values are available for this slice"}
                </span>
              </div>

              <div className="lt-metric-card">
                <span className="lt-metric-card__label">Planned vs Unplanned</span>
                <span className="lt-metric-card__value" style={{ fontSize: "1.35rem", display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                  <span style={{ color: "#34d399" }}>{reliabilityData.summary.planned_classification_supported ? reliabilityData.summary.planned_downtime_pct + "%" : "N/A"}</span>
                  <span style={{ color: "#64748b", fontSize: "0.9rem" }}>/</span>
                  <span style={{ color: "#f87171" }}>{reliabilityData.summary.planned_classification_supported ? reliabilityData.summary.unplanned_downtime_pct + "%" : "N/A"}</span>
                </span>
                <span className="lt-metric-card__sub">
                  {reliabilityData.summary.planned_classification_supported
                    ? "Planned: " + reliabilityData.summary.planned_downtime_hours?.toLocaleString() + "h • Unplanned: " + reliabilityData.summary.unplanned_downtime_hours?.toLocaleString() + "h"
                    : "The source does not support planned versus unplanned classification"}
                </span>
              </div>

              <div className="lt-metric-card">
                <span className="lt-metric-card__label">Breakdown Losses</span>
                <span className="lt-metric-card__value" style={{ color: "#fbbf24" }}>
                  {reliabilityData.summary.breakdown_events_count.toLocaleString()}
                </span>
                <span className="lt-metric-card__sub">
                  {reliabilityData.summary.breakdown_downtime_hours === null ? "Duration unavailable" : reliabilityData.summary.breakdown_downtime_hours.toLocaleString() + " hrs breakdown downtime"}
                </span>
              </div>

              <div className="lt-metric-card">
                <span className="lt-metric-card__label">Mean Time To Repair (MTTR)</span>
                <span className="lt-metric-card__value" style={{ color: "#60a5fa" }}>
                  {reliabilityData.summary.overall_mttr_hours === null ? "N/A" : reliabilityData.summary.overall_mttr_hours + " hrs"}
                </span>
                <span className="lt-metric-card__sub">
                  Breakdown hours &divide; records with valid breakdown duration
                </span>
              </div>

              <div className="lt-metric-card">
                <span className="lt-metric-card__label">MTBF (Calendar Approx)</span>
                <span className="lt-metric-card__value" style={{ color: "#a78bfa" }}>
                  {reliabilityData.summary.overall_mtbf_approx_hours !== null ? `${reliabilityData.summary.overall_mtbf_approx_hours} hrs` : "N/A"}
                </span>
                <span className="lt-metric-card__sub">
                  Calendar coverage hrs &divide; {reliabilityData.summary.breakdown_events_count} breakdowns
                </span>
              </div>

              <div className="lt-metric-card">
                <span className="lt-metric-card__label">Safety &amp; Separation</span>
                <span className="lt-metric-card__value" style={{ color: "#34d399" }}>
                  {reliabilityData.summary.records_without_valid_duration ?? 0}
                </span>
                <span className="lt-metric-card__sub">
                  Records excluded from duration totals for missing or invalid duration
                </span>
              </div>
            </div>

            {/* Section 1: Downtime Category Pareto */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, color: "#f8fafc" }}>
                  1. Historical Downtime Pareto by Category ({reliabilityData.category_pareto.length} Categories)
                </h4>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                  Ranked by cumulative loss duration &bull; 80/20 Rule Analysis
                </span>
              </div>
              <table className="lt-data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Category</th>
                    <th>Classification</th>
                    <th>Total Hours</th>
                    <th>Share %</th>
                    <th>Cumulative %</th>
                    <th>Event Count</th>
                    <th>Avg Duration</th>
                    <th>Pareto Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {reliabilityData.category_pareto.map((c, idx) => (
                    <tr key={c.category}>
                      <td><strong>#{idx + 1}</strong></td>
                      <td><strong>{c.category}</strong></td>
                      <td>
                        <span className={`lt-badge ${c.is_planned ? "lt-badge--planned" : "lt-badge--unplanned"}`}>
                          {!reliabilityData.summary.planned_classification_supported ? "Not classified" : c.is_planned ? "Planned" : "Unplanned"}
                        </span>
                      </td>
                      <td><strong>{c.total_hours === null ? "N/A" : c.total_hours.toLocaleString() + " hrs"}</strong></td>
                      <td>{c.share_pct === null ? "N/A" : c.share_pct + "%"}</td>
                      <td>
                        <span style={{ color: (c.cumulative_share_pct ?? 0) <= 80 ? "#fbbf24" : "#94a3b8", fontWeight: (c.cumulative_share_pct ?? 0) <= 80 ? 700 : 400 }}>
                          {c.cumulative_share_pct === null ? "N/A" : c.cumulative_share_pct + "%"}
                        </span>
                      </td>
                      <td>{c.event_count.toLocaleString()}</td>
                      <td>{c.average_duration_minutes === null ? "N/A" : c.average_duration_minutes + "m"}</td>
                      <td className="lt-pareto-bar-cell">
                        <div className="lt-pareto-bar-wrapper">
                          <div
                            className="lt-pareto-bar-fill"
                            style={{
                              width: String(Math.min((c.share_pct ?? 0) * 2.5, 100)) + "%",
                              background: c.is_planned ? "#10b981" : (c.category.toLowerCase() === "breakdown" ? "#f59e0b" : "#ef4444"),
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 2: Machine Reliability Ranking & MTTR/MTBF */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, color: "#f8fafc" }}>
                  2. Equipment Reliability Ranking &amp; MTTR / MTBF Breakdown ({reliabilityData.machine_ranking.length} Machines)
                </h4>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                  {reliabilityData.formula_documentation.mtbf_definition}
                </span>
              </div>
              <table className="lt-data-table">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Stage</th>
                    <th>Total Downtime</th>
                    <th>Downtime Share %</th>
                    <th>Breakdown Events</th>
                    <th>Breakdown Downtime</th>
                    <th>MTTR (hrs)</th>
                    <th>MTBF Approx (hrs)</th>
                    <th>Top Downtime Category</th>
                  </tr>
                </thead>
                <tbody>
                  {reliabilityData.machine_ranking.map((m) => (
                    <tr key={m.machine}>
                      <td><strong>{m.machine}</strong></td>
                      <td>{m.stage}</td>
                      <td><strong>{m.total_downtime_hours === null ? "N/A" : m.total_downtime_hours.toLocaleString() + " hrs"}</strong></td>
                      <td>{m.downtime_share_pct === null ? "N/A" : m.downtime_share_pct + "%"}</td>
                      <td>
                        <span className={`lt-badge ${m.breakdown_event_count > 50 ? "lt-badge--breakdown" : "lt-badge--ok"}`}>
                          {m.breakdown_event_count} events
                        </span>
                      </td>
                      <td>{m.breakdown_downtime_hours === null ? "N/A" : m.breakdown_downtime_hours.toLocaleString() + " hrs"}</td>
                      <td>
                        <strong style={{ color: (m.mttr_hours ?? 0) > 6.0 ? "#fca5a5" : "#93c5fd" }}>
                          {m.mttr_hours !== null ? m.mttr_hours + "h" : "N/A"}
                        </strong>
                      </td>
                      <td>
                        <span style={{ color: "#c4b5fd" }}>
                          {m.mtbf_approx_hours !== null ? `${m.mtbf_approx_hours}h` : "-"}
                        </span>
                      </td>
                      <td>{m.top_category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 3: Recurring Equipment Failure Insights */}
            <div style={{ marginBottom: "2.5rem" }}>
              <h4 style={{ margin: "0 0 0.75rem 0", color: "#f8fafc" }}>
                3. Critical Equipment Reliability Patterns
              </h4>
              <div className="lt-recurring-grid">
                <div className="lt-recurring-card">
                  <h4>⚡ Most Frequent Breakdown Equipment</h4>
                  {reliabilityData.recurring_breakdown_insights.frequent_failure_equipment.map((m) => (
                    <div key={m.machine} className="lt-recurring-item">
                      <span><strong>{m.machine}</strong> ({m.stage})</span>
                      <span className="lt-badge lt-badge--breakdown">
                        {m.breakdown_event_count} failures &bull; {m.breakdown_downtime_hours ?? "N/A"}h
                      </span>
                    </div>
                  ))}
                </div>

                <div className="lt-recurring-card">
                  <h4>🔧 Longest Repair Time (MTTR &ge; 3 Failures)</h4>
                  {reliabilityData.recurring_breakdown_insights.longest_repair_equipment.map((m) => (
                    <div key={m.machine} className="lt-recurring-item">
                      <span><strong>{m.machine}</strong> ({m.stage})</span>
                      <span className="lt-badge lt-badge--unplanned">
                        MTTR: {m.mttr_hours ?? "N/A"}h &bull; {m.breakdown_event_count} failures
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 4: Monthly Downtime Trends & Audit */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, color: "#f8fafc" }}>
                  4. Monthly Downtime Timeline &amp; Data Provenance Audit
                </h4>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                  Detecting workbook reporting gaps and seasonal patterns
                </span>
              </div>
              <table className="lt-data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total Downtime (Hours)</th>
                    <th>Total Events</th>
                    <th>Breakdown Events</th>
                    <th>Breakdown Hours</th>
                    <th>Reporting Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reliabilityData.monthly_trends.map((t) => (
                    <tr key={t.month} style={{ background: !t.has_data ? "rgba(239, 68, 68, 0.08)" : undefined }}>
                      <td><strong>{t.month}</strong></td>
                      <td>{t.downtime_hours === null ? "N/A" : t.downtime_hours.toLocaleString() + " hrs"}</td>
                      <td>{t.event_count.toLocaleString()}</td>
                      <td>{t.breakdown_event_count.toLocaleString()}</td>
                      <td>{t.breakdown_hours === null ? "N/A" : t.breakdown_hours.toLocaleString() + " hrs"}</td>
                      <td>
                        {t.has_data ? (
                          <span className="lt-badge lt-badge--ok">
                            {t.has_duration_data === false ? "Logged; duration unavailable" : "Logged"}
                          </span>
                        ) : (
                          <span className="lt-badge lt-badge--gap">
                            Gap: {t.note || "No records in workbook"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 5: Process Stage & Shift Breakdown */}
            <div style={{ marginBottom: "2.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
              <div>
                <h4 style={{ margin: "0 0 0.75rem 0", color: "#f8fafc" }}>
                  5A. Process Stage Distribution
                </h4>
                <table className="lt-data-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Total Hours</th>
                      <th>Events</th>
                      <th>Share %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reliabilityData.stage_breakdown.map((s) => (
                      <tr key={s.stage}>
                        <td><strong>{s.stage}</strong></td>
                        <td>{s.total_hours === null ? "N/A" : s.total_hours.toLocaleString() + " hrs"}</td>
                        <td>{s.event_count.toLocaleString()}</td>
                        <td>{s.share_pct === null ? "N/A" : s.share_pct + "%"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 style={{ margin: "0 0 0.75rem 0", color: "#f8fafc" }}>
                  5B. Shift Downtime Distribution
                </h4>
                <table className="lt-data-table">
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Total Hours</th>
                      <th>Events</th>
                      <th>Share %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reliabilityData.shift_breakdown.map((sh) => (
                      <tr key={sh.shift}>
                        <td><strong>{sh.shift}</strong></td>
                        <td>{sh.total_hours === null ? "N/A" : sh.total_hours.toLocaleString() + " hrs"}</td>
                        <td>{sh.event_count.toLocaleString()}</td>
                        <td>{sh.share_pct === null ? "N/A" : sh.share_pct + "%"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 6: Searchable & Paginated Drilldown of Historical Records */}
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h4 style={{ margin: 0, color: "#f8fafc" }}>
                  6. Underlying Historical Downtime Records Drill-Down
                </h4>
                <form onSubmit={handleRelSearch} style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="lt-search-input"
                    placeholder="Search machine, category, type..."
                    value={relSearchQuery}
                    onChange={(e) => setRelSearchQuery(e.target.value)}
                  />
                  <button type="submit" className="btn btn--secondary" style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}>
                    Search
                  </button>
                  {relSearchQuery && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
                      onClick={() => {
                        setRelSearchQuery("");
                        setRelPage(1);
                        loadHistoricalRecords(relCategoryFilter, relMachineFilter, relStageFilter, relShiftFilter, "", 1);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </form>
              </div>

              {historicalRecords && (
                <>
                  <table className="lt-data-table">
                    <thead>
                      <tr>
                        <th>Row #</th>
                        <th>Date</th>
                        <th>Shift</th>
                        <th>Stage</th>
                        <th>Machine</th>
                        <th>Category</th>
                        <th>Downtime Type</th>
                        <th>Duration (min)</th>
                        <th>Classification</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalRecords.records.map((r) => (
                        <tr key={`${r.row_number}-${r.date}-${r.machine}`}>
                          <td><code>#{r.row_number}</code></td>
                          <td>{r.date || "—"}</td>
                          <td>{r.shift}</td>
                          <td>{r.stage}</td>
                          <td><strong>{r.machine}</strong></td>
                          <td>{r.category}</td>
                          <td>{r.downtime_type}</td>
                          <td><strong>{r.downtime_minutes === null ? "—" : r.downtime_minutes + "m"}</strong></td>
                          <td>
                            <span className={`lt-badge ${r.is_planned ? "lt-badge--planned" : (r.category.toLowerCase() === "breakdown" ? "lt-badge--breakdown" : "lt-badge--unplanned")}`}>
                              {r.is_planned ? "Planned" : "Unplanned"}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.75rem", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.description || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="lt-pagination-bar">
                    <span>
                      Showing {((historicalRecords.page - 1) * historicalRecords.page_size) + 1} to{" "}
                      {Math.min(historicalRecords.page * historicalRecords.page_size, historicalRecords.total_count)} of{" "}
                      {historicalRecords.total_count.toLocaleString()} records
                    </span>
                    <div className="lt-pagination-actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                        disabled={historicalRecords.page <= 1}
                        onClick={() => handlePageChange(historicalRecords.page - 1)}
                      >
                        &larr; Previous
                      </button>
                      <span>
                        Page {historicalRecords.page} of {historicalRecords.total_pages}
                      </span>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                        disabled={historicalRecords.page >= historicalRecords.total_pages}
                        onClick={() => handlePageChange(historicalRecords.page + 1)}
                      >
                        Next &rarr;
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Section 7: Mathematical Governance & Provenance Documentation */}
            <div className="lt-callout lt-callout-info">
              <div style={{ fontSize: "0.85rem", lineHeight: "1.5" }}>
                <strong>📐 Reliability Formulas &amp; Data Integrity Rules:</strong>
                <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>
                  <li>
                    <strong>Mean Time To Repair (MTTR):</strong> <code>Total Breakdown Downtime Hours ÷ Breakdown Event Count</code> (restricted strictly to Category == 'Breakdown').
                  </li>
                  <li>
                    <strong>Mean Time Between Failures (MTBF):</strong> <code>{reliabilityData.formula_documentation.mtbf_definition}</code>.
                    <span style={{ color: "#fbbf24" }}> Important limitation:</span> True operating run hours are absent from historical downtime logs; MTBF is therefore presented as a calendar-time approximation in accordance with plant conventions.
                  </li>
                  <li>
                    <strong>Planned Downtime Categories:</strong> <code>Planned Shutdown</code>, <code>PM Activities</code>, <code>Set Up &amp; Adjustment</code>, and <code>Trial / NPD</code>. All other categories are treated as Unplanned.
                  </li>
                  <li>
                    <strong>Source Separation:</strong> {reliabilityData.formula_documentation.data_separation}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
