/**
 * contactCache.js
 *
 * IndexedDB-backed per-user contact cache.
 * Keeps cached contacts completely isolated between user accounts.
 * Never stores data in service worker Cache Storage.
 *
 * Usage:
 *   await ContactCache.get(userId)          → Contact[] | null
 *   await ContactCache.set(userId, contacts)
 *   await ContactCache.clear(userId)        → on logout
 */

const DB_NAME = 'letuschat_cache';
const DB_VERSION = 1;
const STORE_NAME = 'contacts';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // keyPath = userId — each user has exactly one cached contacts array
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

export const ContactCache = {
  /**
   * Returns the cached contacts array for a user, or null if not cached yet.
   * @param {string} userId
   * @returns {Promise<Array|null>}
   */
  async get(userId) {
    if (!userId) return null;
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(userId);
        req.onsuccess = () => resolve(req.result?.contacts ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  /**
   * Saves a contacts array for a user. Overwrites any existing entry.
   * @param {string} userId
   * @param {Array} contacts
   */
  async set(userId, contacts) {
    if (!userId || !Array.isArray(contacts)) return;
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ userId, contacts, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Cache write failure is non-fatal — app still works via API.
    }
  },

  /**
   * Clears cached contacts for a specific user (call on logout).
   * @param {string} userId
   */
  async clear(userId) {
    if (!userId) return;
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(userId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Non-fatal
    }
  }
};

