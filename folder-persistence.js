/* ============================================
   Enhanced Folder Persistence System v2.0
   Robust, efficient IndexedDB + Storage API implementation
   ============================================ */

class FolderPersistence {
    constructor() {
        // Database configuration
        this.DB_NAME = 'MusicPlayerDB';
        this.DB_VERSION = 2;
        this.STORE_NAME = 'folderHandles';
        this.META_STORE_NAME = 'folderMetadata';
        this.HISTORY_STORE_NAME = 'folderHistory';
        this.MAX_HISTORY = 10;
        
        // State
        this.db = null;
        this.isReady = false;
        this.initPromise = null;
        
        // In-memory cache to reduce DB reads
        this.cache = {
            metadata: null,
            history: null,
            lastCacheTime: 0,
            cacheTTL: 5000 // 5 seconds
        };
        
        // Start initialization immediately
        this.initPromise = this._initialize();
    }

    // ========== INITIALIZATION ==========

    async _initialize() {
        try {
            // Request persistent storage first
            await this._requestPersistentStorage();
            
            // Open database
            await this._openDB();
            
            // Verify database integrity
            await this._verifyDatabaseIntegrity();
            
            // Load initial cache
            await this._loadCache();
            
            this.isReady = true;
            console.log('✅ Folder Persistence System initialized');
            return true;
        } catch (err) {
            console.error('❌ Initialization failed:', err);
            this.isReady = false;
            return false;
        }
    }

    async _requestPersistentStorage() {
        if (!navigator.storage?.persist) {
            console.warn('⚠️ Persistent storage API not available');
            return false;
        }

        try {
            const isPersisted = await navigator.storage.persist();
            if (isPersisted) {
                console.log('✅ Storage will persist across sessions');
            } else {
                console.warn('⚠️ Storage may be cleared by browser');
            }
            return isPersisted;
        } catch (err) {
            console.error('❌ Failed to request persistent storage:', err);
            return false;
        }
    }

    async _openDB() {
        if (this.db?.name === this.DB_NAME) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                
                // Handle unexpected database closure
                this.db.onversionchange = () => {
                    this.db.close();
                    this.db = null;
                    this.isReady = false;
                    console.warn('⚠️ Database version changed');
                };
                
                this.db.onerror = (event) => {
                    console.error('❌ Database error:', event.target.error);
                };
                
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create stores if they don't exist
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
                
                if (!db.objectStoreNames.contains(this.META_STORE_NAME)) {
                    const metaStore = db.createObjectStore(this.META_STORE_NAME, { keyPath: 'id' });
                    metaStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                    metaStore.createIndex('folderName', 'folderName', { unique: false });
                }
                
                if (!db.objectStoreNames.contains(this.HISTORY_STORE_NAME)) {
                    const historyStore = db.createObjectStore(this.HISTORY_STORE_NAME, { 
                        keyPath: 'timestamp'
                    });
                    historyStore.createIndex('folderName', 'folderName', { unique: false });
                }
            };
            
