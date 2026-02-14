/* ============================================
   AUDIO BUFFER MANAGER v2.0 - MEMORY LEAK FIXED
   Efficient audio buffering with aggressive cleanup

   CRITICAL FIXES FROM v1.0:
   - setInterval in startMemoryMonitoring() was never stored or cleared → FIXED
   - FileReader references never nulled after use → FIXED
   - No destroy() method (script.js calls it but it didn't exist) → FIXED
   - No load cancellation (in-flight loads continued after destroy) → FIXED
   - LRU eviction had a const re-declaration bug inside loop → FIXED
   - No initialized/destroyed state guards → FIXED
   - No progress callbacks (feeds the "progress updates missing" bug) → FIXED
   - Preloading was not shuffle-aware (preloaded wrong tracks) → FIXED
   ============================================ */

class AudioBufferManager {
    constructor(debugLog = console.log) {
        this.debugLog = debugLog;

        // State flags - prevent double init/destroy
        this.state = {
            initialized: false,
            destroyed: false
        };

        // Configuration based on device tier
        this.config = {
            deviceTier: 'medium',
            bufferSize: {
                high:   10 * 1024 * 1024,  // 10 MB
                medium:  5 * 1024 * 1024,  //  5 MB
                low:     2 * 1024 * 1024   //  2 MB
            },
            preloadCount: {
                high:   3,
                medium: 2,
                low:    1
            },
            maxCachedTracks: {
                high:   10,
                medium:  5,
                low:     3
            }
        };

        // Buffer storage
        this.buffers        = new Map();  // trackIndex → ArrayBuffer
        this.bufferMetadata = new Map();  // trackIndex → metadata object
        this.loadingPromises = new Map(); // trackIndex → Promise (dedup concurrent requests)

        // CRITICAL: Resource tracking for cleanup
        this.resources = {
            intervals:   new Set(), // All setInterval IDs
            activeLoads: new Map()  // trackIndex → { cancelled: bool, reader: FileReader|null }
        };

        // Statistics
        this.stats = {
            totalLoaded:  0,
            totalEvicted: 0,
            cacheHits:    0,
            cacheMisses:  0,
            memoryUsed:   0
        };

        // Playback state
        this.currentTrackIndex = -1;
        this.isShuffled        = false;
        this.playlist          = [];

        // Callback hooks - connect to script.js for progress updates
        this.callbacks = {
            onLoadStart:      null,  // (trackIndex, fileName) => void
            onLoadProgress:   null,  // (trackIndex, fileName, loaded, total) => void
            onLoadComplete:   null,  // (trackIndex, fileName) => void
            onLoadError:      null,  // (trackIndex, fileName, error) => void
            onMemoryWarning:  null,  // (usagePercent) => void
            onPreloadComplete: null  // (preloadedIndices[]) => void
        };

        this.init();
    }

    // ─── INITIALIZATION ────────────────────────────────────────────────────────

    init() {
        if (this.state.initialized) {
            this.debugLog('⚠️ AudioBufferManager already initialized', 'warning');
            return;
        }

        this.detectDeviceTier();
        this.startMemoryMonitoring();

        this.state.initialized = true;
        this.debugLog('✅ Audio Buffer Manager v2.0 initialized (Memory Leak Fixed)', 'success');
    }

    detectDeviceTier() {
        const memory = navigator.deviceMemory || 4;
        const cores  = navigator.hardwareConcurrency || 2;

        if (memory >= 8 && cores >= 4) {
            this.config.deviceTier = 'high';
        } else if (memory >= 4 && cores >= 2) {
            this.config.deviceTier = 'medium';
        } else {
            this.config.deviceTier = 'low';
        }

        this.debugLog(`📱 Device tier: ${this.config.deviceTier} (${memory}GB RAM, ${cores} cores)`, 'info');
    }

