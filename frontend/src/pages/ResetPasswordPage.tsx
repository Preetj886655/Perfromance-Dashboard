import { type FormEvent, useMemo, useState } from "react";

const API_BASE = "/api/v1/auth";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const token = useMemo(() => {
    const hash = window.location.hash.replace(/^#\//, "");
    const match = hash.match(/reset-password\?(.*)/);
    if (!match) return "";
    const params = new URLSearchParams(match[1]);
    return params.get("token") ?? "";
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!token) {
      setError("This password reset link is invalid or expired.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/reset-password`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
          confirm_password: confirmPassword,
        }),
      });

      const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok) {
        throw new Error(payload?.detail ?? "This password reset link is invalid or expired.");
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        window.location.hash = "#/login";
      }, 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand__eyebrow">Patil Manufacturing Analytics</span>
            <h1>Reset password</h1>
          </div>
          <p className="auth-error">This password reset link is invalid or expired.</p>
          <div className="auth-actions">
            <button type="button" className="auth-link" onClick={() => window.location.hash = "#/login"}>Back to sign in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__eyebrow">Patil Manufacturing Analytics</span>
          <h1>Reset password</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter password"
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}
          {success ? <p className="auth-error" style={{ color: "var(--ok)" }}>Password reset successful. Please sign in.</p> : null}

          <button className="btn btn--primary auth-submit" type="submit" disabled={isLoading}>
            {isLoading ? "Resetting..." : "Reset password"}
          </button>

          <div className="auth-actions">
            <button type="button" className="auth-link" onClick={() => window.location.hash = "#/login"}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
