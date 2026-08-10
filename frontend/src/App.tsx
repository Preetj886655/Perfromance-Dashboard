import { useEffect, useState } from "react";
import "./App.css";

type HealthResponse = {
  status: string;
  service: string;
  environment: string;
  phase: string;
  database: {
    connected: boolean;
    host: string;
    port: number;
    name: string;
    error: string | null;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/api/v1/health`);
        const body = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setHealth(body);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof Error ? err.message : "Failed to reach API");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="shell">
      <header className="shell__header">
        <p className="shell__eyebrow">Patil Group / PRIL</p>
        <h1>Manufacturing Analytics</h1>
        <p className="shell__subtitle">
          Phase 1 foundation shell — no department modules yet.
        </p>
      </header>

      <main className="shell__main">
        <section className="panel">
          <h2>API health</h2>
          {loading && <p>Checking backend…</p>}
          {error && (
            <p className="status status--error">
              Backend unreachable: {error}. Start the FastAPI server and
              PostgreSQL, then refresh.
            </p>
          )}
          {health && (
            <dl className="health-grid">
              <div>
                <dt>Status</dt>
                <dd className={health.status === "ok" ? "ok" : "warn"}>
                  {health.status}
                </dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{health.phase}</dd>
              </div>
              <div>
                <dt>Environment</dt>
                <dd>{health.environment}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd className={health.database.connected ? "ok" : "warn"}>
                  {health.database.connected
                    ? `connected (${health.database.host}:${health.database.port}/${health.database.name})`
                    : `not connected${health.database.error ? ` — ${health.database.error}` : ""}`}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="panel panel--muted">
          <h2>Out of scope in Phase 1</h2>
          <p>
            Dashboards, Excel ingestion, auth/RBAC, OEE engine, alerts, and SSE
            are deferred to later phases.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
