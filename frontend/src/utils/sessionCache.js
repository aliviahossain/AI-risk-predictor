// Keeps the last loaded analysis in IndexedDB so a page reload restores it
// instantly. IndexedDB (not localStorage) because a full gene table can exceed
// localStorage's ~5 MB quota. Every call fails soft: private browsing or
// blocked storage simply means no restore.

const DB_NAME = "deg-viewer";
const STORE   = "session";
const KEY     = "current";
// Matches the backend's job retention, after which heatmaps are no longer served.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveSession({ genes, filename, jobId }) {
  try {
    await withStore("readwrite", s => s.put({ genes, filename, jobId, savedAt: Date.now() }, KEY));
  } catch { /* storage unavailable or full: skip caching */ }
}

export async function loadSession() {
  try {
    const session = await withStore("readonly", s => s.get(KEY));
    if (!session || !Array.isArray(session.genes)) return null;
    if (Date.now() - session.savedAt > MAX_AGE_MS) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  try {
    await withStore("readwrite", s => s.delete(KEY));
  } catch { /* nothing to clear */ }
}
