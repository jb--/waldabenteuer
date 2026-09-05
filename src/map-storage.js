import { mapKey } from "./regions.js";
function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("waldabenteuer-maps", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("regions", { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function readRegionMap(map) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db
        .transaction("regions")
        .objectStore("regions")
        .get(mapKey(map));
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveRegionMap(map, geo) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("regions", "readwrite");
      tx.objectStore("regions").put({
        key: mapKey(map),
        map,
        geo,
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
