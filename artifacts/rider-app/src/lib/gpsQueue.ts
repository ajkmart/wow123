/* GPS offline queue backed by IndexedDB.
   Stores GPS pings that could not be sent due to network unavailability.
   On reconnect, the queue is drained by sending a batch request to the server.

   Also provides a dismissed-request store with a 90-second TTL so that
   request cards the rider hides are still hidden when the tab is reopened
   mid-trip, but automatically re-surface after the request has expired. */

import { validateGpsPing, type GpsPing } from "./gps/validation";

/* Last valid ping seen — used by the validator to compute speed between pings */
let _lastValidPing: GpsPing | null = null;

export interface QueuedPing {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
  action?: string | null;
  mockProvider?: boolean;
  suspicious?: boolean;
  suspicionReason?: string;

}

interface DismissedEntry {
  id: string;
  expiresAt: number;
}

const DB_NAME    = "ajkmart_gps_queue";
const STORE      = "pings";
const DISMISSED  = "dismissed";
const DB_VER     = 2;

let DISMISSED_TTL_MS = 90_000;

/* ── Configurable limits ───────────────────────────────────────────────────
   Updated at startup from the platform config. Defaults preserve existing
   behaviour when the platform config cannot be fetched. */
let _maxQueueSize = 500;

export function setGpsQueueMax(max: number): void {
  if (Number.isFinite(max) && max > 0) _maxQueueSize = Math.min(Math.floor(max), 10_000);
}

export function setDismissedRequestTtlSec(sec: number): void {
  if (Number.isFinite(sec) && sec > 0) DISMISSED_TTL_MS = Math.min(sec, 86_400) * 1000;
}

/* G3/PF6: Memoize a single IDBDatabase across all callers. Per-call open()
   is wasteful (hundreds of structured-clone handshakes per ride) and serializes
   drain passes behind upgrade transactions. We hold one connection open for
   the lifetime of the tab; if the connection is forcibly closed (versionchange,
   eviction), we reset the cached promise so the next call reopens cleanly.
   IMPORTANT: callers must NOT close this DB after each transaction. */
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = (event.target as IDBOpenDBRequest).transaction;
      if (tx) {
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB upgrade aborted"));
      }
      try {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains(DISMISSED)) {
          const ds = db.createObjectStore(DISMISSED, { keyPath: "id" });
          ds.createIndex("expiresAt", "expiresAt", { unique: false });
        }
      } catch (e) {
        if (tx) tx.abort();
        reject(e);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { _dbPromise = null; };
      db.onversionchange = () => { try { db.close(); } catch {} _dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  }).catch((err) => { _dbPromise = null; throw err; });
  return _dbPromise;
}

export async function enqueue(ping: QueuedPing): Promise<void> {
  const result = validateGpsPing(_lastValidPing, {
    timestamp: ping.timestamp,
    latitude: ping.latitude,
    longitude: ping.longitude,
    accuracy: ping.accuracy,
    speed: ping.speed,
    heading: ping.heading,
    isMockProvider: ping.mockProvider,

  });
  if (!result.valid) {
    /* Rejected pings are silently dropped from the queue.
       The audit log in gps/validation.ts captures the reason. */
    return;
  }
  /* Propagate suspicious metadata so the batch payload carries the flag
     and the backend can audit or alert on it. */
  if (result.suspicious) {
    ping = { ...ping, suspicious: true, suspicionReason: result.suspicionReason };
  }

  _lastValidPing = {
    timestamp: ping.timestamp,
    latitude: ping.latitude,
    longitude: ping.longitude,
    accuracy: ping.accuracy,
    speed: ping.speed,
    heading: ping.heading,
    isMockProvider: ping.mockProvider,

  };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const countReq = store.count();
      /* G3/PF6: Cached connection — do NOT call db.close() in tx callbacks. */
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      countReq.onsuccess = () => {
        if (countReq.result >= _maxQueueSize) {
          const idx = store.index("timestamp");
          const cursorReq = idx.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              /* G2: Wait for delete to complete before put — sequencing
                 these in the same onsuccess broke older Firefox builds. */
              const delReq = cursor.delete();
              delReq.onsuccess = () => { store.put(ping); };
              delReq.onerror = () => tx.abort();
            } else {
              tx.abort();
            }
          };
          cursorReq.onerror = () => tx.abort();
        } else {
          store.put(ping);
        }
      };
      countReq.onerror = () => tx.abort();
    });
  } catch { /* swallow — offline queue is best-effort */ }
}

