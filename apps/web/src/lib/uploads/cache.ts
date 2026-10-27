import type { MediaCache } from './types';

let connection: Promise<IDBDatabase> | undefined;
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kimo-media', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('media', { keyPath: 'localId' });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = undefined;
      reject(request.error);
    };
  });
  return connection;
}
export async function readMedia(
  localId: string,
): Promise<MediaCache | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('media', 'readonly');
    const request = transaction.objectStore('media').get(localId);
    request.onsuccess = () => resolve(request.result as MediaCache | undefined);
    request.onerror = () => reject(request.error);
  });
}
export async function saveMedia(localId: string, patch: Partial<MediaCache>) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('media', 'readwrite');
    const store = transaction.objectStore('media');
    const request = store.get(localId);
    request.onsuccess = () => {
      const previous = request.result as MediaCache | undefined;
      store.put({ ...previous, ...patch, localId });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function deleteMedia(localId: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('media', 'readwrite');
    transaction.objectStore('media').delete(localId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
