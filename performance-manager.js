/* ============================================
   PERFORMANCE MANAGER v2.1
   Real-time CPU/Memory monitoring & adaptive quality
   ============================================ */

class PerformanceManager {

    // Memory thresholds in MB. A music player with album art and decoded audio
    // easily sits at 200–400 MB under normal use; these are set conservatively.
    static MEM_WARNING_MB  = 350;
    static MEM_CRITICAL_MB = 600;

    // How long a cache entry must be idle before stale cleanup considers it.
    static CACHE_STALE_MS = 5 * 60_000;

    constructor(debugLog = console.log) {
        this._log = debugLog;

        this._alive = true;

        // ── Runtime state ─────────────────────────────────────────────────────
        this.state = {
            currentMode:  'full',    // 'full' | 'compact' | 'mini'
            isPlaying:    false,
            isTabVisible: !document.hidden,
            deviceTier:   'high',    // 'high' | 'medium' | 'low'
            powerMode:    'balanced',// 'performance' | 'balanced' | 'battery-saver'
        };

        // ── Metrics (updated by monitoring loops) ─────────────────────────────
        this.metrics = {
            fps:          60,
            avgFrameTime: 0,
            memoryMB:     0,
            cpuLoadPct:   0,
            droppedFrames:0,
            frameCount:   0,
        };

        // ── Quality profile (lyrics + color extraction + progress) ────────────
        // No visualizer settings — those live in the visualizer itself.
        this.quality = {
            lyrics: {
                updateIntervalMs: 500,
                animations:       true,
                glowEffect:       true,
            },
            colorExtraction: {
                sampleSize:  50,
                skipPixels:  64,
                enabled:     true,
            },
            progress: {
                updateIntervalMs: 200,
            },
        };

        // ── Connected managers (for coordinated cache cleanup) ─────────────────
        this._managers = {
            audioBuffer: null,
            lyrics:      null,
            audioPipeline: null,
            ui:          null,
        };

        // ── Resource registry for teardown ────────────────────────────────────
        this._intervals = new Set();
        this._timeouts  = new Map();   // key → timeoutId  (for named debounces)
        this._listeners = [];          // { element, event, handler }

        // Single rAF ID for the FPS loop (not a Set — only one loop runs at a time)
        this._fpsRafId = null;

        // Throttle timestamps
        this._lastUpdate = new Map();

        // Cache cleanup bookkeeping
        this._lastCacheCleanup = 0;

        // ── Boot ──────────────────────────────────────────────────────────────
        this._detectDeviceTier();
        this._applyDeviceTierSettings();
        this._startFPSMonitor();
        this._startMemoryMonitor();
        this._setupVisibilityTracking();
        this._setupBatteryMonitoring(); // async, safe to fire-and-forget

        this._log(`✅ PerformanceManager v2.1 (${this.state.deviceTier} tier)`, 'success');
    }

    // ─── Manager connection ───────────────────────────────────────────────────

    connectManager(name, manager) {
        if (name in this._managers) {
            this._managers[name] = manager;
        } else {
            this._log(`⚠️ PerformanceManager: unknown manager "${name}"`, 'warning');
        }
    }

    // ─── Device detection ─────────────────────────────────────────────────────

    _detectDeviceTier() {
        const cores  = navigator.hardwareConcurrency ?? 2;
        const memory = navigator.deviceMemory        ?? 4;

        let score = 0;
        score += cores  >= 8 ? 3 : cores  >= 4 ? 2 : 1;
        score += memory >= 8 ? 3 : memory >= 4 ? 2 : 1;
        // Connection type is a weak signal for audio quality — omitted.

        this.state.deviceTier = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
        this._log(`📱 Device tier: ${this.state.deviceTier} (${cores} cores, ${memory} GB RAM)`, 'info');
    }

    _applyDeviceTierSettings() {
        switch (this.state.deviceTier) {
            case 'medium':
                this.quality.colorExtraction.skipPixels = 128;
                break;
            case 'low':
                this.quality.colorExtraction.skipPixels = 256;
                this.quality.colorExtraction.enabled    = false;
                this.quality.lyrics.animations          = false;
                this.quality.lyrics.glowEffect          = false;
                break;
        }
    }

    // ─── FPS monitoring ───────────────────────────────────────────────────────

    _startFPSMonitor() {
        let lastTime       = performance.now();
        let lastReportTime = lastTime;
        let frames         = 0;

        const tick = (now) => {
            if (!this._alive) {
                this._fpsRafId = null;
                return;
            }

            frames++;
            const delta = now - lastTime;
            this.metrics.avgFrameTime = this.metrics.avgFrameTime * 0.9 + delta * 0.1;
            this.metrics.cpuLoadPct   = Math.round(Math.min(100, (this.metrics.avgFrameTime / 16.67) * 100));
            lastTime = now;

            // Report once per second
            const elapsed = now - lastReportTime;
            if (elapsed >= 1000) {
                const fps = Math.round(frames * 1000 / elapsed);
                this.metrics.fps        = fps;
                this.metrics.frameCount += frames;

                const expected = Math.round(elapsed / 16.67);
                this.metrics.droppedFrames += Math.max(0, expected - frames);

                frames         = 0;
                lastReportTime = now;

                // Degrade quality on sustained poor FPS
                if (fps < 25 && this.state.isPlaying) {
                    this._log(`⚠️ Low FPS (${fps}) — reducing quality`, 'warning');
                    this._degradeQuality('fps');
                }
            }

            // Single ID, no Set needed
            this._fpsRafId = requestAnimationFrame(tick);
        };

        this._fpsRafId = requestAnimationFrame(tick);
    }

