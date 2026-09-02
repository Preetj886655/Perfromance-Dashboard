import { useEffect, useState } from "react";
import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { CreateAccountPage } from "./pages/CreateAccountPage";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/animations.css";
import "./styles/dashboard.css";
import { ManufacturingDashboard } from "./pages/ManufacturingDashboard";
import "./App.css";
import "./styles/light-theme-overrides.css";

type ViewKey = "dashboard" | "users" | "masters";
type Screen = "login" | "forgot-password" | "reset-password" | "create-account" | "app";

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

function AppView() {
  const { user, isAuthenticated, isLoading, isForbidden, login, logout, hasPermission } = useAuth();
  const [view, setView] = useState<ViewKey>(resolveHashView);
  const [screen, setScreen] = useState<Screen>(getScreenFromLocation);

  useEffect(() => {
    const sync = () => {
      setView(resolveHashView());
      setScreen(getScreenFromLocation());
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const canManageUsers = hasPermission("users", "MANAGE");
  const canCreateMasters = hasPermission("masters", "CREATE");

  const openDashboard = () => {
    window.location.hash = "#/dashboard";
    setView("dashboard");
  };

  const openUsers = () => {
    window.location.hash = "#/users";
    setView("users");
  };

  const openMasters = () => {
    window.location.hash = "#/masters";
    setView("masters");
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

  return (
    <div className="shell shell--wide">
      {canManageUsers || canCreateMasters ? (
        <nav className="top-nav" aria-label="Main navigation">
          <button
            type="button"
            className={view === "dashboard" ? "btn btn--primary" : "btn"}
            onClick={openDashboard}
          >
            Dashboard
          </button>
          {canCreateMasters ? (
            <button
              type="button"
              className={view === "masters" ? "btn btn--primary" : "btn"}
              onClick={openMasters}
            >
              Master Data
            </button>
          ) : null}
          {canManageUsers ? (
            <button
              type="button"
              className={view === "users" ? "btn btn--primary" : "btn"}
              onClick={openUsers}
            >
              User Management
            </button>
          ) : null}
        </nav>
      ) : null}

      {view === "masters" ? (
        canCreateMasters ? (
          <MasterDataPage />
        ) : (
          <div className="panel panel--error auth-denied">
            <h2>Access denied</h2>
            <p>You do not have permission to manage master data.</p>
          </div>
        )
      ) : view === "users" ? (
        canManageUsers ? (
          <UserManagementPage />
        ) : (
          <div className="panel panel--error auth-denied">
            <h2>Access denied</h2>
            <p>You do not have permission to manage users.</p>
          </div>
        )
      ) : (
        <ManufacturingDashboard />
      )}
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
