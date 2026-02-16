/* ============================================
   AUDIO BUFFER MANAGER v3.0
   Clean, memory-safe audio buffering system
   ============================================ */

class AudioBufferManager {
    constructor(debugLog = console.log) {
        this.debugLog = debugLog;
        
        // Lifecycle state
        this._state = {
            initialized: false,
            destroyed: false
        };
        
        // Device-based configuration
        this._config = this._detectDeviceConfig();
        
        // Core storage
        this._buffers = new Map();
        this._metadata = new Map();
        this._pendingLoads = new Map();
        
        // Resource registry for cleanup
        this._resources = {
            intervals: new Set(),
            activeReaders: new Map(),
            blobUrls: new Set()
        };
        
        // Metrics
        this._stats = {
            totalLoaded: 0,
            totalEvicted: 0,
            cacheHits: 0,
            cacheMisses: 0,
            memoryUsed: 0
        };
        
        // Playback context
        this._playback = {
            currentIndex: -1,
            isShuffled: false,
            playlist: []
        };
        
        // External callbacks
        this._callbacks = this._createCallbackStubs();
        
        this._initialize();
    }
    
    // ========== INITIALIZATION ==========
    
    _initialize() {
        if (this._state.initialized) {
            this.debugLog('⚠️ Already initialized', 'warning');
            return;
        }
        
        this._startMemoryMonitoring();
        this._state.initialized = true;
        
        this.debugLog(`✅ AudioBufferManager v3.0 initialized (${this._config.tier} tier)`, 'success');
    }
    
    _detectDeviceConfig() {
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 2;
        
        let tier = 'medium';
        if (memory >= 8 && cores >= 4) tier = 'high';
        else if (memory < 4 || cores < 2) tier = 'low';
        
        const configs = {
            high: { maxMemory: 10 * 1024 * 1024, maxTracks: 10, preloadCount: 3 },
            medium: { maxMemory: 5 * 1024 * 1024, maxTracks: 5, preloadCount: 2 },
            low: { maxMemory: 2 * 1024 * 1024, maxTracks: 3, preloadCount: 1 }
        };
        
        return { tier, ...configs[tier], memory, cores };
    }
    
    _startMemoryMonitoring() {
        if (!performance.memory) return;
        
        const intervalId = setInterval(() => {
            if (this._state.destroyed) return;
            
            const usage = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
            
            if (usage > 80) {
                this.debugLog(`⚠️ Memory pressure at ${usage.toFixed(1)}%`, 'warning');
                this._callbacks.onMemoryWarning?.(usage);
                this._evictStaleBuffers();
            }
        }, 5000);
        
        this._resources.intervals.add(intervalId);
    }
    
    _createCallbackStubs() {
        return {
            onLoadStart: null,
            onLoadProgress: null,
            onLoadComplete: null,
            onLoadError: null,
            onMemoryWarning: null,
            onPreloadComplete: null
        };
    }
    
    // ========== PUBLIC API ==========
    
    setCallbacks(callbacks = {}) {
        Object.assign(this._callbacks, callbacks);
    }
    
    setPlaylist(playlist) {
        this._playback.playlist = playlist;
    }
    
    setShuffleState(isShuffled) {
        this._playback.isShuffled = isShuffled;
    }
    
    async loadBuffer(trackIndex, audioFile) {
        this._ensureNotDestroyed();
        
        // Check cache first
        if (this._buffers.has(trackIndex)) {
            this._stats.cacheHits++;
            this._touchMetadata(trackIndex);
            return this._buffers.get(trackIndex);
        }
        
        // Deduplicate concurrent requests
        if (this._pendingLoads.has(trackIndex)) {
            this._stats.cacheHits++;
            return this._pendingLoads.get(trackIndex);
        }
        
        // New load
        this._stats.cacheMisses++;
        this._callbacks.onLoadStart?.(trackIndex, audioFile.name);
        
        const loadPromise = this._performLoad(trackIndex, audioFile);
        this._pendingLoads.set(trackIndex, loadPromise);
        
        try {
            const buffer = await loadPromise;
            this._storeBuffer(trackIndex, buffer, audioFile.name);
            this._callbacks.onLoadComplete?.(trackIndex, audioFile.name);
            return buffer;
        } catch (error) {
            this._callbacks.onLoadError?.(trackIndex, audioFile.name, error);
            throw error;
        } finally {
            this._pendingLoads.delete(trackIndex);
        }
    }
    