            request.onblocked = () => {
                console.warn('⚠️ Database upgrade blocked. Close other tabs.');
                reject(new Error('Database upgrade blocked'));
            };
        });
    }

    async _verifyDatabaseIntegrity() {
        try {
            const stores = [this.STORE_NAME, this.META_STORE_NAME, this.HISTORY_STORE_NAME];
            const dbStores = Array.from(this.db.objectStoreNames);
            
            for (const store of stores) {
                if (!dbStores.includes(store)) {
                    throw new Error(`Missing store: ${store}`);
                }
            }
            
            return true;
        } catch (err) {
            console.error('❌ Database integrity check failed:', err);
            await this._repairDatabase();
            return false;
        }
    }

    async _repairDatabase() {
        console.log('🔧 Attempting database repair...');
        try {
            this.db?.close();
            this.db = null;
            
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(this.DB_NAME);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Delete blocked'));
            });
            
            await this._openDB();
            console.log('✅ Database repaired');
        } catch (err) {
            console.error('❌ Database repair failed:', err);
            throw err;
        }
    }

    async _loadCache() {
    try {
        // Only load cache if DB is ready (avoid loading during init)
        if (!this.db) return;
        
        const [metadata, history] = await Promise.all([
            this._readMetadata().catch(() => null),
            this._readHistory().catch(() => [])
        ]);
        
        this.cache.metadata = metadata;
        this.cache.history = history;
        this.cache.lastCacheTime = Date.now();
    } catch (err) {
        console.error('⚠️ Failed to load cache:', err);
        // Don't throw - cache loading is optional
    }
}

    _invalidateCache() {
        this.cache.metadata = null;
        this.cache.history = null;
        this.cache.lastCacheTime = 0;
    }

    _isCacheValid() {
        return Date.now() - this.cache.lastCacheTime < this.cache.cacheTTL;
    }

    async _ensureReady() {
        if (this.isReady && this.db) return true;
        
        if (this.initPromise) {
            await this.initPromise;
        }
        
        if (!this.isReady || !this.db) {
            await this._initialize();
        }
        
        if (!this.isReady || !this.db) {
            throw new Error('Database initialization failed');
        }
        
        return true;
    }

// ========== CORE DATABASE OPERATIONS ==========

