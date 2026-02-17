/* ============================================
   FOLDER PERSISTENCE v2.1
   IndexedDB folder handle storage.
   ============================================ */

class FolderPersistence {

    static DB_NAME    = 'MusicPlayerDB';
    static DB_VERSION = 2;

    // Store names
    static HANDLES  = 'folderHandles';
    static META     = 'folderMetadata';
    static HISTORY  = 'folderHistory';

    static MAX_HISTORY  = 10;
    static CACHE_TTL_MS = 5_000;

    constructor(debugLog = console.log) {
        this._log = debugLog;

        this._db          = null;
        this._ready       = false;
        this._failed      = false;   // latch — stops infinite retry in _ensureReady
        this._initPromise = this._initialize();

        this._cache = {
            metadata:  null,
            history:   null,
            updatedAt: 0,
        };
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    async _initialize() {
        if (this._failed) return false;
        try {
            await this._requestPersistentStorage();
            await this._openDB();
            await this._verifyIntegrity();
            await this._warmCache();
            this._ready = true;
            this._log('✅ FolderPersistence ready', 'success');
            return true;
        } catch (err) {
            this._failed = true;    // don't retry — let callers surface the error
            this._log(`❌ FolderPersistence init failed: ${err.message}`, 'error');
            return false;
        }
    }

    async _requestPersistentStorage() {
        if (!navigator.storage?.persist) return false;
        try {
            const ok = await navigator.storage.persist();
            this._log(`💾 Persistent storage: ${ok ? 'granted' : 'denied'}`, 'info');
            return ok;
        } catch {
            return false;
        }
    }

    async _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(FolderPersistence.DB_NAME, FolderPersistence.DB_VERSION);

            req.onerror   = () => reject(req.error);
            req.onblocked = () => reject(new Error('Database upgrade blocked — close other tabs'));

            req.onsuccess = () => {
                this._db = req.result;
                this._db.onversionchange = () => {
                    this._db.close();
                    this._db    = null;
                    this._ready = false;
                    this._log('⚠️ DB version changed — connection closed', 'warning');
                };
                this._db.onerror = (e) => {
                    this._log(`❌ DB error: ${e.target.error}`, 'error');
                };
                resolve(this._db);
            };

            req.onupgradeneeded = ({ target: { result: db } }) => {
                if (!db.objectStoreNames.contains(FolderPersistence.HANDLES)) {
                    db.createObjectStore(FolderPersistence.HANDLES);
                }
                if (!db.objectStoreNames.contains(FolderPersistence.META)) {
                    const s = db.createObjectStore(FolderPersistence.META, { keyPath: 'id' });
                    s.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                }
                if (!db.objectStoreNames.contains(FolderPersistence.HISTORY)) {
                    const s = db.createObjectStore(FolderPersistence.HISTORY, { keyPath: 'timestamp' });
                    s.createIndex('folderName', 'folderName', { unique: false });
                }
            };
        });
    }

    async _verifyIntegrity() {
        const required = [FolderPersistence.HANDLES, FolderPersistence.META, FolderPersistence.HISTORY];
        const existing = Array.from(this._db.objectStoreNames);
        const missing  = required.filter(s => !existing.includes(s));

        if (missing.length === 0) return;

        this._log(`🔧 Missing stores [${missing.join(', ')}] — rebuilding database`, 'warning');
        this._db.close();
        this._db = null;

        await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(FolderPersistence.DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
            req.onblocked = () => reject(new Error('Delete blocked'));
        });

        await this._openDB();
    }

    async _warmCache() {
        if (!this._db) return;
        const [metadata, history] = await Promise.all([
            this._readMeta().catch(() => null),
            this._readHistory().catch(() => []),
        ]);
        this._cache.metadata  = metadata;
        this._cache.history   = history;
        this._cache.updatedAt = Date.now();
    }

    // ─── Readiness guard ──────────────────────────────────────────────────────

    async _ensureReady() {
        if (this._ready && this._db) return;
        if (this._failed) throw new Error('FolderPersistence failed to initialise — check console for details');
        if (this._initPromise) await this._initPromise;
        if (!this._ready || !this._db) throw new Error('Database unavailable');
    }

    // ─── Core transaction helper ──────────────────────────────────────────────

    /**
     * Run `operation(store)` inside a single-store IDB transaction.
     *
     * The result is whatever `operation` returns (sync value or the resolved
     * value of a returned Promise). We wait for the inner Promise to settle
     * BEFORE letting the transaction complete, by keeping a pending IDB request
     * alive through the resolution.
     *
     * Key rule: `operation` must not `await` across IDB request boundaries —
     * doing so causes the transaction to auto-commit. Operations that need
     * multiple sequential requests should chain them via onsuccess callbacks.
     */
    _tx(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            if (!this._db) { reject(new Error('DB not open')); return; }

            let tx;
            try {
                tx = this._db.transaction(storeName, mode);
            } catch (err) {
                reject(err); return;
            }

            const store = tx.objectStore(storeName);

            tx.onerror  = () => reject(tx.error);
            tx.onabort  = () => reject(new Error('Transaction aborted'));

            let result;
            try {
                const ret = operation(store);
                if (ret instanceof Promise) {
                    ret.then(v => { result = v; }).catch(err => tx.abort());
                    // Keep the transaction open until our Promise resolves by
                    // reading a dummy value, then committing with oncomplete.
                    tx.oncomplete = () => resolve(result);
                } else {
                    result = ret;
                    tx.oncomplete = () => resolve(result);
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    // ─── Low-level store operations ───────────────────────────────────────────

    _get(storeName, key) {
        return this._tx(storeName, 'readonly', store =>
            new Promise((res, rej) => {
                const r = store.get(key);
                r.onsuccess = () => res(r.result);
                r.onerror   = () => rej(r.error);
            })
        );
    }

    _put(storeName, value, key) {
        return this._tx(storeName, 'readwrite', store =>
            new Promise((res, rej) => {
                // Stores with a keyPath ignore the explicit key argument
                const r = store.keyPath != null ? store.put(value) : store.put(value, key);
                r.onsuccess = () => res(r.result);
                r.onerror   = () => rej(r.error);
            })
        );
    }

    _delete(storeName, key) {
        return this._tx(storeName, 'readwrite', store =>
            new Promise((res, rej) => {
                const r = store.delete(key);
                r.onsuccess = () => res(true);
                r.onerror   = () => rej(r.error);
            })
        );
    }

    _getAll(storeName) {
        return this._tx(storeName, 'readonly', store =>
            new Promise((res, rej) => {
                const r = store.getAll();
                r.onsuccess = () => res(r.result);
                r.onerror   = () => rej(r.error);
            })
        );
    }

    _clear(storeName) {
        return this._tx(storeName, 'readwrite', store =>
            new Promise((res, rej) => {
                const r = store.clear();
                r.onsuccess = () => res(true);
                r.onerror   = () => rej(r.error);
            })
        );
    }

    // ─── Cache helpers ────────────────────────────────────────────────────────

    _cacheValid() {
        return Date.now() - this._cache.updatedAt < FolderPersistence.CACHE_TTL_MS;
    }

    _invalidateCache() {
        this._cache.metadata  = null;
        this._cache.history   = null;
        this._cache.updatedAt = 0;
    }

    // ─── Folder handle ────────────────────────────────────────────────────────

    async saveFolderHandle(handle, options = {}) {
        try {
            await this._ensureReady();

            const meta = {
                id:           'musicFolder',
                folderName:   handle.name,
                lastAccessed: Date.now(),
                savedAt:      Date.now(),
                trackCount:   options.trackCount   ?? 0,
                hasLyrics:    options.hasLyrics    ?? false,
                hasAnalysis:  options.hasAnalysis  ?? false,
                totalSize:    options.totalSize    ?? 0,
            };

            await Promise.all([
                this._put(FolderPersistence.HANDLES, handle, 'musicFolder'),
                this._put(FolderPersistence.META,    meta),
                this._addToHistory(handle.name, meta),
            ]);

            this._saveToLocalStorage(handle.name);
            this._cache.metadata  = meta;
            this._cache.updatedAt = Date.now();

            this._log(`✅ Folder "${handle.name}" saved`, 'success');
            return { success: true, metadata: meta };
        } catch (err) {
            this._log(`❌ saveFolderHandle failed: ${err.message}`, 'error');
            return { success: false, error: err.message };
        }
    }

    async loadFolderHandle() {
        try {
            await this._ensureReady();

            const [handle, metadata] = await Promise.all([
                this._get(FolderPersistence.HANDLES, 'musicFolder'),
                this._cacheValid() && this._cache.metadata
                    ? Promise.resolve(this._cache.metadata)
                    : this._readMeta(),
            ]);

            if (!handle) return null;

            this._cache.metadata  = metadata;
            this._cache.updatedAt = Date.now();

            // Touch last-accessed asynchronously — don't block the caller
            this._touchLastAccessed().catch(() => {});

            this._log(`✅ Loaded folder "${handle.name}"`, 'success');
            return { handle, metadata };
        } catch (err) {
            this._log(`❌ loadFolderHandle failed: ${err.message}`, 'error');

            if (err.name === 'InvalidStateError' || err.name === 'NotFoundError') {
                await this.deleteFolderHandle();
            }
            return null;
        }
    }

    async deleteFolderHandle() {
        try {
            await this._ensureReady();

            await Promise.all([
                this._delete(FolderPersistence.HANDLES, 'musicFolder'),
                this._delete(FolderPersistence.META,    'musicFolder'),
            ]);

            ['hasSavedFolder', 'savedFolderName', 'savedFolderTime']
                .forEach(k => localStorage.removeItem(k));

            this._invalidateCache();
            this._log('🗑️ Folder handle deleted', 'info');
            return true;
        } catch (err) {
            this._log(`❌ deleteFolderHandle failed: ${err.message}`, 'error');
            return false;
        }
    }

    // ─── Metadata ─────────────────────────────────────────────────────────────

    _readMeta() {
        return this._get(FolderPersistence.META, 'musicFolder');
    }

    async getFolderMetadata() {
        try {
            await this._ensureReady();
            if (this._cacheValid() && this._cache.metadata) return this._cache.metadata;
            const meta = await this._readMeta();
            this._cache.metadata  = meta;
            this._cache.updatedAt = Date.now();
            return meta;
        } catch (err) {
            this._log(`⚠️ getFolderMetadata failed: ${err.message}`, 'warning');
            return null;
        }
    }

    async updateMetadata(updates) {
        try {
            await this._ensureReady();
            const meta = await this._readMeta();
            if (!meta) { this._log('⚠️ No metadata to update', 'warning'); return false; }

            const updated = { ...meta, ...updates, lastAccessed: Date.now() };
            await this._put(FolderPersistence.META, updated);

            this._cache.metadata  = updated;
            this._cache.updatedAt = Date.now();
            return true;
        } catch (err) {
            this._log(`❌ updateMetadata failed: ${err.message}`, 'error');
            return false;
        }
    }

    async _touchLastAccessed() {
        const meta = await this._readMeta();
        if (!meta) return;
        await this._put(FolderPersistence.META, { ...meta, lastAccessed: Date.now() });
        this._cache.metadata = { ...meta, lastAccessed: Date.now() };
    }

    // ─── History ──────────────────────────────────────────────────────────────

    async _readHistory() {
        const all = await this._getAll(FolderPersistence.HISTORY);
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getHistory() {
        try {
            await this._ensureReady();
            if (this._cacheValid() && this._cache.history) return this._cache.history;
            const history = await this._readHistory();
            this._cache.history   = history;
            this._cache.updatedAt = Date.now();
            return history;
        } catch (err) {
            this._log(`⚠️ getHistory failed: ${err.message}`, 'warning');
            return [];
        }
    }

    async _addToHistory(folderName, meta) {
        await this._put(FolderPersistence.HISTORY, {
            timestamp:   Date.now(),
            folderName,
            trackCount:  meta.trackCount  ?? 0,
            hasLyrics:   meta.hasLyrics   ?? false,
            hasAnalysis: meta.hasAnalysis ?? false,
        });
        this._cache.history = null; // invalidate only the history slice
        this._pruneHistory().catch(() => {}); // best-effort, non-blocking
    }

    async _pruneHistory() {
        await this._ensureReady();
        return this._tx(FolderPersistence.HISTORY, 'readwrite', store =>
            new Promise((resolve, reject) => {
                const req = store.getAll();

                req.onsuccess = () => {
                    const entries = req.result;
                    if (entries.length <= FolderPersistence.MAX_HISTORY) {
                        resolve(true);
                        return;
                    }

                    entries.sort((a, b) => b.timestamp - a.timestamp);
                    const toDelete = entries.slice(FolderPersistence.MAX_HISTORY);
                    let remaining  = toDelete.length;

                    for (const entry of toDelete) {
                        const del      = store.delete(entry.timestamp);
                        del.onsuccess  = () => { if (--remaining === 0) resolve(true); };
                        del.onerror    = () => reject(del.error);
                    }
                };

                req.onerror = () => reject(req.error);
            })
        );
    }

    async clearHistory() {
        try {
            await this._clear(FolderPersistence.HISTORY);
            this._cache.history = null;
            this._log('🗑️ History cleared', 'info');
            return true;
        } catch (err) {
            this._log(`❌ clearHistory failed: ${err.message}`, 'error');
            return false;
        }
    }

    // ─── Permission helpers ───────────────────────────────────────────────────

    async verifyFolderPermission(handle) {
        try {
            const state = await handle.queryPermission({ mode: 'read' });
            if (state === 'granted') {
                // Verify the permission actually works — Chrome on Windows sometimes
                // reports 'granted' but still denies access
                try {
                    await handle.values().next();
                    return { granted: true };
                } catch {
                    return { granted: false, needsGesture: true };
                }
            }
            // 'prompt' or 'denied' — must be requested from a user gesture
            return { granted: false, needsGesture: true };
        } catch (err) {
            return { granted: false, error: err.message };
        }
    }

    async requestFolderPermission(handle) {
        try {
            const state = await handle.requestPermission({ mode: 'read' });
            return { granted: state === 'granted', requested: true };
        } catch (err) {
            return { granted: false, error: err.message, needsGesture: true };
        }
    }

    async validateFolder(handle) {
        try {
            await handle.values().next();
            return true;
        } catch {
            return false;
        }
    }

    // ─── Quick localStorage accessors (no async) ─────────────────────────────

    hasSavedFolder() {
        return localStorage.getItem('hasSavedFolder') === 'true';
    }

    getQuickInfo() {
        if (!this.hasSavedFolder()) return null;
        const savedAt = parseInt(localStorage.getItem('savedFolderTime') ?? '0', 10);
        return {
            name:    localStorage.getItem('savedFolderName'),
            savedAt,
            daysAgo: Math.floor((Date.now() - savedAt) / 86_400_000),
        };
    }

    _saveToLocalStorage(folderName) {
        localStorage.setItem('hasSavedFolder',  'true');
        localStorage.setItem('savedFolderName', folderName);
        localStorage.setItem('savedFolderTime', Date.now().toString());
    }

    // ─── Stats / export ───────────────────────────────────────────────────────

    async getStats() {
        try {
            const [estimate, metadata, history] = await Promise.all([
                navigator.storage?.estimate?.().catch(() => null) ?? null,
                this.getFolderMetadata(),
                this.getHistory(),
            ]);

            return {
                storageUsedMB:  estimate ? (estimate.usage  / 1_048_576).toFixed(2) : null,
                storageQuotaMB: estimate ? (estimate.quota  / 1_048_576).toFixed(2) : null,
                percentUsed:    estimate ? ((estimate.usage / estimate.quota) * 100).toFixed(1) : null,
                hasSavedFolder: this.hasSavedFolder(),
                folderName:     metadata?.folderName    ?? null,
                trackCount:     metadata?.trackCount    ?? 0,
                lastAccessed:   metadata?.lastAccessed  ?? null,
                historyCount:   history.length,
            };
        } catch (err) {
            this._log(`⚠️ getStats failed: ${err.message}`, 'warning');
            return null;
        }
    }

    async exportData() {
        try {
            const [metadata, history] = await Promise.all([
                this.getFolderMetadata(),
                this.getHistory(),
            ]);
            return JSON.stringify({ version: FolderPersistence.DB_VERSION, exportedAt: Date.now(), metadata, history }, null, 2);
        } catch (err) {
            this._log(`❌ exportData failed: ${err.message}`, 'error');
            return null;
        }
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    close() {
        if (this._db) {
            this._db.close();
            this._db    = null;
            this._ready = false;
            this._invalidateCache();
            this._log('🔒 DB connection closed', 'info');
        }
    }

    async reset() {
        try {
            this.close();
            await new Promise((resolve, reject) => {
                const req   = indexedDB.deleteDatabase(FolderPersistence.DB_NAME);
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
                req.onblocked = () => { this._log('⚠️ DB deletion blocked — close other tabs', 'warning'); resolve(); };
            });
            ['hasSavedFolder', 'savedFolderName', 'savedFolderTime']
                .forEach(k => localStorage.removeItem(k));
            this._failed = false; // allow re-init after reset
            this._log('🔄 FolderPersistence reset', 'info');
            return true;
        } catch (err) {
            this._log(`❌ reset failed: ${err.message}`, 'error');
            return false;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FolderPersistence;
}
