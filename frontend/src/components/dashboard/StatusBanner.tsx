import type { ReactNode } from "react";

type Props = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
};

export function StatusBanner({
  loading,
  error,
  empty,
  emptyMessage = "No data for the current filters.",
  children,
}: Props) {
  if (loading) {
    return <p className="status-banner status-banner--loading">Loading…</p>;
  }
  if (error) {
    return (
      <p className="status-banner status-banner--error" role="alert">
        {error}
      </p>
    );
  }
  if (empty) {
    return <p className="status-banner status-banner--empty">{emptyMessage}</p>;
  }
  return <>{children}</>;
}