async _executeTransaction(storeNames, mode, operation) {
    // DON'T call _ensureReady here - it causes circular dependency during init
    if (!this.db) {
        throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
        try {
            const tx = this.db.transaction(storeNames, mode);
            const stores = storeNames.length === 1 
                ? tx.objectStore(storeNames[0])
                : storeNames.map(name => tx.objectStore(name));
            
            let result;
            
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
            
            // Execute the operation
            const operationResult = operation(stores, tx);
            
            // Handle promises from operation
            if (operationResult instanceof Promise) {
                operationResult
                    .then(res => { result = res; })
                    .catch(reject);
            } else {
                result = operationResult;
            }
        } catch (err) {
            reject(err);
        }
    });
}

    async _readFromStore(storeName, key) {
        return this._executeTransaction([storeName], 'readonly', (store) => {
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        });
    }

    async _writeToStore(storeName, key, value) {
        return this._executeTransaction([storeName], 'readwrite', (store) => {
            return new Promise((resolve, reject) => {
                const request = store.put(value, key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        });
    }

    async _deleteFromStore(storeName, key) {
        return this._executeTransaction([storeName], 'readwrite', (store) => {
            return new Promise((resolve, reject) => {
                const request = store.delete(key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        });
    }

    async _getAllFromStore(storeName) {
        return this._executeTransaction([storeName], 'readonly', (store) => {
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        });
    }

    async _clearStore(storeName) {
        return this._executeTransaction([storeName], 'readwrite', (store) => {
            return new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        });
    }

    // ========== FOLDER HANDLE OPERATIONS ==========

    async saveFolderHandle(handle, options = {}) {
        try {
            await this._ensureReady();
            
            const metadata = {
                id: 'musicFolder',
                folderName: handle.name,
                lastAccessed: Date.now(),
                trackCount: options.trackCount || 0,
                hasLyrics: options.hasLyrics || false,
                hasAnalysis: options.hasAnalysis || false,
                totalSize: options.totalSize || 0,
                savedAt: Date.now()
            };
            
            // Save handle and metadata in parallel operations
            await Promise.all([
                this._writeToStore(this.STORE_NAME, 'musicFolder', handle),
                this._writeToStore(this.META_STORE_NAME, metadata.id, metadata),
                this._addToHistory(handle.name, metadata)
            ]);
            
            // Update localStorage for quick checks
            this._updateLocalStorage(handle.name);
            
            // Update cache
            this.cache.metadata = metadata;
            this.cache.lastCacheTime = Date.now();
            
            console.log(`✅ Folder "${handle.name}" saved successfully`);
            return { success: true, metadata };
        } catch (err) {
            console.error('❌ Save failed:', err);
            return { success: false, error: err.message };
        }
    }

    async loadFolderHandle() {
        try {
            await this._ensureReady();
            
            // Try cache first
            if (this._isCacheValid() && this.cache.metadata) {
                const handle = await this._readFromStore(this.STORE_NAME, 'musicFolder');
                if (handle) {
                    console.log(`✅ Loaded folder from cache: "${handle.name}"`);
                    return { handle, metadata: this.cache.metadata };
                }
            }
            
            // Load from database
            const [handle, metadata] = await Promise.all([
                this._readFromStore(this.STORE_NAME, 'musicFolder'),
                this._readMetadata()
            ]);
            
            if (!handle) {
                console.log('ℹ️ No saved folder found');
                return null;
            }
            
            // Update cache and last accessed time
            this.cache.metadata = metadata;
            this.cache.lastCacheTime = Date.now();
            
            // Update last accessed asynchronously (don't wait)
            this._updateLastAccessed().catch(err => 
                console.warn('⚠️ Failed to update last accessed:', err)
            );
            
            console.log(`✅ Loaded folder: "${handle.name}"`);
            return { handle, metadata };
        } catch (err) {
            console.error('❌ Load failed:', err);
            
            // Auto-cleanup on corruption
            if (err.name === 'InvalidStateError' || err.name === 'NotFoundError') {
                console.log('🔧 Cleaning up corrupted data...');
                await this.deleteFolderHandle();
            }
            
            return null;
        }
    }

    async deleteFolderHandle() {
        try {
            await this._ensureReady();
            
            // Delete handle and metadata in parallel
            await Promise.all([
                this._deleteFromStore(this.STORE_NAME, 'musicFolder'),
                this._deleteFromStore(this.META_STORE_NAME, 'musicFolder')
            ]);
            
            // Clear localStorage
            localStorage.removeItem('hasSavedFolder');
            localStorage.removeItem('savedFolderName');
            localStorage.removeItem('savedFolderTime');
            
            // Invalidate cache
            this._invalidateCache();
            
            console.log('🗑️ Folder handle deleted');
            return true;
        } catch (err) {
            console.error('❌ Delete failed:', err);
            return false;
        }
    }

    // ========== METADATA OPERATIONS ==========

    async _readMetadata() {
        return await this._readFromStore(this.META_STORE_NAME, 'musicFolder');
    }

    async getFolderMetadata() {
    try {
        await this._ensureReady(); // ADD THIS LINE
        
        // Return cached metadata if valid
        if (this._isCacheValid() && this.cache.metadata) {
            return this.cache.metadata;
        }
        
        const metadata = await this._readMetadata();
        
        // Update cache
        this.cache.metadata = metadata;
        this.cache.lastCacheTime = Date.now();
        
        return metadata;
    } catch (err) {
        console.error('⚠️ Failed to get metadata:', err);
        return null;
    }
}

    async updateMetadata(updates) {
        try {
            await this._ensureReady();
            
            const metadata = await this._readMetadata();
            if (!metadata) {
                console.warn('⚠️ No metadata to update');
                return false;
            }
            
            const updatedMetadata = {
                ...metadata,
                ...updates,
                lastAccessed: Date.now()
            };
            
            await this._writeToStore(this.META_STORE_NAME, updatedMetadata.id, updatedMetadata);
            
            // Update cache
            this.cache.metadata = updatedMetadata;
            this.cache.lastCacheTime = Date.now();
            
            console.log('✅ Metadata updated');
            return true;
        } catch (err) {
            console.error('❌ Update failed:', err);
            return false;
        }
    }

    async _updateLastAccessed() {
        try {
            const metadata = await this._readMetadata();
            if (!metadata) return false;
            
            metadata.lastAccessed = Date.now();
            await this._writeToStore(this.META_STORE_NAME, metadata.id, metadata);
            
            // Update cache
            this.cache.metadata = metadata;
            
            return true;
        } catch (err) {
            console.error('⚠️ Failed to update last accessed:', err);
            return false;
        }
    }

    // ========== HISTORY OPERATIONS ==========

    async _addToHistory(folderName, metadata) {
        try {
            const historyEntry = {
                timestamp: Date.now(),
                folderName: folderName,
                trackCount: metadata.trackCount || 0,
                hasLyrics: metadata.hasLyrics || false,
                hasAnalysis: metadata.hasAnalysis || false
            };
            
            await this._writeToStore(this.HISTORY_STORE_NAME, historyEntry.timestamp, historyEntry);
            
            // Prune old entries asynchronously
            this._pruneHistory().catch(err => 
                console.warn('⚠️ Failed to prune history:', err)
            );
            
            // Invalidate history cache
            this.cache.history = null;
            
            return true;
        } catch (err) {
            console.error('⚠️ Failed to add to history:', err);
            return false;
        }
    }

    async _readHistory() {
        const history = await this._getAllFromStore(this.HISTORY_STORE_NAME);
        return history.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getHistory() {
    try {
        await this._ensureReady(); // ADD THIS LINE
        
        // Return cached history if valid
        if (this._isCacheValid() && this.cache.history) {
            return this.cache.history;
        }
        
        const history = await this._readHistory();
        
        // Update cache
        this.cache.history = history;
        this.cache.lastCacheTime = Date.now();
        
        return history;
    } catch (err) {
        console.error('⚠️ Failed to get history:', err);
        return [];
    }
}

    async _pruneHistory() {
        try {
            await this._ensureReady();
            
            return this._executeTransaction([this.HISTORY_STORE_NAME], 'readwrite', async (store) => {
                return new Promise(async (resolve, reject) => {
                    try {
                        const getAllRequest = store.getAll();
                        
                        getAllRequest.onsuccess = () => {
                            const entries = getAllRequest.result;
                            
                            if (entries.length <= this.MAX_HISTORY) {
                                resolve(true);
                                return;
                            }
                            
                            // Sort by timestamp and keep only the most recent
                            entries.sort((a, b) => b.timestamp - a.timestamp);
                            const toDelete = entries.slice(this.MAX_HISTORY);
                            
                            // Delete old entries
                            let deletedCount = 0;
                            for (const entry of toDelete) {
                                const deleteRequest = store.delete(entry.timestamp);
                                deleteRequest.onsuccess = () => {
                                    deletedCount++;
                                    if (deletedCount === toDelete.length) {
                                        console.log(`🗑️ Pruned ${deletedCount} old history entries`);
                                        resolve(true);
                                    }
                                };
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            }
                        };
                        
                        getAllRequest.onerror = () => reject(getAllRequest.error);
                    } catch (err) {
                        reject(err);
                    }
                });
            });
        } catch (err) {
            console.error('⚠️ Prune failed:', err);
            return false;
        }
    }

    async clearHistory() {
        try {
            await this._clearStore(this.HISTORY_STORE_NAME);
            
            // Invalidate cache
            this.cache.history = null;
            
            console.log('🗑️ History cleared');
            return true;
        } catch (err) {
            console.error('❌ Clear history failed:', err);
            return false;
        }
    }

    // ========== PERMISSION & VALIDATION ==========

    async verifyFolderPermission(handle, autoRequest = true) {
        const options = { mode: 'read' };
        
        try {
            // First, try to query without triggering a prompt
            let currentPermission = await handle.queryPermission(options);
            
            if (currentPermission === 'granted') {
                // Double check by trying to access values (Windows sometimes reports 'granted' but fails access)
                try {
                    const iterator = handle.values();
                    await iterator.next();
                    return { granted: true, requested: false };
                } catch (accessErr) {
                    console.warn('⚠️ Permission reported as granted but access failed');
                    // Don't try to re-request automatically - needs user gesture on Windows
                    return { granted: false, needsGesture: true };
                }
            }
            
            if (autoRequest && (currentPermission === 'prompt' || currentPermission === 'denied')) {
                // On Windows, a user gesture is REQUIRED to trigger requestPermission.
                // This must be called from a click handler or similar.
                // Don't auto-request on page load - it will fail silently on Windows
                console.log('ℹ️ Permission needed - user must click to grant access');
                return { granted: false, needsGesture: true };
            }
            
            return { granted: currentPermission === 'granted', requested: false };
        } catch (err) {
            console.error('❌ Permission check failed:', err);
            return { granted: false, error: err.message };
        }
    }

    async requestFolderPermission(handle) {
        const options = { mode: 'read' };
        
        try {
            const requestedPermission = await handle.requestPermission(options);
            return { 
                granted: requestedPermission === 'granted', 
                requested: true 
            };
        } catch (reqErr) {
            console.error('❌ requestPermission failed:', reqErr);
            return { granted: false, error: reqErr.message, needsGesture: true };
        }
    }

    async validateFolder(handle) {
        try {
            const iterator = handle.values();
            await iterator.next();
            return true;
        } catch (err) {
            console.error('⚠️ Folder validation failed:', err);
            return false;
        }
    }

    // ========== QUICK ACCESS METHODS ==========

    hasSavedFolder() {
        return localStorage.getItem('hasSavedFolder') === 'true';
    }

    getQuickInfo() {
        if (!this.hasSavedFolder()) return null;
        
        const savedTime = parseInt(localStorage.getItem('savedFolderTime')) || 0;
        
        return {
            name: localStorage.getItem('savedFolderName'),
            savedAt: savedTime,
            daysAgo: Math.floor((Date.now() - savedTime) / (1000 * 60 * 60 * 24))
        };
    }

    _updateLocalStorage(folderName) {
        localStorage.setItem('hasSavedFolder', 'true');
        localStorage.setItem('savedFolderName', folderName);
        localStorage.setItem('savedFolderTime', Date.now().toString());
    }

    // ========== STORAGE INFORMATION ==========

    async getStorageEstimate() {
        if (!navigator.storage?.estimate) return null;
        
        try {
            return await navigator.storage.estimate();
        } catch (err) {
            console.error('⚠️ Storage estimate failed:', err);
            return null;
        }
    }

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    async getStats() {
        try {
            const estimate = await this.getStorageEstimate();
            const metadata = await this.getFolderMetadata();
            const history = await this.getHistory();
            
            if (!estimate) {
                return {
                    hasSavedFolder: this.hasSavedFolder(),
                    folderName: metadata?.folderName || null,
                    trackCount: metadata?.trackCount || 0,
                    historyCount: history.length
                };
            }
            
            return {
                storageUsed: estimate.usage,
                storageQuota: estimate.quota,
                percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2),
                hasSavedFolder: this.hasSavedFolder(),
                folderName: metadata?.folderName || null,
                trackCount: metadata?.trackCount || 0,
                historyCount: history.length,
                lastAccessed: metadata?.lastAccessed || null
            };
        } catch (err) {
            console.error('⚠️ Stats failed:', err);
            return null;
        }
    }

    // ========== EXPORT & BACKUP ==========

    async exportData() {
        try {
            const [metadata, history] = await Promise.all([
                this.getFolderMetadata(),
                this.getHistory()
            ]);
            
            return JSON.stringify({
                version: this.DB_VERSION,
                exportedAt: Date.now(),
                metadata,
                history
            }, null, 2);
        } catch (err) {
            console.error('❌ Export failed:', err);
            return null;
        }
    }

    // ========== CLEANUP & RESET ==========

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isReady = false;
            this._invalidateCache();
            console.log('🔒 Database connection closed');
        }
    }

    async reset() {
        try {
            this.close();
            
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(this.DB_NAME);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => {
                    console.warn('⚠️ Database deletion blocked. Close other tabs.');
                    // Try to continue anyway
                    resolve();
                };
            });
            
            // Clear localStorage
            localStorage.removeItem('hasSavedFolder');
            localStorage.removeItem('savedFolderName');
            localStorage.removeItem('savedFolderTime');
            
            console.log('🔄 System reset complete');
            return true;
        } catch (err) {
            console.error('❌ Reset failed:', err);
            return false;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FolderPersistence;
}