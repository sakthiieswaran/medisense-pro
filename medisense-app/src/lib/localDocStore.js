/**
 * Browser IndexedDB binary document store
 * ---------------------------------------
 * Used ONLY when MediSense runs locally/offline without a backend server,
 * storing actual uploaded PDF/image binary Blobs so document preview and
 * download genuinely work without simulating uploads.
 */

const DB_NAME = "medisense_docs_v1";
const STORE_NAME = "files";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalDocBlob(id, file) {
  const db = await openDb();
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      id,
      name: file.name,
      type: file.type,
      buffer,
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalDocBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec) return resolve(null);
      resolve(new Blob([rec.buffer], { type: rec.type || "application/octet-stream" }));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalDocBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
