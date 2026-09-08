/**
 * ChartCard — premium, consistent chart container used across carousel slides.
 *
 * Provides a compact header (eyebrow + title) and a bounded content area so
 * every chart feels like part of the same system. The content height is
 * capped so individual slides never exceed the viewport and never produce
 * an internal vertical scrollbar.
 */

import type { ReactNode, CSSProperties } from "react";

interface ChartCardProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  /** Optional max content height — defaults to 260px chart body. */
  maxHeight?: number | string;
  style?: CSSProperties;
}

export function ChartCard({ title, eyebrow, children, maxHeight = 260, style }: ChartCardProps) {
  return (
    <div className="chart-card" style={style}>
      <div className="chart-card__head">
        {eyebrow ? <span className="chart-card__eyebrow">{eyebrow}</span> : null}
        <h3 className="chart-card__title">{title}</h3>
      </div>
      <div className="chart-card__body" style={{ maxHeight }}>
        {children}
      </div>
    </div>
  );
}
