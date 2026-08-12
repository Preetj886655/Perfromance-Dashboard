import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { OeeDashboard } from "./pages/OeeDashboard";
import "./App.css";

function AppView() {
  const { user, isAuthenticated, isLoading, isForbidden, login, logout } = useAuth();

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
      <OeeDashboard />
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