    _stopFPSMonitor() {
        if (this._fpsRafId !== null) {
            cancelAnimationFrame(this._fpsRafId);
            this._fpsRafId = null;
        }
    }

    // ─── Memory monitoring ────────────────────────────────────────────────────

    _startMemoryMonitor() {
        if (!performance.memory) return;

        const id = setInterval(() => {
            if (!this._alive) return;

            const usedMB = Math.round(performance.memory.usedJSHeapSize / 1_048_576);
            this.metrics.memoryMB = usedMB;

            if (usedMB > PerformanceManager.MEM_CRITICAL_MB) {
                this._log(`🚨 Critical memory (${usedMB} MB) — emergency cleanup`, 'error');
                this._emergencyCleanup();
            } else if (usedMB > PerformanceManager.MEM_WARNING_MB) {
                this._log(`⚠️ High memory (${usedMB} MB) — cache cleanup`, 'warning');
                this._cleanCaches({ force: true });
                this._degradeQuality('memory');
            }
        }, 10_000); // every 10 s — memory doesn't change fast enough to check more often

        this._intervals.add(id);
    }

    // ─── Visibility tracking ──────────────────────────────────────────────────

    _setupVisibilityTracking() {
        const handler = () => {
            this.state.isTabVisible = !document.hidden;
            this._updateQualityForContext();
            this._log(`👁️ Tab ${document.hidden ? 'hidden' : 'visible'}`, 'info');
        };

        document.addEventListener('visibilitychange', handler);
        this._listeners.push({ element: document, event: 'visibilitychange', handler });
    }

    // ─── Battery monitoring ───────────────────────────────────────────────────

    async _setupBatteryMonitoring() {
        if (!('getBattery' in navigator)) return;
        try {
            const battery = await navigator.getBattery();

            const update = () => {
                if (battery.charging)       this.state.powerMode = 'performance';
                else if (battery.level < 0.2) {
                    this.state.powerMode = 'battery-saver';
                    this._log('🔋 Low battery — battery-saver mode', 'warning');
                } else                      this.state.powerMode = 'balanced';
                this._updateQualityForContext();
            };

            battery.addEventListener('chargingchange', update);
            battery.addEventListener('levelchange',    update);

            // Battery events can't be cleaned up the normal way (no removeEventListener
            // support in all browsers), but the battery object is GC'd with the page.
            // We still track them for completeness.
            this._listeners.push(
                { element: battery, event: 'chargingchange', handler: update },
                { element: battery, event: 'levelchange',    handler: update },
            );

            update();
        } catch {
            // Battery API unavailable — silently continue
        }
    }

    // ─── Quality adaptation ───────────────────────────────────────────────────

    /**
     * Re-evaluate quality settings whenever context changes
     * (tab visibility, view mode, power mode).
     */
    _updateQualityForContext() {
        const { isTabVisible, currentMode, powerMode } = this.state;

        if (!isTabVisible || powerMode === 'battery-saver') {
            // Background or low-power: slow everything down
            this.quality.lyrics.updateIntervalMs   = 2000;
            this.quality.progress.updateIntervalMs = 1000;
            this.quality.lyrics.animations         = false;
        } else if (currentMode === 'mini' || currentMode === 'compact') {
            this.quality.lyrics.updateIntervalMs   = 1000;
            this.quality.progress.updateIntervalMs = 500;
        } else {
            // Full mode, visible, not battery-saving
            this.quality.lyrics.updateIntervalMs   = 500;
            this.quality.progress.updateIntervalMs = 200;
            if (this.state.deviceTier !== 'low') {
                this.quality.lyrics.animations = true;
            }
        }
    }

    _degradeQuality(reason) {
        if (reason === 'memory') {
            this.quality.colorExtraction.skipPixels = Math.min(
                512, this.quality.colorExtraction.skipPixels * 2
            );
        }
        this._log(`📉 Quality reduced (${reason})`, 'warning');
    }

    // ─── Cache cleanup ────────────────────────────────────────────────────────

