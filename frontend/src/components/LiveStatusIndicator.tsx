/**
 * LiveStatusIndicator Component
 * 
 * Displays real-time connection status to Google Sheets, last sync time,
 * and provides manual refresh controls.
 */

import { useState } from 'react';
import type { LiveSyncStatus } from '../hooks/useManufacturingLivePolling';

interface LiveStatusIndicatorProps {
  status: LiveSyncStatus;
  onRefresh?: () => Promise<void>;
  showDetails?: boolean;
}

export function LiveStatusIndicator({ status, onRefresh, showDetails = true }: LiveStatusIndicatorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = () => {
    switch (status.state) {
      case 'polling':
      case 'syncing':
        return '↻';
      case 'error':
      case 'offline':
        return '⚠';
      case 'idle':
        return '●';
      default:
        return '○';
    }
  };

  const getStatusClass = () => {
    switch (status.state) {
      case 'error':
      case 'offline':
        return 'offline';
      case 'polling':
      case 'syncing':
        return 'updating';
      default:
        return 'connected';
    }
  };

  const getStatusText = () => {
    switch (status.state) {
      case 'polling':
      case 'syncing':
        return 'Syncing...';
      case 'error':
        return status.error || 'Error';
      case 'offline':
        return 'Offline - Showing cached data';
      default:
        return status.connected ? 'Live' : 'Disconnected';
    }
  };

  return (
    <div className="live-status-indicator">
      <div className={`live-status-indicator__badge ${getStatusClass()}`}>
        <span 
          className={`live-status-indicator__icon ${status.state === 'syncing' || status.state === 'polling' ? 'rotate' : ''}`}
        >
          {getStatusIcon()}
        </span>
        <span className="live-status-indicator__text">{getStatusText()}</span>
      </div>

      {showDetails && (
        <div className="live-status-indicator__details">
          {status.lastSync && (
            <div className="live-status-indicator__detail">
              <span className="live-status-indicator__label">Synced:</span>
              <span className="live-status-indicator__value">{status.lastSync}</span>
            </div>
          )}
          {status.recordCount > 0 && (
            <div className="live-status-indicator__detail">
              <span className="live-status-indicator__label">Records:</span>
              <span className="live-status-indicator__value">{status.recordCount.toLocaleString()}</span>
            </div>
          )}
          {status.updateAvailable && (
            <div className="live-status-indicator__detail">
              <span className="live-status-indicator__badge-small">Updated</span>
            </div>
          )}
        </div>
      )}

      {onRefresh && (
        <button
          className="live-status-indicator__refresh-btn"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <span className={isRefreshing ? 'rotate' : ''}>↻</span>
        </button>
      )}
    </div>
  );
}

/**
 * DataSourceIndicator Component
 * 
 * Shows which data source is currently active (Google Sheets, Excel, CSV)
 */

interface DataSourceIndicatorProps {
  source: 'google-sheets' | 'excel' | 'csv' | 'unknown';
  fileName?: string;
}

export function DataSourceIndicator({ source, fileName }: DataSourceIndicatorProps) {
  const getSourceIcon = () => {
    switch (source) {
      case 'google-sheets':
        return '🔗';
      case 'excel':
        return '📊';
      case 'csv':
        return '📄';
      default:
        return '📁';
    }
  };

  const getSourceLabel = () => {
    switch (source) {
      case 'google-sheets':
        return 'Google Sheets';
      case 'excel':
        return 'Excel';
      case 'csv':
        return 'CSV';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="data-source-indicator">
      <span className="data-source-indicator__icon">{getSourceIcon()}</span>
      <span className="data-source-indicator__label">{getSourceLabel()}</span>
      {fileName && (
        <span className="data-source-indicator__filename" title={fileName}>
          {fileName.length > 20 ? `${fileName.substring(0, 17)}...` : fileName}
        </span>
      )}
    </div>
  );
}

/**
 * AutoRefreshToggle Component
 * 
 * Allows users to enable/disable automatic polling
 */

interface AutoRefreshToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  interval?: number;
}

export function AutoRefreshToggle({ enabled, onChange, interval = 60 }: AutoRefreshToggleProps) {
  return (
    <div className="auto-refresh-toggle">
      <label className="auto-refresh-toggle__label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="auto-refresh-toggle__input"
        />
        <span className="auto-refresh-toggle__text">
          Auto Refresh
        </span>
      </label>
      {enabled && (
        <span className="auto-refresh-toggle__interval">
          Every {interval}s
        </span>
      )}
    </div>
  );
}
