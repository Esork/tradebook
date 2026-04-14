// ── INDEXEDDB LAYER ───────────────────────────────────────
// Two object stores:
//   trades      — trade metadata, keyPath: 'id' (timestamp). No screenshot data.
//   screenshots — { tradeId, blob },  keyPath: 'tradeId'

const DB_NAME = 'tradebook';
const DB_VERSION = 1;
let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('trades')) {
        db.createObjectStore('trades', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('screenshots')) {
        db.createObjectStore('screenshots', { keyPath: 'tradeId' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror  = e => reject(e.target.error);
  });
}

export async function getAllTrades() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('trades', 'readonly').objectStore('trades').getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function putTrade(trade) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trades', 'readwrite');
    tx.objectStore('trades').put(trade);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

export async function deleteTrade(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trades', 'readwrite');
    tx.objectStore('trades').delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

export async function clearAllTrades() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['trades', 'screenshots'], 'readwrite');
    tx.objectStore('trades').clear();
    tx.objectStore('screenshots').clear();
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

export async function getScreenshot(tradeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('screenshots', 'readonly').objectStore('screenshots').get(tradeId);
    req.onsuccess = e => resolve(e.target.result ? e.target.result.blob : null);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function putScreenshot(tradeId, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('screenshots', 'readwrite');
    tx.objectStore('screenshots').put({ tradeId, blob });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

export async function deleteScreenshot(tradeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('screenshots', 'readwrite');
    tx.objectStore('screenshots').delete(tradeId);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}