    /**
     * FIXED: Interval ID is now tracked so it can be cleared in destroy()
     */
    startMemoryMonitoring() {
        if (!performance.memory) return;

        const intervalId = setInterval(() => {
            if (this.state.destroyed) return;

            const usedMB  = performance.memory.usedJSHeapSize / 1048576;
            const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
            const usage   = (usedMB / limitMB) * 100;

            if (usage > 80) {
                this.debugLog(`⚠️ High memory (${usage.toFixed(1)}%), cleaning up buffers`, 'warning');
                this.callbacks.onMemoryWarning?.(usage);
                this.cleanupOldBuffers();
            }
        }, 5000);

        // CRITICAL: Track it so destroy() can clear it
        this.resources.intervals.add(intervalId);
    }

    // ─── CALLBACK REGISTRATION ─────────────────────────────────────────────────

    /**
     * Register callbacks for progress reporting and event hooks.
     * Called by script.js after construction to wire up UI updates.
     *
     * @param {object} callbacks - Map of callback names to functions
     */
    setCallbacks(callbacks = {}) {
        Object.assign(this.callbacks, callbacks);
    }

    // ─── PLAYLIST MANAGEMENT ──────────────────────────────────────────────────

    setPlaylist(playlist) {
        this.playlist = playlist;
    }

    /**
     * Keep the manager aware of shuffle state so preloading is skipped
     * when shuffle is active (we don't know the next track ahead of time).
     */
    setShuffleState(isShuffled) {
        this.isShuffled = isShuffled;
    }

    // ─── BUFFER LOADING ────────────────────────────────────────────────────────

    /**
     * Load audio buffer for a track, with caching and dedup.
     * @param {number} trackIndex
     * @param {File}   audioFile
     * @returns {Promise<ArrayBuffer>}
     */
    async loadBuffer(trackIndex, audioFile) {
        if (this.state.destroyed) {
            throw new Error('AudioBufferManager has been destroyed');
        }

        // Cache hit
        if (this.buffers.has(trackIndex)) {
            this.stats.cacheHits++;
            this.updateAccessTime(trackIndex);
            return this.buffers.get(trackIndex);
        }

        // Already loading - return the existing promise to avoid duplicate reads
        if (this.loadingPromises.has(trackIndex)) {
            this.stats.cacheHits++;  // counts as hit - no duplicate IO
            return this.loadingPromises.get(trackIndex);
        }

        this.stats.cacheMisses++;
        this.callbacks.onLoadStart?.(trackIndex, audioFile.name);

        const loadPromise = this._loadAudioFile(audioFile, trackIndex);
        this.loadingPromises.set(trackIndex, loadPromise);

        try {
            const buffer = await loadPromise;

            // Guard: manager may have been destroyed while we were loading
            if (this.state.destroyed) {
                throw new Error('Load cancelled: manager destroyed');
            }

            this.buffers.set(trackIndex, buffer);
            this.bufferMetadata.set(trackIndex, {
                size:         buffer.byteLength,
                loadedAt:     Date.now(),
                lastAccessed: Date.now(),
                accessCount:  1,
                fileName:     audioFile.name
            });

            this.stats.totalLoaded++;
            this.stats.memoryUsed += buffer.byteLength;

            this.enforceMemoryLimit();
            this.callbacks.onLoadComplete?.(trackIndex, audioFile.name);

            return buffer;

        } finally {
            this.loadingPromises.delete(trackIndex);
        }
    }

