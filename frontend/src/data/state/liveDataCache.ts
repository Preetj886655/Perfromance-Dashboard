/**
 * Persistent Client Cache for Live Google Sheets Manufacturing Dataset.
 *
 * Uses IndexedDB for full record sets (handling 20,000+ records without
 * localStorage 5MB quota restrictions) combined with lightweight synchronous
 * localStorage metadata for instant 0ms pre-hydration.
 */

import type { DprRecord } from "../normalization/normalizeDprData";

export interface CachedLiveDataset {
  spreadsheetId: string;
  worksheet: string;
  recordCount: number;
  lastUpdated: string | null;
  minDate: string | null;
  maxDate: string | null;
  records: DprRecord[];
  savedAt: number;
}

export interface LiveDatasetMeta {
  spreadsheetId: string;
  worksheet: string;
  recordCount: number;
  lastUpdated: string | null;
  minDate: string | null;
  maxDate: string | null;
  savedAt: number;
}

const DB_NAME = "patil_mfg_cache_v1";
const STORE_NAME = "live_dataset";
const META_KEY = "patil.live_dataset.meta";
const DATA_KEY = "active_dataset";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Synchronous metadata load from localStorage.
 * Available at 0ms during React component initialization.
 */
export function loadCachedLiveMeta(): LiveDatasetMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LiveDatasetMeta;
  } catch {
    return null;
  }
}

/**
 * Save lightweight metadata to localStorage for instant pre-hydration.
 */
export function saveCachedLiveMeta(meta: LiveDatasetMeta): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // ignore quota issues
  }
}

/**
 * Asynchronously retrieve the full cached live dataset from IndexedDB.
 * Typically resolves in 15–30ms for 16,000+ records.
 */
export async function loadCachedLiveDataset(): Promise<CachedLiveDataset | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DATA_KEY);
      req.onsuccess = () => {
        const val = req.result as CachedLiveDataset | undefined;
        if (val && Array.isArray(val.records) && val.records.length > 0) {
          resolve(val);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Persist the full live dataset to IndexedDB and update localStorage metadata.
 */
export async function saveCachedLiveDataset(payload: CachedLiveDataset): Promise<boolean> {
  // Always save metadata first
  saveCachedLiveMeta({
    spreadsheetId: payload.spreadsheetId,
    worksheet: payload.worksheet,
    recordCount: payload.recordCount,
    lastUpdated: payload.lastUpdated,
    minDate: payload.minDate,
    maxDate: payload.maxDate,
    savedAt: payload.savedAt,
  });

  const db = await openDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(payload, DATA_KEY);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Clear cached dataset from both IndexedDB and localStorage.
 */
export async function clearCachedLiveDataset(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(META_KEY);
    } catch {
      // ignore
    }
  }
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(DATA_KEY);
  } catch {
    // ignore
  }
}

