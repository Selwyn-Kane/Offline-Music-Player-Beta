/* ============================================
   AUDIO BUFFER MANAGER v3.1
   Clean, memory-safe audio buffering system
   ============================================ */

class AudioBufferManager {

    // ─── Tier config ──────────────────────────────────────────────────────────
    // Memory limits are sized for real-world audio ArrayBuffers.
    // A typical 4-minute MP3 @ 320 kbps ≈ 9–10 MB once read into an ArrayBuffer,
    // so even the "low" tier comfortably holds several tracks.
    static TIER_CONFIGS = {
        high:   { maxMemoryMB: 400, maxTracks: 30, preloadCount: 3 },
        medium: { maxMemoryMB: 150, maxTracks: 15, preloadCount: 2 },
        low:    { maxMemoryMB:  50, maxTracks:  6, preloadCount: 1 },
    };

    // How often (ms) to run the background memory check.
    // Audio files are large; a 30-second interval is plenty.
    static MEMORY_CHECK_INTERVAL_MS = 30_000;

    // Buffers not accessed within this window are eligible for stale eviction.
    static STALE_AGE_MS = 5 * 60_000; // 5 minutes

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(debugLog = console.log) {
        this._log = debugLog;

        this._alive       = true;   // false after destroy()
        this._config      = this._buildConfig();

        // Core storage
        this._buffers     = new Map();  // trackIndex → ArrayBuffer
        this._meta        = new Map();  // trackIndex → { size, loadedAt, lastAccessed, accessCount, fileName }
        this._pending     = new Map();  // trackIndex → Promise<ArrayBuffer>  (in-flight dedup)

        // Active FileReader handles so we can abort them
        this._readers     = new Map();  // trackIndex → { reader: FileReader, cancelled: bool }

        // Registered interval IDs for clean teardown
        this._intervals   = new Set();

        // Stats
        this._stats = { loaded: 0, evicted: 0, hits: 0, misses: 0, bytesUsed: 0 };

        // Playback context (used for protection + preload targeting)
        this._playlist      = [];
        this._currentIndex  = -1;
        this._isShuffled    = false;

        // Callbacks (all optional)
        this._cb = {
            onLoadStart:       null,
            onLoadProgress:    null,
            onLoadComplete:    null,
            onLoadError:       null,
            onMemoryWarning:   null,
            onPreloadComplete: null,
        };

        this._startMemoryMonitor();
        this._log(`✅ AudioBufferManager v3.1 (${this._config.tier} tier, `
            + `${this._config.maxMemoryMB} MB / ${this._config.maxTracks} tracks)`, 'success');
    }

    // ─── Configuration ────────────────────────────────────────────────────────

    _buildConfig() {
        const memory = navigator.deviceMemory  ?? 4;
        const cores  = navigator.hardwareConcurrency ?? 2;

        let tier = 'medium';
        if (memory >= 8 && cores >= 4) tier = 'high';
        else if (memory < 4 || cores < 2) tier = 'low';

        const { maxMemoryMB, maxTracks, preloadCount } = AudioBufferManager.TIER_CONFIGS[tier];
        return {
            tier,
            maxMemory:    maxMemoryMB * 1_048_576,
            maxMemoryMB,
            maxTracks,
            preloadCount,
        };
    }

    // ─── Memory monitor ───────────────────────────────────────────────────────