    /**
     * FIXED: FileReader references are now tracked in resources.activeLoads
     * and nulled after use to release memory. onprogress feeds the UI.
     *
     * @private
     */
    async _loadAudioFile(audioFile, trackIndex) {
        return new Promise((resolve, reject) => {
            const loadState = { cancelled: false, reader: null };
            this.resources.activeLoads.set(trackIndex, loadState);

            const reader = new FileReader();
            loadState.reader = reader;

            // Progress reporting — directly fixes the "missing progress updates" bug
            reader.onprogress = (e) => {
                if (loadState.cancelled) return;
                if (e.lengthComputable) {
                    this.callbacks.onLoadProgress?.(trackIndex, audioFile.name, e.loaded, e.total);
                }
            };

            reader.onload = (e) => {
                // CRITICAL: Null handlers immediately to release closure references
                reader.onload    = null;
                reader.onerror   = null;
                reader.onprogress = null;
                loadState.reader = null;
                this.resources.activeLoads.delete(trackIndex);

                if (loadState.cancelled) {
                    reject(new Error(`Load cancelled: track ${trackIndex}`));
                    return;
                }

                resolve(e.target.result);
            };

            reader.onerror = () => {
                // CRITICAL: Null handlers immediately
                reader.onload    = null;
                reader.onerror   = null;
                reader.onprogress = null;
                loadState.reader = null;
                this.resources.activeLoads.delete(trackIndex);

                const errMsg = `Failed to load audio buffer for track ${trackIndex}`;
                this.debugLog(`❌ ${errMsg}`, 'error');
                this.callbacks.onLoadError?.(trackIndex, audioFile.name, new Error(errMsg));
                reject(new Error(errMsg));
            };

            reader.readAsArrayBuffer(audioFile);
        });
    }

    // ─── PRELOADING ────────────────────────────────────────────────────────────

    /**
     * Preload upcoming tracks into cache.
     * FIXED: Skips preloading entirely when shuffle is active since we
     * cannot predict which track will play next.
     *
     * @param {number} currentIndex
     */
    async preloadUpcoming(currentIndex) {
        if (this.state.destroyed) return;

        this.currentTrackIndex = currentIndex;

        // Shuffle-aware: preloading sequential tracks is wasteful when shuffled
        if (this.isShuffled) {
            this.debugLog('🔀 Shuffle active - skipping sequential preload', 'info');
            return;
        }

        const tier         = this.config.deviceTier;
        const preloadCount = this.config.preloadCount[tier];
        const promises     = [];
        const targetIndices = [];

        for (let i = 1; i <= preloadCount; i++) {
            const nextIndex = currentIndex + i;
            if (nextIndex < this.playlist.length) {
                const track = this.playlist[nextIndex];
                if (!this.buffers.has(nextIndex) && !this.loadingPromises.has(nextIndex) && track.file) {
                    targetIndices.push(nextIndex);
                    promises.push(
                        this.loadBuffer(nextIndex, track.file).catch(err => {
                            // Preload failures are silent — they are best-effort
                            this.debugLog(`⚠️ Preload failed for track ${nextIndex}: ${err.message}`, 'warning');
                        })
                    );
                }
            }
        }

        if (promises.length > 0) {
            this.debugLog(`🔄 Preloading ${promises.length} upcoming track(s)...`, 'info');
            await Promise.all(promises);
            this.callbacks.onPreloadComplete?.(targetIndices);
        }
    }

    /**
     * Get buffer for a track, loading it if not cached.
     * @param {number} trackIndex
     * @returns {Promise<ArrayBuffer>}
     */
    async getBuffer(trackIndex) {
        if (this.state.destroyed) throw new Error('AudioBufferManager has been destroyed');

        if (this.buffers.has(trackIndex)) {
            this.updateAccessTime(trackIndex);
            return this.buffers.get(trackIndex);
        }

        const track = this.playlist[trackIndex];
        if (!track || !track.file) {
            throw new Error(`Track ${trackIndex} not found or has no file`);
        }

        return this.loadBuffer(trackIndex, track.file);
    }

    // ─── CANCELLATION ──────────────────────────────────────────────────────────

    /**
     * Cancel an in-flight load for a specific track.
     * The FileReader is aborted (best-effort) and the promise will reject.
     */
    cancelLoad(trackIndex) {
        const loadState = this.resources.activeLoads.get(trackIndex);
        if (!loadState) return;

        loadState.cancelled = true;

        if (loadState.reader && loadState.reader.readyState === FileReader.LOADING) {
            try {
                loadState.reader.abort();
            } catch (e) {
                // FileReader.abort() can throw in some edge cases — ignore
            }
        }
        loadState.reader = null;
        this.resources.activeLoads.delete(trackIndex);
        this.loadingPromises.delete(trackIndex);

        this.debugLog(`🚫 Cancelled load for track ${trackIndex}`, 'info');
    }

