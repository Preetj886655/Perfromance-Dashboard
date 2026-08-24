import { type FormEvent, useState } from "react";

import type { LoginCredentials } from "../auth/authTypes";

type LoginPageProps = {
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
};

export function LoginPage({ onSubmit }: LoginPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onSubmit({
        email_or_employee_code: identifier.trim(),
        password,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" role="presentation">
        <div className="auth-brand">
<img
  className="auth-brand__logo"
  src="/public/patil-logo.png"
  alt="Patil Group logo"
/>       
   <div className="auth-brand__text">
            <span className="auth-brand__eyebrow">PATIL GROUP</span>
            <span className="auth-brand__name">PATIL MANUFACTURING ANALYTICS</span>
          </div>
        </div>

        <h1 className="auth-title">Sign in</h1>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <span className="field__label">Email or employee code</span>
            <input
              className="auth-input"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="name@company.com or EMP-123"
              required
            />
          </label>

          <label className="auth-field auth-field--password">
            <span className="field__label">Password</span>
            <div className="auth-password-wrap">
              <input
                className="auth-input auth-input--password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="btn btn--primary auth-submit" type="submit" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign In"}
          </button>

          <div className="auth-actions">
            <button type="button" className="auth-link" onClick={() => window.location.hash = "#/forgot-password"}>
              Forgot password?
            </button>
            <button type="button" className="auth-link" onClick={() => window.location.hash = "#/create-account"}>
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