    /**
     * Routine cache trim. Skips if called again within 5 minutes,
     * unless `force: true` is passed (e.g. from the memory monitor).
     */
    _cleanCaches({ force = false } = {}) {
        const now = Date.now();
        if (!force && now - this._lastCacheCleanup < PerformanceManager.CACHE_STALE_MS) return;
        this._lastCacheCleanup = now;

        let cleaned = 0;

        // Color cache — keep the 50 most-recently inserted entries
        if (window.colorCache?.size > 100) {
            const excess = window.colorCache.size - 50;
            [...window.colorCache.keys()].slice(0, excess)
                .forEach(k => window.colorCache.delete(k));
            cleaned += excess;
        }

        // Analysis cache — keep up to 100 entries
        const analysisCache = window.analyzer?.analysisCache;
        if (analysisCache?.size > 200) {
            const excess = analysisCache.size - 100;
            [...analysisCache.keys()].slice(0, excess)
                .forEach(k => analysisCache.delete(k));
            cleaned += excess;
        }

        if (cleaned) this._log(`🧹 Cache trimmed: ${cleaned} entries removed`, 'info');
    }

    _emergencyCleanup() {
        window.colorCache?.clear();
        window.analyzer?.analysisCache?.clear();

        if (this._managers.audioBuffer) {
            // Keep only the current track — evict everything else
            this._managers.audioBuffer.clearAllBuffers();
        }

        // Disable expensive quality features until pressure eases
        this.quality.colorExtraction.enabled = false;
        this.quality.lyrics.animations       = false;
        this.quality.lyrics.glowEffect       = false;

        if (window.gc) window.gc(); // Chrome DevTools only

        this._log('🚨 Emergency cleanup complete', 'warning');
    }

    // ─── Public state setters ─────────────────────────────────────────────────

    setMode(mode) {
        this.state.currentMode = mode;
        this._updateQualityForContext();
        this._log(`🖥️ View mode → ${mode}`, 'info');
    }

    setPlayState(playing) {
        this.state.isPlaying = playing;
        if (!playing && !this.state.isTabVisible) this._cleanCaches();
    }

    // ─── Throttling ───────────────────────────────────────────────────────────

    /**
     * Returns true if enough time has passed since the last call for `key`.
     * Callers use this to gate expensive work in tight loops.
     */
    shouldUpdate(key) {
        const now = performance.now();
        const last = this._lastUpdate.get(key) ?? 0;

        const interval = key === 'lyrics'   ? this.quality.lyrics.updateIntervalMs
                       : key === 'progress' ? this.quality.progress.updateIntervalMs
                       : 100;

        if (now - last >= interval) {
            this._lastUpdate.set(key, now);
            return true;
        }
        return false;
    }

    /**
     * Named debounce. Replaces any pending call with the same key.
     */
    debounce(key, fn, delayMs = 300) {
        if (this._timeouts.has(key)) {
            clearTimeout(this._timeouts.get(key));
        }
        const id = setTimeout(() => {
            if (!this._alive) return;
            this._timeouts.delete(key);
            fn();
        }, delayMs);
        this._timeouts.set(key, id);
    }

    // ─── Stats / debug ────────────────────────────────────────────────────────

    getStatsDisplay() {
        const { fps, memoryMB, cpuLoadPct, droppedFrames } = this.metrics;
        return {
            fps:       `${fps} FPS`,
            memory:    `${memoryMB} MB`,
            cpuLoad:   `${cpuLoadPct}%`,
            droppedFrames,
            health:    this._healthStatus(),
            deviceTier:this.state.deviceTier,
            powerMode: this.state.powerMode,
            activeResources: {
                intervals:  this._intervals.size,
                animations: this._fpsRafId !== null ? 1 : 0,
                timeouts:   this._timeouts.size,
                listeners:  this._listeners.length,
            },
        };
    }

    _healthStatus() {
        const { fps, memoryMB, avgFrameTime } = this.metrics;
        if (memoryMB > PerformanceManager.MEM_CRITICAL_MB || fps < 25) return 'poor';
        if (memoryMB > PerformanceManager.MEM_WARNING_MB  || fps < 40) return 'fair';
        if (avgFrameTime > 33) return 'fair';
        return 'good';
    }

    // ─── Partial cleanup (track changes) ─────────────────────────────────────

    cleanupForTrackChange() {
        this._cleanCaches({ force: true });
        // Clear all pending debounces so stale callbacks don't fire after track swap
        this._timeouts.forEach(id => clearTimeout(id));
        this._timeouts.clear();
    }

    // ─── Full teardown ────────────────────────────────────────────────────────

    destroy() {
        if (!this._alive) {
            this._log('⚠️ PerformanceManager already destroyed', 'warning');
            return;
        }

        this._log('🧹 Destroying PerformanceManager…', 'info');

        this._alive = false;

        this._stopFPSMonitor();

        this._intervals.forEach(id => clearInterval(id));
        this._intervals.clear();

        this._timeouts.forEach(id => clearTimeout(id));
        this._timeouts.clear();

        this._listeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this._listeners = [];

        for (const key of Object.keys(this._managers)) this._managers[key] = null;

        this._log('✅ PerformanceManager destroyed', 'success');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceManager;
}

console.log('✅ PerformanceManager v2.1 loaded');
