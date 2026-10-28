import { opSchema, type EditOutbox } from '@kimo/client';
import { z } from 'zod';

const editsSchema = z.array(
  z.object({ id: z.string(), ops: z.array(opSchema) }),
);
async function store() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kimo-edits', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('outbox');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const offlineOutbox: EditOutbox = {
  async read(id) {
    const db = await store();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('outbox').objectStore('outbox').get(id);
        request.onsuccess = () => {
          const result = editsSchema.safeParse(request.result ?? []);
          if (result.success) resolve(result.data);
          else reject(new Error('Could not read saved edits'));
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  },
  async write(id, edits) {
    const db = await store();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('outbox', 'readwrite');
        if (edits.length) tx.objectStore('outbox').put(edits, id);
        else tx.objectStore('outbox').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  },
};
