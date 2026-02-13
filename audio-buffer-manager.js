/* ============================================
   AUDIO BUFFER MANAGER
   Efficient audio buffering strategies for memory optimization
   ============================================ */

class AudioBufferManager {
    constructor(debugLog = console.log) {
        this.debugLog = debugLog;
        
        // Configuration based on device tier
        this.config = {
            deviceTier: 'medium',
            bufferSize: {
                high: 10 * 1024 * 1024,      // 10 MB for high-end devices
                medium: 5 * 1024 * 1024,     // 5 MB for medium devices
                low: 2 * 1024 * 1024         // 2 MB for low-end devices
            },
            preloadCount: {
                high: 3,    // Preload next 3 tracks
                medium: 2,  // Preload next 2 tracks
                low: 1      // Preload next 1 track
            },
            maxCachedTracks: {
                high: 10,
                medium: 5,
                low: 3
            }
        };
        
        // Buffer tracking
        this.buffers = new Map();           // trackIndex -> ArrayBuffer
        this.bufferMetadata = new Map();    // trackIndex -> metadata
        this.loadingPromises = new Map();   // trackIndex -> Promise
        
        // Statistics
        this.stats = {
            totalLoaded: 0,
            totalEvicted: 0,
            cacheHits: 0,
            cacheMisses: 0,
            memoryUsed: 0
        };
        
        // Playback state
        this.currentTrackIndex = -1;
        this.playlist = [];
        
        this.init();
    }
    
    // ========== INITIALIZATION ==========
    
    init() {
        // Detect device tier
        this.detectDeviceTier();
        
        // Set up memory monitoring
        this.startMemoryMonitoring();
        
        this.debugLog('✅ Audio Buffer Manager initialized', 'success');
    }
    
    detectDeviceTier() {
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 2;
        
        if (memory >= 8 && cores >= 4) {
            this.config.deviceTier = 'high';
        } else if (memory >= 4 && cores >= 2) {
            this.config.deviceTier = 'medium';
        } else {
            this.config.deviceTier = 'low';
        }
        
        this.debugLog(`📱 Device tier: ${this.config.deviceTier}`, 'info');
    }
    
    startMemoryMonitoring() {
        if (performance.memory) {
            setInterval(() => {
                const usedMB = performance.memory.usedJSHeapSize / 1048576;
                const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
                const usage = (usedMB / limitMB) * 100;
                
                // If memory usage is high, trigger cleanup
                if (usage > 80) {
                    this.debugLog('⚠️ High memory usage, cleaning up buffers', 'warning');
                    this.cleanupOldBuffers();
                }
            }, 5000);
        }
    }
    
    // ========== BUFFER MANAGEMENT ==========
    
    /**
     * Set the current playlist
     */
    setPlaylist(playlist) {
        this.playlist = playlist;
    }
    
    /**
     * Load audio buffer for a track
     * @param {number} trackIndex - Index in playlist
     * @param {File} audioFile - Audio file object
     * @returns {Promise<ArrayBuffer>}
     */
    async loadBuffer(trackIndex, audioFile) {
        // Check if already in cache
        if (this.buffers.has(trackIndex)) {
            this.stats.cacheHits++;
            this.updateAccessTime(trackIndex);
            return this.buffers.get(trackIndex);
        }
        
        // Check if already loading
        if (this.loadingPromises.has(trackIndex)) {
            return this.loadingPromises.get(trackIndex);
        }
        
        this.stats.cacheMisses++;
        
        // Start loading
        const loadPromise = this._loadAudioFile(audioFile, trackIndex);
        this.loadingPromises.set(trackIndex, loadPromise);
        
        try {
            const buffer = await loadPromise;
            
            // Store in cache
            this.buffers.set(trackIndex, buffer);
            this.bufferMetadata.set(trackIndex, {
                size: buffer.byteLength,
                loadedAt: Date.now(),
                lastAccessed: Date.now(),
                accessCount: 1
            });
            
            this.stats.totalLoaded++;
            this.stats.memoryUsed += buffer.byteLength;
            
            // Check if we need to evict old buffers
            this.enforceMemoryLimit();
            
            return buffer;
            
        } finally {
            this.loadingPromises.delete(trackIndex);
        }
    }
    
    async _loadAudioFile(audioFile, trackIndex) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = () => {
                this.debugLog(`❌ Failed to load audio buffer for track ${trackIndex}`, 'error');
                reject(new Error('Failed to load audio file'));
            };
            