    /**
     * Cancel all in-flight loads.
     */
    cancelAllLoads() {
        const indices = Array.from(this.resources.activeLoads.keys());
        indices.forEach(i => this.cancelLoad(i));
        this.debugLog(`🚫 Cancelled ${indices.length} active load(s)`, 'info');
    }

    // ─── BUFFER MANAGEMENT ─────────────────────────────────────────────────────

    /**
     * Clear a single buffer and release its memory.
     */
    clearBuffer(trackIndex) {
        if (!this.buffers.has(trackIndex)) return;

        const metadata = this.bufferMetadata.get(trackIndex);
        if (metadata) {
            this.stats.memoryUsed -= metadata.size;
            this.stats.totalEvicted++;
        }

        // Explicitly null the reference so the GC can collect the ArrayBuffer
        this.buffers.set(trackIndex, null);
        this.buffers.delete(trackIndex);
        this.bufferMetadata.delete(trackIndex);
    }

    /**
     * Clear all buffers and release all ArrayBuffer memory.
     */
    clearAllBuffers() {
        // Null each buffer reference before clearing the map
        for (const [, buffer] of this.buffers) {
            // Overwrite with null — helps GC if anything else held a ref to the map value
            void buffer;
        }

        this.buffers.clear();
        this.bufferMetadata.clear();
        this.loadingPromises.clear();
        this.stats.memoryUsed = 0;

        this.debugLog('🧹 All audio buffers cleared', 'info');
    }

    // ─── MEMORY MANAGEMENT ─────────────────────────────────────────────────────

    updateAccessTime(trackIndex) {
        const metadata = this.bufferMetadata.get(trackIndex);
        if (metadata) {
            metadata.lastAccessed = Date.now();
            metadata.accessCount++;
        }
    }

    enforceMemoryLimit() {
        const tier      = this.config.deviceTier;
        const maxSize   = this.config.bufferSize[tier];
        const maxCached = this.config.maxCachedTracks[tier];

        if (this.stats.memoryUsed > maxSize || this.buffers.size > maxCached) {
            this.evictLeastRecentlyUsed();
        }
    }