    _startMemoryMonitor() {
        if (!performance.memory) return;

        const id = setInterval(() => {
            if (!this._alive) return;

            const usagePct = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
            if (usagePct > 80) {
                this._log(`⚠️ Heap at ${usagePct.toFixed(1)}% — evicting stale buffers`, 'warning');
                this._cb.onMemoryWarning?.(usagePct);
                this._evict({ staleOnly: true });
            }
        }, AudioBufferManager.MEMORY_CHECK_INTERVAL_MS);

        this._intervals.add(id);
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    setCallbacks(callbacks = {}) {
        Object.assign(this._cb, callbacks);
    }

    setPlaylist(playlist) {
        this._playlist = playlist;
    }

    setShuffleState(isShuffled) {
        this._isShuffled = isShuffled;
    }

    /**
     * Load a specific file into the buffer cache.
     * If an identical load is already in-flight, the same Promise is returned (dedup).
     */
    async loadBuffer(trackIndex, audioFile) {
        this._assertAlive();

        // Cache hit
        if (this._buffers.has(trackIndex)) {
            this._touch(trackIndex);
            this._stats.hits++;
            return this._buffers.get(trackIndex);
        }

        // In-flight dedup (not a true hit — don't inflate hit counter)
        if (this._pending.has(trackIndex)) {
            return this._pending.get(trackIndex);
        }

        // New load
        this._stats.misses++;
        this._cb.onLoadStart?.(trackIndex, audioFile.name);

        const promise = this._read(trackIndex, audioFile)
            .then(buffer => {
                this._store(trackIndex, buffer, audioFile.name);
                this._cb.onLoadComplete?.(trackIndex, audioFile.name);
                return buffer;
            })
            .catch(err => {
                this._cb.onLoadError?.(trackIndex, audioFile.name, err);
                throw err;
            })
            .finally(() => {
                this._pending.delete(trackIndex);
            });

        this._pending.set(trackIndex, promise);
        return promise;
    }

    /**
     * Get a buffer by playlist index. Loads from the playlist's file reference if needed.
     */
    async getBuffer(trackIndex) {
        this._assertAlive();

        if (this._buffers.has(trackIndex)) {
            this._touch(trackIndex);
            return this._buffers.get(trackIndex);
        }

        const track = this._playlist[trackIndex];
        if (!track?.file) throw new Error(`Track ${trackIndex} has no file reference`);

        return this.loadBuffer(trackIndex, track.file);
    }

    /**
     * Kick off background preloading for the next N tracks after currentIndex.
     * No-op when shuffled (unpredictable order makes preloading wasteful).
     */
    async preloadUpcoming(currentIndex) {
        if (!this._alive || this._isShuffled) return;

        this._currentIndex = currentIndex;
        const targets = this._preloadTargets(currentIndex);
        if (!targets.length) return;

        this._log(`🔄 Preloading ${targets.length} track(s)`, 'info');

        const results = await Promise.allSettled(
            targets.map(idx => this.loadBuffer(idx, this._playlist[idx].file))
        );

        const succeeded = targets.filter((_, i) => results[i].status === 'fulfilled');
        if (succeeded.length) this._cb.onPreloadComplete?.(succeeded);
    }

    /** Abort an in-flight load for the given track. */
    cancelLoad(trackIndex) {
        const entry = this._readers.get(trackIndex);
        if (!entry) return;

        entry.cancelled = true;
        if (entry.reader.readyState === FileReader.LOADING) {
            try { entry.reader.abort(); } catch (_) {}
        }
        this._cleanupReader(trackIndex);
        this._pending.delete(trackIndex);
        this._log(`🚫 Cancelled load for track ${trackIndex}`, 'info');
    }

    /** Abort all in-flight loads. */
    cancelAllLoads() {
        const count = this._readers.size;
        for (const idx of [...this._readers.keys()]) this.cancelLoad(idx);
        if (count) this._log(`🚫 Cancelled ${count} load(s)`, 'info');
    }

    /** Remove a single buffer from cache. */
    clearBuffer(trackIndex) {
        const meta = this._meta.get(trackIndex);
        if (!meta) return;

        this._stats.bytesUsed -= meta.size;
        this._stats.evicted++;
        this._buffers.delete(trackIndex);
        this._meta.delete(trackIndex);
    }

    /** Remove all buffers and reset byte counter. */
    clearAllBuffers() {
        this._buffers.clear();
        this._meta.clear();
        this._pending.clear();
        this._stats.bytesUsed = 0;
        this._log('🧹 All buffers cleared', 'info');
    }

    /** Snapshot of current statistics. */
    getStats() {
        const total    = this._stats.hits + this._stats.misses;
        const hitRate  = total ? ((this._stats.hits / total) * 100).toFixed(1) + '%' : '0%';
        return {
            loaded:       this._stats.loaded,
            evicted:      this._stats.evicted,
            hits:         this._stats.hits,
            misses:       this._stats.misses,
            bytesUsed:    this._stats.bytesUsed,
            memoryUsedMB: (this._stats.bytesUsed / 1_048_576).toFixed(2),
            memoryLimitMB:this._config.maxMemoryMB.toString(),
            cachedTracks: this._buffers.size,
            activeLoads:  this._readers.size,
            hitRate,
            deviceTier:   this._config.tier,
            isShuffled:   this._isShuffled,
            destroyed:    !this._alive,
        };
    }

    /** Detailed per-buffer info, sorted by track index. */
    getBufferInfo() {
        const now = Date.now();
        return [...this._meta.entries()]
            .map(([idx, meta]) => ({
                trackIndex:  idx,
                fileName:    meta.fileName,
                sizeMB:      (meta.size / 1_048_576).toFixed(2),
                ageSeconds:  Math.round((now - meta.loadedAt) / 1000),
                accessCount: meta.accessCount,
                isCurrent:   idx === this._currentIndex,
            }))
            .sort((a, b) => a.trackIndex - b.trackIndex);
    }

    destroy() {
        if (!this._alive) {
            this._log('⚠️ Already destroyed', 'warning');
            return;
        }

        this._log('🧹 Destroying AudioBufferManager…', 'info');

        this.cancelAllLoads();

        for (const id of this._intervals) clearInterval(id);
        this._intervals.clear();

        this.clearAllBuffers();

        // Break closure chains
        for (const key of Object.keys(this._cb)) this._cb[key] = null;

        this._alive = false;
        this._log('✅ AudioBufferManager destroyed', 'success');
    }

    // ─── Internal: loading ────────────────────────────────────────────────────

    _read(trackIndex, audioFile) {
        return new Promise((resolve, reject) => {
            const entry = { reader: new FileReader(), cancelled: false };
            this._readers.set(trackIndex, entry);

            entry.reader.onprogress = ({ lengthComputable, loaded, total }) => {
                if (entry.cancelled || !lengthComputable) return;
                this._cb.onLoadProgress?.(trackIndex, audioFile.name, loaded, total);
            };

            entry.reader.onload = ({ target }) => {
                this._cleanupReader(trackIndex);
                if (entry.cancelled || !this._alive) {
                    reject(new Error(`Load cancelled: track ${trackIndex}`));
                } else {
                    resolve(target.result);
                }
            };

            entry.reader.onerror = () => {
                this._cleanupReader(trackIndex);
                reject(new Error(`FileReader error on track ${trackIndex}`));
            };

            entry.reader.readAsArrayBuffer(audioFile);
        });
    }

    _cleanupReader(trackIndex) {
        const entry = this._readers.get(trackIndex);
        if (!entry) return;
        entry.reader.onload    = null;
        entry.reader.onerror   = null;
        entry.reader.onprogress = null;
        this._readers.delete(trackIndex);
    }

    // ─── Internal: storage ────────────────────────────────────────────────────

    _store(trackIndex, buffer, fileName) {
        if (!this._alive) throw new Error('Manager destroyed during storage');

        this._buffers.set(trackIndex, buffer);
        this._meta.set(trackIndex, {
            size:        buffer.byteLength,
            loadedAt:    Date.now(),
            lastAccessed:Date.now(),
            accessCount: 1,
            fileName,
        });

        this._stats.loaded++;
        this._stats.bytesUsed += buffer.byteLength;
        this._enforceMemoryLimits();
    }

    _touch(trackIndex) {
        const meta = this._meta.get(trackIndex);
        if (!meta) return;
        meta.lastAccessed = Date.now();
        meta.accessCount++;
    }

    // ─── Internal: eviction ───────────────────────────────────────────────────

    _enforceMemoryLimits() {
        if (this._stats.bytesUsed > this._config.maxMemory || this._buffers.size > this._config.maxTracks) {
            this._evict({ staleOnly: false });
        }
    }

    /**
     * Unified eviction pass.
     * With `staleOnly: true`  → only removes buffers idle longer than STALE_AGE_MS.
     * With `staleOnly: false` → additionally evicts LRU candidates until within limits.
     */
    _evict({ staleOnly }) {
        const protectedSet = this._protectedIndices();
        const now          = Date.now();

        // Build candidate list sorted oldest-first (cheapest to evict first)
        const candidates = [...this._meta.entries()]
            .filter(([idx]) => !protectedSet.has(idx))
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        let evicted = 0;

        for (const [idx, meta] of candidates) {
            const isStale = (now - meta.lastAccessed) > AudioBufferManager.STALE_AGE_MS;

            if (staleOnly && !isStale) continue;

            this.clearBuffer(idx);
            evicted++;

            // Stop early once we're back within limits
            if (!staleOnly &&
                this._stats.bytesUsed <= this._config.maxMemory &&
                this._buffers.size    <= this._config.maxTracks) {
                break;
            }
        }

        if (evicted) this._log(`🧹 Evicted ${evicted} buffer(s)`, 'info');
    }

    /**
     * Returns the set of track indices that must not be evicted:
     * the currently-playing track and the next N preload targets.
     */
    _protectedIndices() {
        const safe = new Set();
        safe.add(this._currentIndex);

        if (!this._isShuffled) {
            for (let i = 1; i <= this._config.preloadCount; i++) {
                safe.add(this._currentIndex + i);
            }
        }
        return safe;
    }

    /** Returns indices of upcoming tracks that are not yet cached or loading. */
    _preloadTargets(currentIndex) {
        const targets  = [];
        const maxIndex = this._playlist.length - 1;

        for (let i = 1; i <= this._config.preloadCount; i++) {
            const idx = currentIndex + i;
            if (idx > maxIndex) break;

            const track = this._playlist[idx];
            if (!track?.file) continue;
            if (this._buffers.has(idx) || this._pending.has(idx)) continue;

            targets.push(idx);
        }
        return targets;
    }

    // ─── Guard ────────────────────────────────────────────────────────────────

    _assertAlive() {
        if (!this._alive) throw new Error('AudioBufferManager has been destroyed');
    }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioBufferManager;
}

console.log('✅ AudioBufferManager v3.1 loaded');
