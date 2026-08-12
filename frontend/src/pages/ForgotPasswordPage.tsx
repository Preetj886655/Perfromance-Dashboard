import { type FormEvent, useState } from "react";

const API_BASE = "/api/v1/auth";

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/forgot-password`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_or_employee_code: identifier.trim() }),
      });

      const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok) {
        throw new Error(payload?.detail ?? "Something went wrong. Please try again.");
      }

      setMessage(payload?.detail ?? "If the account exists, password reset instructions have been provided.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__eyebrow">Patil Manufacturing Analytics</span>
          <h1>Forgot password</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Email or employee code</span>
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="name@company.com or EMP-123"
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-error" style={{ color: "var(--ok)" }}>{message}</p> : null}

          <button className="btn btn--primary auth-submit" type="submit" disabled={isLoading}>
            {isLoading ? "Sending..." : "Send reset instructions"}
          </button>

          <div className="auth-actions">
            <button type="button" className="auth-link" onClick={() => window.location.hash = "#/login"}>
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