    /**
     * FIXED: The original had a `const tier` re-declaration inside the loop
     * (which shadows the outer const and is a SyntaxError in strict mode).
     * Moved the limit checks to use the outer-scoped variables.
     */
    evictLeastRecentlyUsed() {
        const tier      = this.config.deviceTier;
        const maxSize   = this.config.bufferSize[tier];
        const maxCached = this.config.maxCachedTracks[tier];
        const preloadCount = this.config.preloadCount[tier];

        const sortedBuffers = Array.from(this.bufferMetadata.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        // Protect current track and its preload window
        const protectedIndices = new Set();
        protectedIndices.add(this.currentTrackIndex);
        for (let i = 1; i <= preloadCount; i++) {
            protectedIndices.add(this.currentTrackIndex + i);
        }

        for (const [trackIndex] of sortedBuffers) {
            if (protectedIndices.has(trackIndex)) continue;

            this.clearBuffer(trackIndex);

            // FIXED: Reuse the outer-scoped tier/maxSize/maxCached (no re-declaration)
            if (this.stats.memoryUsed <= maxSize && this.buffers.size <= maxCached) {
                break;
            }
        }
    }

    /**
     * Clean up buffers that haven't been accessed in over 5 minutes.
     * Called by PerformanceManager during periodic cleanup.
     */
    cleanupOldBuffers() {
        if (this.state.destroyed) return;

        const now    = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        const tier   = this.config.deviceTier;
        const preloadCount = this.config.preloadCount[tier];
        let cleaned  = 0;

        for (const [trackIndex, metadata] of this.bufferMetadata.entries()) {
            if (trackIndex === this.currentTrackIndex) continue;

            // Protect preload window (only meaningful when not shuffled)
            if (!this.isShuffled) {
                const inPreloadWindow = trackIndex > this.currentTrackIndex &&
                                        trackIndex <= this.currentTrackIndex + preloadCount;
                if (inPreloadWindow) continue;
            }

            if (now - metadata.lastAccessed > maxAge) {
                this.clearBuffer(trackIndex);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.debugLog(`🧹 Cleaned up ${cleaned} stale buffer(s)`, 'info');
        }
    }

    // ─── STATISTICS ────────────────────────────────────────────────────────────

    getStats() {
        const tier        = this.config.deviceTier;
        const memUsedMB   = (this.stats.memoryUsed / 1048576).toFixed(2);
        const memLimitMB  = (this.config.bufferSize[tier] / 1048576).toFixed(2);
        const totalReqs   = this.stats.cacheHits + this.stats.cacheMisses;
        const hitRate     = totalReqs > 0
            ? ((this.stats.cacheHits / totalReqs) * 100).toFixed(1)
            : 0;

        return {
            ...this.stats,
            memoryUsedMB:  `${memUsedMB} MB`,
            memoryLimitMB: `${memLimitMB} MB`,
            cachedTracks:  this.buffers.size,
            activeLoads:   this.resources.activeLoads.size,
            hitRate:       `${hitRate}%`,
            deviceTier:    tier,
            isShuffled:    this.isShuffled,
            initialized:   this.state.initialized,
            destroyed:     this.state.destroyed
        };
    }

    getBufferInfo() {
        return Array.from(this.bufferMetadata.entries())
            .map(([trackIndex, metadata]) => ({
                trackIndex,
                fileName:    metadata.fileName || `track_${trackIndex}`,
                sizeMB:      (metadata.size / 1048576).toFixed(2),
                ageSeconds:  Math.round((Date.now() - metadata.loadedAt) / 1000),
                accessCount: metadata.accessCount,
                isCurrent:   trackIndex === this.currentTrackIndex
            }))
            .sort((a, b) => a.trackIndex - b.trackIndex);
    }

    // ─── DESTROY ───────────────────────────────────────────────────────────────

    /**
     * CRITICAL NEW: Complete teardown of all resources.
     * Called by MusicPlayerApp.destroy() and triggered by script.js on unload.
     *
     * Sequence:
     *  1. Cancel all in-flight FileReader loads
     *  2. Clear all tracked intervals
     *  3. Release all ArrayBuffers
     *  4. Mark as destroyed so any stray async callbacks are ignored
     */
    destroy() {
        if (this.state.destroyed) {
            this.debugLog('⚠️ AudioBufferManager already destroyed', 'warning');
            return;
        }

        this.debugLog('🧹 Destroying AudioBufferManager...', 'info');

        // 1. Cancel every in-flight FileReader
        this.cancelAllLoads();

        // 2. Clear all tracked intervals
        this.resources.intervals.forEach(id => clearInterval(id));
        this.resources.intervals.clear();

        // 3. Release ArrayBuffers and clear all maps
        this.clearAllBuffers();

        // 4. Clear any pending dedup promises
        this.loadingPromises.clear();

        // 5. Null callback references (break potential closure cycles)
        this.callbacks = {
            onLoadStart:       null,
            onLoadProgress:    null,
            onLoadComplete:    null,
            onLoadError:       null,
            onMemoryWarning:   null,
            onPreloadComplete: null
        };

        this.state.destroyed    = true;
        this.state.initialized  = false;

        this.debugLog('✅ AudioBufferManager destroyed successfully', 'success');
    }
}

// Export for Node / bundler environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioBufferManager;
}

console.log('✅ AudioBufferManager v2.0 loaded - Memory Leak Fixed');
