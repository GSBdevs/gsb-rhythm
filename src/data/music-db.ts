/**
 * Música do operador no IndexedDB — arquivos de áudio não cabem em
 * localStorage (limite ~5 MB). Funciona em web, Electron e Capacitor
 * (todos são webview com IndexedDB).
 */

const DB_NAME = 'sb-rhythm';
const STORE = 'music';
const KEY = 'current';

export interface StoredMusic {
  blob: Blob;
  name: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMusic(music: StoredMusic): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (s) => s.put(music, KEY));
  } finally {
    db.close();
  }
}

export async function loadMusic(): Promise<StoredMusic | null> {
  try {
    const db = await openDb();
    try {
      const val = await tx<unknown>(db, 'readonly', (s) => s.get(KEY));
      if (val && typeof val === 'object' && 'blob' in val && 'name' in val) return val as StoredMusic;
      return null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function deleteMusic(): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (s) => s.delete(KEY));
  } finally {
    db.close();
  }
}