export async function dequeueAll(): Promise<QueuedPing[]> {
  try {
    const db = await openDB();
    return await new Promise<QueuedPing[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const index = store.index("timestamp");
      const req = index.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedPing[]);
      req.onerror   = () => reject(req.error);
    });
  } catch { return []; }
}

export async function clearQueue(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {}
}

export async function queueSize(): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  } catch { return 0; }
}

/* ── Dismissed-request store ──────────────────────────────────────────────────
   Persists dismissed request IDs across tab close with a 90-second TTL.
   On read, expired entries are purged automatically so the store stays small. */

export async function addDismissed(id: string): Promise<void> {
  try {
    const db = await openDB();
    const entry: DismissedEntry = { id, expiresAt: Date.now() + DISMISSED_TTL_MS };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      tx.objectStore(DISMISSED).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {}
}

export async function removeDismissed(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      tx.objectStore(DISMISSED).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {}
}

export async function loadDismissed(): Promise<Set<string>> {
  try {
    const db = await openDB();
    const now = Date.now();
    const entries = await new Promise<DismissedEntry[]>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readonly");
      const req = tx.objectStore(DISMISSED).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as DismissedEntry[]);
      req.onerror   = () => reject(req.error);
    });
    const valid = entries.filter(e => e.expiresAt > now);
    const expired = entries.filter(e => e.expiresAt <= now);
    if (expired.length) {
      purgeExpiredDismissed(expired.map(e => e.id));
    }
    return new Set(valid.map(e => e.id));
  } catch { return new Set(); }
}

/** Purge expired entries from the dismissed store (fire-and-forget) */
async function purgeExpiredDismissed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      const store = tx.objectStore(DISMISSED);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {}
}

/**
 * Sweep the dismissed store for expired entries and return the current valid set.
 * Call this on tab re-focus (visibilitychange) so stale dismissals don't hide
 * newly-arrived requests after the TTL has elapsed.
 */
export async function sweepAndLoadDismissed(): Promise<Set<string>> {
  return loadDismissed();
}

export async function clearAllDismissed(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      tx.objectStore(DISMISSED).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {}
}

/* ── Drain handler ────────────────────────────────────────────────────────────
   The drain function calls the registered batch-upload callback.
   If the server responds with GPS_SPOOF_DETECTED (HTTP 422), those pings
   are dropped from the queue permanently — never re-queued.
   Any other error leaves the pings in the queue to retry on the next
   online event. */

let _drainFn: ((pings: QueuedPing[]) => Promise<void>) | null = null;
let _draining = false;

export function registerDrainHandler(fn: (pings: QueuedPing[]) => Promise<void>): () => void {
  _drainFn = fn;
  if (typeof navigator !== "undefined" && navigator.onLine) {
    drainQueue();
  }
  return () => { if (_drainFn === fn) _drainFn = null; };
}

async function drainQueue(): Promise<void> {
  if (_draining || !_drainFn) return;
  _draining = true;
  try {
    const pings = await dequeueAll();
    if (pings.length === 0) return;
    const CHUNK = 100;
    for (let i = 0; i < pings.length; i += CHUNK) {
      const chunk = pings.slice(i, i + CHUNK);
      try {
        await _drainFn(chunk);
        await clearQueue(chunk.map(p => p.id));
      } catch (rawErr: unknown) {
        const err = rawErr as Record<string, unknown>;
        const responseData = err.responseData as Record<string, unknown> | undefined;
        const responseDataNested = responseData?.data as Record<string, unknown> | undefined;
        const isSpoofRejection =
          err.code === "GPS_SPOOF_DETECTED" ||
          responseData?.code === "GPS_SPOOF_DETECTED" ||
          responseDataNested?.code === "GPS_SPOOF_DETECTED" ||
          err.spoofDetected === true;
        if (isSpoofRejection) {
          await clearQueue(chunk.map(p => p.id));
          continue;
        }
        /* G1: For non-spoof transient failures (network/5xx), keep the rest of
           the queue in IDB for the next online event but do NOT abandon the
           remaining chunks of this drain pass — they are independent batches
           and may succeed where the failed one didn't. We intentionally
           continue rather than break, and the failed chunk is left in IDB
           because we never called clearQueue() for it. */
        continue;
      }
    }
  } catch { /* drain failed — will retry next online event */ }
  finally { _draining = false; }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => drainQueue());
}