    async getBuffer(trackIndex) {
        this._ensureNotDestroyed();
        
        if (this._buffers.has(trackIndex)) {
            this._touchMetadata(trackIndex);
            return this._buffers.get(trackIndex);
        }
        
        const track = this._playback.playlist[trackIndex];
        if (!track?.file) {
            throw new Error(`Track ${trackIndex} not available`);
        }
        
        return this.loadBuffer(trackIndex, track.file);
    }
    
    async preloadUpcoming(currentIndex) {
        if (this._state.destroyed || this._playback.isShuffled) {
            return;
        }
        
        this._playback.currentIndex = currentIndex;
        
        const targets = this._calculatePreloadTargets(currentIndex);
        if (targets.length === 0) return;
        
        this.debugLog(`🔄 Preloading ${targets.length} track(s)`, 'info');
        
        const results = await Promise.allSettled(
            targets.map(idx => {
                const track = this._playback.playlist[idx];
                return this.loadBuffer(idx, track.file);
            })
        );
        
        const successful = targets.filter((_, i) => results[i].status === 'fulfilled');
        this._callbacks.onPreloadComplete?.(successful);
    }
    
    cancelLoad(trackIndex) {
        const reader = this._resources.activeReaders.get(trackIndex);
        if (!reader) return;
        
        reader.cancelled = true;
        
        if (reader.instance?.readyState === FileReader.LOADING) {
            try {
                reader.instance.abort();
            } catch (e) {
                // Ignore abort errors
            }
        }
        
        this._cleanupReader(trackIndex);
        this._pendingLoads.delete(trackIndex);
        
        this.debugLog(`🚫 Cancelled load for track ${trackIndex}`, 'info');
    }
    
    cancelAllLoads() {
        const indices = Array.from(this._resources.activeReaders.keys());
        indices.forEach(idx => this.cancelLoad(idx));
        this.debugLog(`🚫 Cancelled ${indices.length} load(s)`, 'info');
    }
    
    clearBuffer(trackIndex) {
        if (!this._buffers.has(trackIndex)) return;
        
        const meta = this._metadata.get(trackIndex);
        if (meta) {
            this._stats.memoryUsed -= meta.size;
            this._stats.totalEvicted++;
        }
        
        this._buffers.delete(trackIndex);
        this._metadata.delete(trackIndex);
    }
    
    clearAllBuffers() {
        this._buffers.clear();
        this._metadata.clear();
        this._pendingLoads.clear();
        this._stats.memoryUsed = 0;
        
        this.debugLog('🧹 All buffers cleared', 'info');
    }
    
    getStats() {
        const hitRate = (this._stats.cacheHits + this._stats.cacheMisses) > 0
            ? ((this._stats.cacheHits / (this._stats.cacheHits + this._stats.cacheMisses)) * 100).toFixed(1)
            : '0';
        
        return {
            ...this._stats,
            memoryUsedMB: (this._stats.memoryUsed / 1048576).toFixed(2),
            memoryLimitMB: (this._config.maxMemory / 1048576).toFixed(2),
            cachedTracks: this._buffers.size,
            activeLoads: this._resources.activeReaders.size,
            hitRate: `${hitRate}%`,
            deviceTier: this._config.tier,
            isShuffled: this._playback.isShuffled,
            initialized: this._state.initialized,
            destroyed: this._state.destroyed
        };
    }
    
    getBufferInfo() {
        return Array.from(this._metadata.entries())
            .map(([trackIndex, meta]) => ({
                trackIndex,
                fileName: meta.fileName || `track_${trackIndex}`,
                sizeMB: (meta.size / 1048576).toFixed(2),
                ageSeconds: Math.round((Date.now() - meta.loadedAt) / 1000),
                accessCount: meta.accessCount,
                isCurrent: trackIndex === this._playback.currentIndex
            }))
            .sort((a, b) => a.trackIndex - b.trackIndex);
    }
    
