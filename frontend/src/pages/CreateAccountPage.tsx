export function CreateAccountPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__eyebrow">Patil Manufacturing Analytics</span>
          <h1>Account creation</h1>
        </div>

        <div className="auth-form">
          <p className="panel panel--muted">Account creation is managed by your administrator.</p>
          <p className="auth-error" style={{ color: "var(--ink)" }}>
            Please contact your administrator or sign in with an approved account.
          </p>

          <button type="button" className="btn btn--primary auth-submit" onClick={() => window.location.hash = "#/login"}>
            Admin sign in
          </button>
        </div>
      </div>
    </div>
  );
}
