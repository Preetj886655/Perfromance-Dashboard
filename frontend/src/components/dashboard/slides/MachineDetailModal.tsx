/**
 * MachineDetailModal Component
 *
 * Dedicated drill-down view for an individual machine.
 * Displays operational telemetry, downtime/loss contribution to parent Work Center,
 * and top idle/rejection reason breakdowns.
 */

import { useEffect } from "react";
import type { MachinePerformance } from "../../../data/calculations/hierarchyEngine";
import { formatCompactQuantity, formatExactQuantity } from "./chartTheme";

interface Props {
  machine: MachinePerformance | null;
  onClose: () => void;
  periodLabel?: string;
}

export function MachineDetailModal({ machine, onClose, periodLabel }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!machine) return null;

  const achievementText = machine.achievement !== null ? `${machine.achievement.toFixed(1)}%` : "N/A";
  const rejectionRateText = machine.rejectionRate !== null ? `${machine.rejectionRate.toFixed(2)}%` : "N/A";

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="machine-modal-title">
      <div className="modal-content machine-detail-modal" onClick={(e) => e.stopPropagation()}>
        <header className="machine-detail-modal__header">
          <div>
            <div className="machine-detail-modal__breadcrumbs">
              <span>{machine.lineKey}</span>
              <span className="separator">/</span>
              <span>{machine.workCenterKey}</span>
            </div>
            <h2 id="machine-modal-title" className="machine-detail-modal__title">
              {machine.machineKey}
            </h2>
            {periodLabel && <span className="machine-detail-modal__scope">Period Scope: {periodLabel}</span>}
          </div>
          <button
            type="button"
            className="machine-detail-modal__close-btn"
            onClick={onClose}
            aria-label="Close machine details"
          >
            ✕
          </button>
        </header>

        <div className="machine-detail-modal__body">
          {/* Top KPIs */}
          <div className="machine-detail-grid">
            <div className="machine-stat-card">
              <span className="machine-stat-card__label">Actual Production</span>
              <div className="machine-stat-card__value">
                {formatCompactQuantity(machine.production)}
                <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.75, fontWeight: "normal" }}>
                  ({formatExactQuantity(machine.production)})
                </span>
              </div>
              <div className="machine-stat-card__meta">
                Target: {machine.target > 0 ? `${formatCompactQuantity(machine.target)} (${formatExactQuantity(machine.target)})` : "N/A"} ({achievementText})
              </div>
            </div>

            <div className="machine-stat-card">
              <span className="machine-stat-card__label">Total Downtime</span>
              <div className="machine-stat-card__value">
                {formatCompactQuantity(machine.downtimeMinutes)} min
                <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.75, fontWeight: "normal" }}>
                  ({formatExactQuantity(machine.downtimeMinutes)} min)
                </span>
              </div>
              <div className="machine-stat-card__meta">
                <strong>{machine.downtimeContributionToWorkCenterPercent.toFixed(1)}%</strong> of {machine.workCenterKey} DT
              </div>
            </div>

            <div className="machine-stat-card">
              <span className="machine-stat-card__label">Production Loss</span>
              <div className="machine-stat-card__value">
                {formatCompactQuantity(machine.productionLoss)} NOS
                <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.75, fontWeight: "normal" }}>
                  ({formatExactQuantity(machine.productionLoss)} NOS)
                </span>
              </div>
              <div className="machine-stat-card__meta">
                <strong>{machine.lossContributionToWorkCenterPercent.toFixed(1)}%</strong> of {machine.workCenterKey} Loss
              </div>
            </div>

            <div className="machine-stat-card">
              <span className="machine-stat-card__label">Rejections</span>
              <div className="machine-stat-card__value">
                {formatCompactQuantity(machine.rejection)} pcs
                <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.75, fontWeight: "normal" }}>
                  ({formatExactQuantity(machine.rejection)} pcs)
                </span>
              </div>
              <div className="machine-stat-card__meta">
                Rate: <strong>{rejectionRateText}</strong>
              </div>
            </div>
          </div>

          <div className="machine-detail-sections">
            {/* Top Idle Reasons */}
            <div className="machine-breakdown-panel">
              <h4>Top Idle / Downtime Reasons</h4>
              {machine.topIdleReasons.length === 0 ? (
                <div className="machine-breakdown-empty">No idle incidents recorded</div>
              ) : (
                <div className="reason-bars-list">
                  {machine.topIdleReasons.map((item, idx) => (
                    <div key={idx} className="reason-bar-item">
                      <div className="reason-bar-item__header">
                        <span className="reason-name">{item.reason}</span>
                        <span className="reason-val">
                          {formatCompactQuantity(item.amount)} ({formatExactQuantity(item.amount)} min) · {item.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="reason-bar-item__track">
                        <div
                          className="reason-bar-item__fill reason-bar-item__fill--dt"
                          style={{ width: `${Math.min(100, Math.max(2, item.percent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Rejection Reasons */}
            <div className="machine-breakdown-panel">
              <h4>Top Rejection Reasons</h4>
              {machine.topRejectionReasons.length === 0 ? (
                <div className="machine-breakdown-empty">No defect incidents recorded</div>
              ) : (
                <div className="reason-bars-list">
                  {machine.topRejectionReasons.map((item, idx) => (
                    <div key={idx} className="reason-bar-item">
                      <div className="reason-bar-item__header">
                        <span className="reason-name">{item.reason}</span>
                        <span className="reason-val">
                          {formatCompactQuantity(item.amount)} ({formatExactQuantity(item.amount)} pcs) · {item.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="reason-bar-item__track">
                        <div
                          className="reason-bar-item__fill reason-bar-item__fill--rej"
                          style={{ width: `${Math.min(100, Math.max(2, item.percent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <footer className="machine-detail-modal__footer">
            <span>Shifts Logged: <strong>{machine.recordCount.toLocaleString()}</strong></span>
            <span>Plant Downtime Share: <strong>{machine.downtimeContributionToPlantPercent.toFixed(2)}%</strong></span>
            <span>Plant Loss Share: <strong>{machine.lossContributionToPlantPercent.toFixed(2)}%</strong></span>
          </footer>
        </div>
      </div>
    </div>
  );
}

