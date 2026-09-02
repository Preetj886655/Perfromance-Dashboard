/**
 * useManufacturingLivePolling Hook
 * 
 * Handles real-time polling of Google Sheets manufacturing data.
 * Automatically detects changes and triggers re-renders.
 * Gracefully handles offline states and errors.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchManufacturingStatus, fetchManufacturingDataset } from '../services/manufacturingApi';
import type { ManufacturingApiResponse } from '../services/manufacturingApi';

export type PollingState = 'idle' | 'polling' | 'syncing' | 'error' | 'offline';

export interface LiveSyncStatus {
  state: PollingState;
  connected: boolean;
  lastSync: string | null;
  lastUpdate: string | null;
  recordCount: number;
  recordsChanged: number;
  error: string | null;
  updateAvailable: boolean;
}

interface UseManufacturingLivePollingOptions {
  spreadsheetId?: string;
  worksheet?: string;
  pollingInterval?: number; // milliseconds
  enabled?: boolean;
  onDataUpdate?: (data: ManufacturingApiResponse) => void;
  onStatusChange?: (status: LiveSyncStatus) => void;
}

const DEFAULT_POLLING_INTERVAL = 60000; // 60 seconds
const MIN_POLLING_INTERVAL = 10000; // 10 seconds
const MAX_POLLING_INTERVAL = 600000; // 10 minutes

/**
 * Compute a simple hash of the dataset for change detection.
 */
function hashDataset(data: unknown[]): string {
  if (!Array.isArray(data)) return '';
  
  const recordCount = data.length;
  const firstId = data.length > 0 ? JSON.stringify(data[0]).substring(0, 50) : '';
  const lastId = data.length > 0 ? JSON.stringify(data[data.length - 1]).substring(0, 50) : '';
  
  return `${recordCount}:${firstId}:${lastId}`;
}

export function useManufacturingLivePolling(options: UseManufacturingLivePollingOptions) {
  const {
    spreadsheetId,
    worksheet,
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    enabled = true,
    onDataUpdate,
    onStatusChange,
  } = options;

  const [status, setStatus] = useState<LiveSyncStatus>({
    state: 'idle',
    connected: false,
    lastSync: null,
    lastUpdate: null,
    recordCount: 0,
    recordsChanged: 0,
    error: null,
    updateAvailable: false,
  });

  const pollingTimeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDataHashRef = useRef<string>('');
  const previousRecordCountRef = useRef<number>(0);

  const validatedInterval = Math.max(
    MIN_POLLING_INTERVAL,
    Math.min(pollingInterval, MAX_POLLING_INTERVAL)
  );

  const pollStatus = useCallback(async () => {
    if (!spreadsheetId || !enabled) return;

    try {
      setStatus((prev) => ({ ...prev, state: 'polling' }));

      const statusResponse = await fetchManufacturingStatus(spreadsheetId, worksheet);

      const isConnected = statusResponse.connectionStatus === 'connected';
      const currentTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const newStatus: LiveSyncStatus = {
        state: isConnected ? 'idle' : 'offline',
        connected: isConnected,
        lastSync: currentTime,
        lastUpdate: null,
        recordCount: statusResponse.recordCount,
        recordsChanged: 0,
        error: statusResponse.error,
        updateAvailable: false,
      };

      setStatus(newStatus);
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to poll status';

      const newStatus: LiveSyncStatus = {
        state: 'error',
        connected: false,
        lastSync: null,
        lastUpdate: null,
        recordCount: 0,
        recordsChanged: 0,
        error: errorMessage,
        updateAvailable: false,
      };

      setStatus(newStatus);
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    }
  }, [spreadsheetId, worksheet, enabled, onStatusChange]);

  const fetchAndDetectChanges = useCallback(async () => {
    if (!spreadsheetId || !enabled) return;

    try {
      setStatus((prev) => ({ ...prev, state: 'syncing' }));

      const dataResponse = await fetchManufacturingDataset(spreadsheetId, worksheet);

      const isConnected = dataResponse.connectionStatus === 'connected';
      const currentDataHash = hashDataset(dataResponse.data);
      const hasChanged = currentDataHash !== lastDataHashRef.current;
      const recordsChanged = Math.abs(dataResponse.recordCount - previousRecordCountRef.current);
      const currentTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      lastDataHashRef.current = currentDataHash;
      previousRecordCountRef.current = dataResponse.recordCount;

      setStatus((prev) => {
        const newStatus: LiveSyncStatus = {
          state: isConnected ? 'idle' : 'offline',
          connected: isConnected,
          lastSync: currentTime,
          lastUpdate: hasChanged ? currentTime : prev.lastUpdate,
          recordCount: dataResponse.recordCount,
          recordsChanged,
          error: dataResponse.error,
          updateAvailable: hasChanged,
        };

        if (onStatusChange) {
          onStatusChange(newStatus);
        }

        return newStatus;
      });

      if (hasChanged && isConnected) {
        if (onDataUpdate) {
          onDataUpdate(dataResponse);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data';

      const newStatus: LiveSyncStatus = {
        state: 'error',
        connected: false,
        lastSync: null,
        lastUpdate: null,
        recordCount: 0,
        recordsChanged: 0,
        error: errorMessage,
        updateAvailable: false,
      };

      setStatus(newStatus);
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    }
  }, [spreadsheetId, worksheet, enabled, onDataUpdate, onStatusChange]);

  const refresh = useCallback(async () => {
    await pollStatus();
    await fetchAndDetectChanges();
  }, [pollStatus, fetchAndDetectChanges]);

  useEffect(() => {
    if (!enabled || !spreadsheetId) return;

    pollStatus();

    const interval = setInterval(() => {
      fetchAndDetectChanges();
    }, validatedInterval);

    pollingTimeoutRef.current = interval;

    return () => {
      if (pollingTimeoutRef.current) {
        clearInterval(pollingTimeoutRef.current);
      }
    };
  }, [enabled, spreadsheetId, validatedInterval, pollStatus, fetchAndDetectChanges]);

  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearInterval(pollingTimeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    refresh,
    isLive: status.connected && status.state !== 'error',
    isUpdating: status.state === 'syncing',
    hasChanges: status.updateAvailable,
  };
}
