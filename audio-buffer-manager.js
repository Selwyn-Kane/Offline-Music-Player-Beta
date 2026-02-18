/* ============================================
   AUDIO BUFFER MANAGER v3.2
   Clean, memory-safe audio buffering system
   ============================================ */

class AudioBufferManager {

    // ─── Tier config ──────────────────────────────────────────────────────────
    // A typical 4-minute MP3 @ 320 kbps ≈ 9–10 MB as an ArrayBuffer.
    // 25 MB comfortably covers the current track + one preload, with headroom
    // during the brief overlap while a new track is loading.
    static TIER_CONFIGS = {
        high:   { maxMemoryMB: 25, maxTracks: 2, preloadCount: 1 },
        medium: { maxMemoryMB: 25, maxTracks: 2, preloadCount: 1 },
        low:    { maxMemoryMB: 25, maxTracks: 2, preloadCount: 1 },
    };

    // Interval for the background memory pressure check (ms).
    static MEMORY_CHECK_INTERVAL_MS = 30_000;

    // Buffers not accessed within this window are eligible for stale eviction.
    static STALE_AGE_MS = 5 * 60_000; // 5 minutes

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(debugLog = console.log) {
        this._log = debugLog;

        this._alive  = true;
        this._config = this._buildConfig();

        // Core storage
        this._buffers = new Map(); // trackIndex → ArrayBuffer
        this._meta    = new Map(); // trackIndex → { size, loadedAt, lastAccessed, accessCount, fileName }
        this._pending = new Map(); // trackIndex → Promise<ArrayBuffer>  (in-flight dedup)

        // Active FileReader handles — lets us abort and detect stale completions.
        // Each entry: { reader: FileReader, generation: number }
        this._readers = new Map();

        // Monotonically-incrementing counter. Bumped by clearAllBuffers() so that
        // any FileReader that completes after a clear knows its result is stale.
        this._generation = 0;

        this._intervals = new Set();

        this._stats = { loaded: 0, evicted: 0, hits: 0, misses: 0, bytesUsed: 0 };

        this._playlist     = [];
        this._currentIndex = -1; // -1 = no track loaded yet
        this._isShuffled   = false;

        this._cb = {
            onLoadStart:       null,
            onLoadProgress:    null,
            onLoadComplete:    null,
            onLoadError:       null,
            onMemoryWarning:   null,
            onPreloadComplete: null,
        };

        this._startMemoryMonitor();
        this._log(`✅ AudioBufferManager v3.2 — 2-track buffer (${this._config.maxMemoryMB} MB limit)`, 'success');
    }

    // ─── Configuration ────────────────────────────────────────────────────────

    _buildConfig() {
        const memory = navigator.deviceMemory        ?? 4;
        const cores  = navigator.hardwareConcurrency ?? 2;

        let tier = 'medium';
        if (memory >= 8 && cores >= 4) tier = 'high';
        else if (memory < 4 || cores < 2) tier = 'low';

        const { maxMemoryMB, maxTracks, preloadCount } = AudioBufferManager.TIER_CONFIGS[tier];
        return {
            tier,
            maxMemory:     maxMemoryMB * 1_048_576,
            maxMemoryMB,
            maxTracks,
            preloadCount,
        };
    }

    // ─── Memory monitor ───────────────────────────────────────────────────────