    destroy() {
        if (this._state.destroyed) {
            this.debugLog('⚠️ Already destroyed', 'warning');
            return;
        }
        
        this.debugLog('🧹 Destroying AudioBufferManager...', 'info');
        
        // Cancel all active operations
        this.cancelAllLoads();
        
        // Clear all intervals
        this._resources.intervals.forEach(id => clearInterval(id));
        this._resources.intervals.clear();
        
        // Revoke blob URLs
        this._resources.blobUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {
                // Ignore revoke errors
            }
        });
        this._resources.blobUrls.clear();
        
        // Clear all buffers
        this.clearAllBuffers();
        
        // Null callbacks to break closure chains
        Object.keys(this._callbacks).forEach(key => {
            this._callbacks[key] = null;
        });
        
        // Mark as destroyed
        this._state.destroyed = true;
        this._state.initialized = false;
        
        this.debugLog('✅ AudioBufferManager destroyed', 'success');
    }
    
    // ========== INTERNAL OPERATIONS ==========
    
    async _performLoad(trackIndex, audioFile) {
        return new Promise((resolve, reject) => {
            const readerState = {
                cancelled: false,
                instance: null
            };
            
            this._resources.activeReaders.set(trackIndex, readerState);
            
            const reader = new FileReader();
            readerState.instance = reader;
            
            reader.onprogress = (e) => {
                if (readerState.cancelled) return;
                if (e.lengthComputable) {
                    this._callbacks.onLoadProgress?.(trackIndex, audioFile.name, e.loaded, e.total);
                }
            };
            
            reader.onload = (e) => {
                this._cleanupReader(trackIndex);
                
                if (readerState.cancelled || this._state.destroyed) {
                    reject(new Error(`Load cancelled: track ${trackIndex}`));
                    return;
                }
                
                resolve(e.target.result);
            };
            
            reader.onerror = () => {
                this._cleanupReader(trackIndex);
                reject(new Error(`Failed to load track ${trackIndex}`));
            };
            
            reader.readAsArrayBuffer(audioFile);
        });
    }
    
    _cleanupReader(trackIndex) {
        const reader = this._resources.activeReaders.get(trackIndex);
        if (!reader?.instance) return;
        
        // Null out all handlers to break circular references
        reader.instance.onload = null;
        reader.instance.onerror = null;
        reader.instance.onprogress = null;
        reader.instance = null;
        
        this._resources.activeReaders.delete(trackIndex);
    }
    
    _storeBuffer(trackIndex, buffer, fileName) {
        if (this._state.destroyed) {
            throw new Error('Manager destroyed during storage');
        }
        
        this._buffers.set(trackIndex, buffer);
        this._metadata.set(trackIndex, {
            size: buffer.byteLength,
            loadedAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 1,
            fileName
        });
        
        this._stats.totalLoaded++;
        this._stats.memoryUsed += buffer.byteLength;
        
        this._enforceMemoryLimits();
    }
    
    _touchMetadata(trackIndex) {
        const meta = this._metadata.get(trackIndex);
        if (meta) {
            meta.lastAccessed = Date.now();
            meta.accessCount++;
        }
    }
    
    _enforceMemoryLimits() {
        if (this._stats.memoryUsed > this._config.maxMemory || 
            this._buffers.size > this._config.maxTracks) {
            this._evictLRU();
        }
    }
    
    _evictLRU() {
        const protected = this._getProtectedIndices();
        
        const candidates = Array.from(this._metadata.entries())
            .filter(([idx]) => !protected.has(idx))
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        
        for (const [trackIndex] of candidates) {
            this.clearBuffer(trackIndex);
            
            if (this._stats.memoryUsed <= this._config.maxMemory && 
                this._buffers.size <= this._config.maxTracks) {
                break;
            }
        }
    }
    
    _evictStaleBuffers() {
        if (this._state.destroyed) return;
        
        const maxAge = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        const protected = this._getProtectedIndices();
        
        let evicted = 0;
        
        for (const [trackIndex, meta] of this._metadata.entries()) {
            if (protected.has(trackIndex)) continue;
            
            if (now - meta.lastAccessed > maxAge) {
                this.clearBuffer(trackIndex);
                evicted++;
            }
        }
        
        if (evicted > 0) {
            this.debugLog(`🧹 Evicted ${evicted} stale buffer(s)`, 'info');
        }
    }
    
    _getProtectedIndices() {
        const protected = new Set();
        protected.add(this._playback.currentIndex);
        
        // Protect preload window (only when not shuffled)
        if (!this._playback.isShuffled) {
            for (let i = 1; i <= this._config.preloadCount; i++) {
                protected.add(this._playback.currentIndex + i);
            }
        }
        
        return protected;
    }
    
    _calculatePreloadTargets(currentIndex) {
        const targets = [];
        const maxIndex = this._playback.playlist.length - 1;
        
        for (let i = 1; i <= this._config.preloadCount; i++) {
            const nextIndex = currentIndex + i;
            
            if (nextIndex > maxIndex) break;
            
            const track = this._playback.playlist[nextIndex];
            if (!track?.file) continue;
            
            // Skip if already cached or loading
            if (this._buffers.has(nextIndex) || this._pendingLoads.has(nextIndex)) {
                continue;
            }
            
            targets.push(nextIndex);
        }
        
        return targets;
    }
    
    _ensureNotDestroyed() {
        if (this._state.destroyed) {
            throw new Error('AudioBufferManager has been destroyed');
        }
    }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioBufferManager;
}

console.log('✅ AudioBufferManager v3.0 loaded - Clean & memory-safe');