            reader.readAsArrayBuffer(audioFile);
        });
    }
    
    /**
     * Preload buffers for upcoming tracks
     * @param {number} currentIndex - Current track index
     */
    async preloadUpcoming(currentIndex) {
        this.currentTrackIndex = currentIndex;
        
        const tier = this.config.deviceTier;
        const preloadCount = this.config.preloadCount[tier];
        
        const promises = [];
        
        for (let i = 1; i <= preloadCount; i++) {
            const nextIndex = currentIndex + i;
            
            if (nextIndex < this.playlist.length) {
                const track = this.playlist[nextIndex];
                
                // Only preload if not already in cache
                if (!this.buffers.has(nextIndex) && track.file) {
                    promises.push(
                        this.loadBuffer(nextIndex, track.file).catch(err => {
                            // Fail silently for preloading
                            this.debugLog(`⚠️ Preload failed for track ${nextIndex}`, 'warning');
                        })
                    );
                }
            }
        }
        
        if (promises.length > 0) {
            this.debugLog(`🔄 Preloading ${promises.length} upcoming tracks...`, 'info');
            await Promise.all(promises);
        }
    }
    
    /**
     * Get buffer for a track (load if not cached)
     * @param {number} trackIndex
     * @returns {Promise<ArrayBuffer>}
     */
    async getBuffer(trackIndex) {
        if (this.buffers.has(trackIndex)) {
            this.updateAccessTime(trackIndex);
            return this.buffers.get(trackIndex);
        }
        
        const track = this.playlist[trackIndex];
        if (!track || !track.file) {
            throw new Error('Track not found or has no file');
        }
        
        return this.loadBuffer(trackIndex, track.file);
    }
    
    /**
     * Clear buffer for a specific track
     */
    clearBuffer(trackIndex) {
        if (this.buffers.has(trackIndex)) {
            const metadata = this.bufferMetadata.get(trackIndex);
            this.stats.memoryUsed -= metadata.size;
            this.stats.totalEvicted++;
            
            this.buffers.delete(trackIndex);
            this.bufferMetadata.delete(trackIndex);
        }
    }
    
    /**
     * Clear all buffers
     */
    clearAllBuffers() {
        this.buffers.clear();
        this.bufferMetadata.clear();
        this.loadingPromises.clear();
        this.stats.memoryUsed = 0;
        
        this.debugLog('🧹 All audio buffers cleared', 'info');
    }
    
    // ========== MEMORY MANAGEMENT ==========
    
    updateAccessTime(trackIndex) {
        const metadata = this.bufferMetadata.get(trackIndex);
        if (metadata) {
            metadata.lastAccessed = Date.now();
            metadata.accessCount++;
        }
    }
    
    enforceMemoryLimit() {
        const tier = this.config.deviceTier;
        const maxSize = this.config.bufferSize[tier];
        const maxCached = this.config.maxCachedTracks[tier];
        
        // Check memory limit
        if (this.stats.memoryUsed > maxSize || this.buffers.size > maxCached) {
            this.evictLeastRecentlyUsed();
        }
    }
    
    evictLeastRecentlyUsed() {
        // Sort buffers by last access time
        const sortedBuffers = Array.from(this.bufferMetadata.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        
        // Keep current track and preload window
        const protectedIndices = new Set();
        protectedIndices.add(this.currentTrackIndex);
        
        const tier = this.config.deviceTier;
        const preloadCount = this.config.preloadCount[tier];
        
        for (let i = 1; i <= preloadCount; i++) {
            protectedIndices.add(this.currentTrackIndex + i);
        }
        
        // Evict oldest non-protected buffers
        for (const [trackIndex, metadata] of sortedBuffers) {
            if (protectedIndices.has(trackIndex)) {
                continue;
            }
            
            this.clearBuffer(trackIndex);
            
            // Check if we're under the limit now
            const tier = this.config.deviceTier;
            const maxSize = this.config.bufferSize[tier];
            const maxCached = this.config.maxCachedTracks[tier];
            
            if (this.stats.memoryUsed <= maxSize && this.buffers.size <= maxCached) {
                break;
            }
        }
    }
    
    cleanupOldBuffers() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        for (const [trackIndex, metadata] of this.bufferMetadata.entries()) {
            const age = now - metadata.lastAccessed;
            
            // Don't clean up current track or preload window
            if (trackIndex === this.currentTrackIndex) continue;
            
            const tier = this.config.deviceTier;
            const preloadCount = this.config.preloadCount[tier];
            const inPreloadWindow = trackIndex > this.currentTrackIndex && 
                                   trackIndex <= this.currentTrackIndex + preloadCount;
            
            if (!inPreloadWindow && age > maxAge) {
                this.clearBuffer(trackIndex);
            }
        }
    }
    
    // ========== STATISTICS ==========
    
    getStats() {
        const memoryUsedMB = (this.stats.memoryUsed / 1048576).toFixed(2);
        const tier = this.config.deviceTier;
        const limitMB = (this.config.bufferSize[tier] / 1048576).toFixed(2);
        
        const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
            ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
            : 0;
        
        return {
            ...this.stats,
            memoryUsedMB: `${memoryUsedMB} MB`,
            memoryLimitMB: `${limitMB} MB`,
            cachedTracks: this.buffers.size,
            hitRate: `${hitRate}%`,
            deviceTier: tier
        };
    }
    
    /**
     * Get detailed buffer information
     */
    getBufferInfo() {
        const info = [];
        
        for (const [trackIndex, metadata] of this.bufferMetadata.entries()) {
            info.push({
                trackIndex,
                sizeMB: (metadata.size / 1048576).toFixed(2),
                age: Math.round((Date.now() - metadata.loadedAt) / 1000),
                accessCount: metadata.accessCount,
                isCurrent: trackIndex === this.currentTrackIndex
            });
        }
        
        return info.sort((a, b) => a.trackIndex - b.trackIndex);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioBufferManager;
}