    _startMemoryMonitor() {
        if (!performance?.memory) return;

        const id = setInterval(() => {
            if (!this._alive) return;
            const pct = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
            if (pct > 80) {
                this._log(`⚠️ Heap at ${pct.toFixed(1)}% — evicting stale buffers`, 'warning');
                this._cb.onMemoryWarning?.(pct);
                this._evict(true);
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
     * Load a specific File into the buffer cache.
     * If an identical load is already in-flight, the same Promise is returned (dedup).
     * Returns the ArrayBuffer on success.
     */
    async loadBuffer(trackIndex, audioFile) {
        this._assertAlive();

        // Cache hit
        if (this._buffers.has(trackIndex)) {
            this._touch(trackIndex);
            this._stats.hits++;
            return this._buffers.get(trackIndex);
        }

        // Deduplicate concurrent requests for the same track
        if (this._pending.has(trackIndex)) {
            return this._pending.get(trackIndex);
        }

        this._stats.misses++;
        this._cb.onLoadStart?.(trackIndex, audioFile.name);

        const capturedGen = this._generation;

        const promise = this._read(trackIndex, audioFile, capturedGen)
            .then(buffer => {
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
     * Get a buffer by playlist index.
     * Loads from the playlist's file reference if not already cached.
     */
    async getBuffer(trackIndex) {
        this._assertAlive();

        if (this._buffers.has(trackIndex)) {
            this._touch(trackIndex);
            this._stats.hits++;
            return this._buffers.get(trackIndex);
        }

        const track = this._playlist[trackIndex];
        if (!track?.file) throw new Error(`Track ${trackIndex} has no file reference`);

        return this.loadBuffer(trackIndex, track.file);
    }

    /**
     * Preload the next N tracks after currentIndex in the background.
     * No-op when shuffled — unpredictable order makes preloading wasteful.
     */
    async preloadUpcoming(currentIndex) {
        if (!this._alive || this._isShuffled) return;

        this._currentIndex = currentIndex;
        const targets = this._preloadTargets(currentIndex);
        if (!targets.length) return;

        this._log(`🔄 Preloading ${targets.length} track(s)`, 'info');

        const results = await Promise.allSettled(
            targets.map(idx => {
                if (!this._alive) return Promise.reject(new Error('destroyed'));
                return this.loadBuffer(idx, this._playlist[idx].file);
            })
        );

        if (!this._alive) return;

        const succeeded = targets.filter((_, i) => results[i].status === 'fulfilled');
        if (succeeded.length) this._cb.onPreloadComplete?.(succeeded);
    }

    /** Update the currently-playing index (protects it from eviction). */
    setCurrentIndex(index) {
        this._currentIndex = index;
    }

    /** Abort an in-flight load for the given track index. */
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

    /** Remove a single buffer from the cache. */
    clearBuffer(trackIndex) {
        const meta = this._meta.get(trackIndex);
        if (!meta) return;

        this._stats.bytesUsed -= meta.size;
        this._stats.evicted++;
        this._buffers.delete(trackIndex);
        this._meta.delete(trackIndex);
    }

    /**
     * Evict ALL cached buffers and abort all in-flight reads.
     * The generation counter is bumped so any reads that complete after
     * this call know their results are stale and discard them.
     */
    clearAllBuffers() {
        // Cancel reads BEFORE clearing _pending — cancelLoad() removes from _pending.
        this.cancelAllLoads();

        // Bump generation so any still-running reads (edge cases) discard their results.
        this._generation++;

        this._buffers.clear();
        this._meta.clear();
        this._pending.clear();
        this._stats.bytesUsed = 0;

        this._log('🧹 All buffers cleared', 'info');
    }

    /** Snapshot of current statistics (all numeric fields are numbers). */
    getStats() {
        const total   = this._stats.hits + this._stats.misses;
        const hitRate = total ? `${((this._stats.hits / total) * 100).toFixed(1)}%` : '0%';

        return {
            loaded:        this._stats.loaded,
            evicted:       this._stats.evicted,
            hits:          this._stats.hits,
            misses:        this._stats.misses,
            bytesUsed:     this._stats.bytesUsed,
            memoryUsedMB:  parseFloat((this._stats.bytesUsed / 1_048_576).toFixed(2)),
            memoryLimitMB: this._config.maxMemoryMB,   // was .toString() — now a number
            cachedTracks:  this._buffers.size,
            activeLoads:   this._readers.size,
            hitRate,
            deviceTier:    this._config.tier,
            isShuffled:    this._isShuffled,
            destroyed:     !this._alive,
        };
    }

    /** Detailed per-buffer info, sorted by track index. */
    getBufferInfo() {
        const now = Date.now();
        return [...this._meta.entries()]
            .map(([idx, meta]) => ({
                trackIndex:  idx,
                fileName:    meta.fileName,
                sizeMB:      parseFloat((meta.size / 1_048_576).toFixed(2)),
                ageSeconds:  Math.round((now - meta.loadedAt) / 1_000),
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

        for (const key of Object.keys(this._cb)) this._cb[key] = null;

        this._alive = false;
        this._log('✅ AudioBufferManager destroyed', 'success');
    }

    // ─── Internal: loading ────────────────────────────────────────────────────

    /**
     * Wraps FileReader in a Promise.
     * @param {number} capturedGen - the generation at call time; if _generation
     *   has advanced by the time the read completes, the result is discarded.
     */
    _read(trackIndex, audioFile, capturedGen) {
        return new Promise((resolve, reject) => {
            const entry = { reader: new FileReader(), cancelled: false };
            this._readers.set(trackIndex, entry);

            entry.reader.onprogress = ({ lengthComputable, loaded, total }) => {
                if (entry.cancelled || !lengthComputable) return;
                this._cb.onLoadProgress?.(trackIndex, audioFile.name, loaded, total);
            };

            entry.reader.onload = ({ target }) => {
                this._cleanupReader(trackIndex);

                // Stale check: were buffers cleared (or destroyed) while we were reading?
                if (entry.cancelled || !this._alive || this._generation !== capturedGen) {
                    reject(new Error(`Load discarded: track ${trackIndex} (stale or cancelled)`));
                    return;
                }

                const buffer = target.result;
                this._store(trackIndex, buffer, audioFile.name);
                resolve(buffer);
            };

            entry.reader.onerror = () => {
                this._cleanupReader(trackIndex);
                reject(new Error(`FileReader error on track ${trackIndex}: ${entry.reader.error?.message}`));
            };

            entry.reader.readAsArrayBuffer(audioFile);
        });
    }

    _cleanupReader(trackIndex) {
        const entry = this._readers.get(trackIndex);
        if (!entry) return;
        entry.reader.onload     = null;
        entry.reader.onerror    = null;
        entry.reader.onprogress = null;
        this._readers.delete(trackIndex);
    }

    // ─── Internal: storage ────────────────────────────────────────────────────

    /**
     * Store a completed buffer. Enforces memory limits AFTER insertion so the
     * incoming buffer is always protected by _currentIndex before eviction runs.
     */
    _store(trackIndex, buffer, fileName) {
        // Safety guards — _read() checks these too, but belt-and-suspenders.
        if (!this._alive) return;

        this._buffers.set(trackIndex, buffer);
        this._meta.set(trackIndex, {
            size:         buffer.byteLength,
            loadedAt:     Date.now(),
            lastAccessed: Date.now(),
            accessCount:  1,
            fileName,
        });

        this._stats.loaded++;
        this._stats.bytesUsed += buffer.byteLength;

        // Enforce limits after insertion so the new buffer's own index is visible
        // during eviction, but only preload indices (not current) are at risk.
        this._enforceMemoryLimits(trackIndex);
    }

    _touch(trackIndex) {
        const meta = this._meta.get(trackIndex);
        if (!meta) return;
        meta.lastAccessed = Date.now();
        meta.accessCount++;
    }

    // ─── Internal: eviction ───────────────────────────────────────────────────

    /**
     * Run an eviction pass if we are over the memory or track-count limits.
     * @param {number} [justStoredIndex] - if provided, this index is temporarily
     *   added to the protected set so a freshly-stored buffer is never immediately evicted.
     */
    _enforceMemoryLimits(justStoredIndex) {
        const overMemory = this._stats.bytesUsed > this._config.maxMemory;
        const overCount  = this._buffers.size    > this._config.maxTracks;

        if (overMemory || overCount) {
            this._evict(false, justStoredIndex);
        }
    }

    /**
     * Unified eviction pass.
     * @param {boolean} staleOnly - when true, only evict buffers idle > STALE_AGE_MS.
     * @param {number}  [extraProtected] - additional index to protect (e.g. just-stored preload).
     */
    _evict(staleOnly, extraProtected) {
        const protected_ = this._protectedIndices();
        if (extraProtected != null) protected_.add(extraProtected);

        const now = Date.now();

        // Build candidate list, oldest-last-accessed first
        const candidates = [...this._meta.entries()]
            .filter(([idx]) => !protected_.has(idx))
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        let evicted = 0;

        for (const [idx, meta] of candidates) {
            const isStale = (now - meta.lastAccessed) > AudioBufferManager.STALE_AGE_MS;
            if (staleOnly && !isStale) continue;

            this.clearBuffer(idx);
            evicted++;

            // Stop once back within limits (not needed for stale-only pass)
            if (!staleOnly &&
                this._stats.bytesUsed <= this._config.maxMemory &&
                this._buffers.size    <= this._config.maxTracks) {
                break;
            }
        }

        if (evicted) this._log(`🧹 Evicted ${evicted} buffer(s)`, 'info');
    }

    /**
     * The set of track indices that must never be evicted:
     * the current track + the next preloadCount targets.
     * Negative indices (e.g. _currentIndex = -1 before first load) are excluded.
     */
    _protectedIndices() {
        const safe = new Set();

        if (this._currentIndex >= 0) {
            safe.add(this._currentIndex);

            if (!this._isShuffled) {
                for (let i = 1; i <= this._config.preloadCount; i++) {
                    const idx = this._currentIndex + i;
                    if (idx < this._playlist.length) safe.add(idx);
                }
            }
        }

        return safe;
    }

    /** Indices of upcoming tracks that are not yet cached or loading. */
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioBufferManager;
}

console.log('✅ AudioBufferManager v3.2 loaded');
