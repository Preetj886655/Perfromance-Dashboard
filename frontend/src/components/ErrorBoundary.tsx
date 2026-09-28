import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error("[ErrorBoundary caught an unhandled render error]:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      return (
        <div
          role="alert"
          style={{
            margin: "2rem",
            padding: "2rem",
            borderRadius: "8px",
            border: "1px solid #FCA5A5",
            backgroundColor: "#FEF2F2",
            color: "#991B1B",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            maxWidth: "960px",
          }}
        >
          <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem", fontWeight: 700, color: "#991B1B" }}>
            {this.props.fallbackTitle ?? "Dashboard failed to render."}
          </h2>
          <p style={{ margin: "0 0 1rem 0", fontSize: "1rem", color: "#7F1D1D" }}>
            An unexpected error occurred during rendering.
          </p>
          {this.state.error && (
            <div style={{ marginBottom: "1rem" }}>
              <strong>Error:</strong>
              <pre
                style={{
                  background: "#FFFFFF",
                  padding: "1rem",
                  borderRadius: "6px",
                  border: "1px solid #FECACA",
                  overflowX: "auto",
                  fontSize: "0.875rem",
                  color: "#B91C1C",
                  marginTop: "0.5rem",
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </pre>
            </div>
          )}
          {isDev && this.state.errorInfo?.componentStack && (
            <div style={{ marginBottom: "1rem" }}>
              <strong>Component Stack:</strong>
              <pre
                style={{
                  background: "#FFFFFF",
                  padding: "1rem",
                  borderRadius: "6px",
                  border: "1px solid #FECACA",
                  overflowX: "auto",
                  fontSize: "0.75rem",
                  color: "#4B5563",
                  marginTop: "0.5rem",
                }}
              >
                {this.state.errorInfo.componentStack}
              </pre>
            </div>
          )}
          {isDev && this.state.error?.stack && (
            <div>
              <strong>Stack:</strong>
              <pre
                style={{
                  background: "#FFFFFF",
                  padding: "1rem",
                  borderRadius: "6px",
                  border: "1px solid #FECACA",
                  overflowX: "auto",
                  fontSize: "0.75rem",
                  color: "#4B5563",
                  marginTop: "0.5rem",
                }}
              >
                {this.state.error.stack}
              </pre>
            </div>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              backgroundColor: "#DC2626",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
