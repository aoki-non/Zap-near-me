// Tiny promise-based IndexedDB cache: synced places + sync anchor.
// No dependency: the surface we need (get/put/delete/clear/getAll) is small.

import type { BtcMapPlace } from './btcmap'

const DB_NAME = 'zap-near-me'
const DB_VERSION = 1
const PLACES = 'places'
const META = 'meta'
const ANCHOR_KEY = 'btcmap-sync-anchor'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PLACES)) db.createObjectStore(PLACES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
        t.onerror = () => reject(t.error)
      }),
  )
}

export const getSyncAnchor = (): Promise<string | null> =>
  tx<string | undefined>(META, 'readonly', (s) => s.get(ANCHOR_KEY)).then((v) => v ?? null)

export const setSyncAnchor = (iso: string): Promise<void> =>
  tx(META, 'readwrite', (s) => s.put(iso, ANCHOR_KEY)).then(() => undefined)

export const upsertPlaces = (places: BtcMapPlace[]): Promise<void> =>
  openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(PLACES, 'readwrite')
        const store = t.objectStore(PLACES)
        for (const p of places) store.put(p)
        t.oncomplete = () => {
          db.close()
          resolve()
        }
        t.onerror = () => reject(t.error)
      }),
  )

export const deletePlaces = (ids: number[]): Promise<void> =>
  openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(PLACES, 'readwrite')
        const store = t.objectStore(PLACES)
        for (const id of ids) store.delete(id)
        t.oncomplete = () => {
          db.close()
          resolve()
        }
        t.onerror = () => reject(t.error)
      }),
  )

export const getAllCachedPlaces = (): Promise<BtcMapPlace[]> =>
  tx<BtcMapPlace[]>(PLACES, 'readonly', (s) => s.getAll() as IDBRequest<BtcMapPlace[]>)

export const clearPlaces = (): Promise<void> =>
  tx(PLACES, 'readwrite', (s) => s.clear()).then(() => undefined)
