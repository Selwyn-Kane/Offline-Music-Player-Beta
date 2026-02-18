/* ============================================
   CROSSFADE MANAGER v3.1
   Smart transitions and gapless playback.

   NOTE: startMonitoring() must be wired into the playback flow by the caller
   (e.g. script.js) to activate crossfading. Currently the manager is only
   toggled on/off via setEnabled(); the actual fade monitoring is not triggered
   from script.js's loadTrack path.
   ============================================ */

class CrossfadeManager {

    static MIN_FADE_S   = 1.5;
    static MAX_FADE_S   = 8.0;
    static FADE_OFFSET_S = 5;   // seconds before track end to start fading

    constructor(player, debugLog = console.log) {
        this._player = player;
        this._log    = debugLog;

        // Settings (persisted)
        this.enabled        = false;
        this.gaplessEnabled = true;
        this.baseDuration   = 4;        // seconds
        this.fadeStartOffset= CrossfadeManager.FADE_OFFSET_S;

        // Runtime state
        this._isFading       = false;
        this._fadeGainNode   = null;
        this._nodesReady     = false;

        // Pending transition
        this._nextTrack      = null;
        this._preloadedURL   = null;    // blob URL for next track
        this._onFadeStart    = null;    // callback supplied by caller
        this._fadeDuration   = null;
        this._fadeAt         = null;    // absolute player time to start fading

        // Tracked async handles — all cancelled in destroy()
        this._monitorTimeout  = null;
        this._switchTimeout   = null;
        this._completeTimeout = null;

        // Reschedule monitoring if the user seeks
        this._seekHandler = () => this._rescheduleMonitor();

        this._loadSettings();
        this._log('✅ CrossfadeManager v3.1 initialized', 'success');
    }

    // ─── AudioContext (lazy) ──────────────────────────────────────────────────
    // Read from window.audioContext rather than capturing at construction time,
    // because AudioPipeline sets it after CrossfadeManager is created.

    get _ctx() {
        return window.audioContext ?? null;
    }

    // ─── Node initialisation ──────────────────────────────────────────────────

    /**
     * Public entry point: create the fade GainNode and expose it on window so
     * reconnectAudioChainWithVolumeControl() can splice it into the chain.
     * Safe to call multiple times (no-op after first success).
     */
    initNodes() {
        return this._initNodes();
    }

    _initNodes() {
        if (this._nodesReady || !this._ctx) return false;
        try {
            this._fadeGainNode = this._ctx.createGain();
            this._fadeGainNode.gain.value = 1.0;
            window.crossfadeFadeGain = this._fadeGainNode;
            this._nodesReady = true;
            this._log('🎚️ Crossfade gain node created', 'success');
            return true;
        } catch (err) {
            this._log(`❌ Crossfade node init failed: ${err.message}`, 'error');
            return false;
        }
    }

    connectToAudioChain(inputNode, outputNode) {
        if (!this._nodesReady) this._initNodes();
        if (!this._fadeGainNode) return false;
        try {
            inputNode.disconnect();
            inputNode.connect(this._fadeGainNode);
            this._fadeGainNode.connect(outputNode);
            this._log('✅ Crossfade inserted into audio chain', 'success');
            return true;
        } catch (err) {
            this._log(`❌ Crossfade chain connection failed: ${err.message}`, 'error');
            return false;
        }
    }

    // ─── Settings ─────────────────────────────────────────────────────────────

    _loadSettings() {
        try {
            const b = (key, def) => { const v = localStorage.getItem(key); return v !== null ? v === 'true' : def; };
            const n = (key, def) => { const v = localStorage.getItem(key); return v !== null ? parseFloat(v) : def; };
            this.enabled         = b('crossfadeEnabled',     false);
            this.gaplessEnabled  = b('gaplessEnabled',       true);
            this.baseDuration    = n('crossfadeDuration',    4);
            this.fadeStartOffset = n('crossfadeStartOffset', CrossfadeManager.FADE_OFFSET_S);
        } catch {
            // Non-fatal — defaults stay in place
        }
    }

    _saveSettings() {
        try {
            localStorage.setItem('crossfadeEnabled',     this.enabled.toString());
            localStorage.setItem('gaplessEnabled',       this.gaplessEnabled.toString());
            localStorage.setItem('crossfadeDuration',    this.baseDuration.toString());
            localStorage.setItem('crossfadeStartOffset', this.fadeStartOffset.toString());
        } catch {
            this._log('⚠️ Could not save crossfade settings', 'warning');
        }
    }

    // ─── Fade parameter calculation ───────────────────────────────────────────

    _calcFadeDuration(currentTrack, nextTrack) {
        // Gapless: same album → near-silent transition
        if (this.gaplessEnabled &&
            currentTrack?.metadata?.album &&
            currentTrack.metadata.album === nextTrack?.metadata?.album) {
            return 0.1;
        }

        let dur = this.baseDuration;
        const currBPM    = currentTrack?.analysis?.bpm    ?? 120;
        const nextBPM    = nextTrack?.analysis?.bpm       ?? 120;
        const currEnergy = currentTrack?.analysis?.energy ?? 0.5;
        const nextEnergy = nextTrack?.analysis?.energy    ?? 0.5;

        const bpmDiff    = Math.abs(currBPM - nextBPM);
        const energyDiff = Math.abs(currEnergy - nextEnergy);

        if (bpmDiff < 8 && energyDiff < 0.15) {
            dur = Math.min(CrossfadeManager.MAX_FADE_S, dur + 2);
        } else if (bpmDiff > 30 || energyDiff > 0.5) {
            dur = Math.max(CrossfadeManager.MIN_FADE_S, dur - 1.5);
        }

        return dur;
    }

    _calcFadeAt(track, trackDuration) {
        const analysis = track?.analysis;
        const base     = trackDuration - this.fadeStartOffset;

        if (analysis?.outro?.start) {
            return Math.max(base - 3, analysis.outro.start - this.baseDuration / 2);
        }
        if (analysis?.energy > 0.7) return base - 1.5;
        if (analysis?.energy < 0.3) return base - 4.5;
        return base - 3;
    }

    // ─── Monitoring (setTimeout-based, not setInterval) ───────────────────────

    /**
     * Begin watching for the fade point. Replaces the 200 ms polling loop with
     * a single setTimeout calculated from the current playback position.
     * Automatically reschedules if the user seeks.
     */
    startMonitoring(player, currentTrack, nextTrack, onFadeCallback) {
        if (!this.enabled && !this.gaplessEnabled) return;
        if (!nextTrack) return;

        this._onFadeStart = onFadeCallback;
        this._nextTrack   = nextTrack;
        this._fadeDuration = this._calcFadeDuration(currentTrack, nextTrack);

        this._preloadNextTrack(nextTrack);

        // Register seek listener so we reschedule after a user seek
        this._player.removeEventListener('seeked', this._seekHandler);
        this._player.addEventListener('seeked', this._seekHandler);

        this._scheduleMonitor(currentTrack);

        this._log(`👁️ Crossfade monitoring started (${this._fadeDuration.toFixed(1)} s fade)`, 'info');
    }

    _scheduleMonitor(currentTrack) {
        clearTimeout(this._monitorTimeout);
        this._monitorTimeout = null;

        const duration = this._player.duration;
        if (!duration || !isFinite(duration)) return;

        this._fadeAt = this._calcFadeAt(currentTrack ?? null, duration);

        const delayMs = Math.max(0, (this._fadeAt - this._player.currentTime) * 1000);
        this._monitorTimeout = setTimeout(() => this._onFadePoint(), delayMs);
    }

    _rescheduleMonitor() {
        if (!this._nextTrack || this._isFading) return;
        const duration = this._player.duration;
        if (!duration || !isFinite(duration)) return;
        const delayMs = Math.max(0, (this._fadeAt - this._player.currentTime) * 1000);
        clearTimeout(this._monitorTimeout);
        this._monitorTimeout = setTimeout(() => this._onFadePoint(), delayMs);
    }

    _onFadePoint() {
        this._monitorTimeout = null;
        if (this._isFading || !this._nextTrack) return;

        const ct  = this._player.currentTime;
        const dur = this._player.duration;

        // Safety guard: don't fire too close to the very end
        if (!dur || !isFinite(dur) || ct >= dur - 0.2) return;

        this._executeFade();
    }

    stopMonitoring() {
        clearTimeout(this._monitorTimeout);
        this._monitorTimeout = null;
        this._player.removeEventListener('seeked', this._seekHandler);
    }

    // ─── Fade execution ───────────────────────────────────────────────────────

    async _executeFade() {
        if (this._isFading) return;
        this._isFading = true;
        this.stopMonitoring();

        try {
            const ctx = this._ctx;
            if (ctx?.state === 'suspended') await ctx.resume();

            const fadeDuration  = this._fadeDuration ?? this.baseDuration;
            const timeRemaining = (this._player.duration ?? 0) - this._player.currentTime;

            // Fade out gain
            if (this._fadeGainNode && this.enabled && ctx) {
                const now = ctx.currentTime;
                this._fadeGainNode.gain.cancelScheduledValues(now);
                this._fadeGainNode.gain.setValueAtTime(this._fadeGainNode.gain.value, now);
                this._fadeGainNode.gain.exponentialRampToValueAtTime(0.001, now + fadeDuration);
                this._log(`📉 Fading out over ${fadeDuration.toFixed(1)} s`, 'info');
            }

            // Switch track just before playback reaches the end
            const switchDelayMs   = Math.max(0, (timeRemaining - (this.enabled ? 0.3 : 0.05)) * 1000);
            const completeDelayMs = (this.enabled ? fadeDuration : 0.5) * 1000 + 500;

            this._switchTimeout = setTimeout(() => {
                this._switchTimeout = null;
                this._doSwitch();
            }, switchDelayMs);

            this._completeTimeout = setTimeout(() => {
                this._completeTimeout = null;
                this._completeFade();
            }, completeDelayMs);

        } catch (err) {
            this._log(`❌ Fade execution failed: ${err.message}`, 'error');
            this._isFading = false;
        }
    }

    _doSwitch() {
        if (!this._onFadeStart || !this._nextTrack) return;

        let startTime = 0;
        if (this.enabled && this._nextTrack.analysis?.intro?.end > 2) {
            startTime = Math.min(8, this._nextTrack.analysis.intro.end);
        }

        this._log('🔄 Switching to next track', 'info');
        this._onFadeStart({
            track:        this._nextTrack,
            startTime,
            preloadedURL: this._preloadedURL,
        });
    }

    _completeFade() {
        if (!this._isFading) return;
        this._isFading = false;

        if (this._fadeGainNode && this._ctx) {
            const now = this._ctx.currentTime;
            this._fadeGainNode.gain.cancelScheduledValues(now);
            this._fadeGainNode.gain.setValueAtTime(1.0, now);
        }

        this._clearPreload();
        this._nextTrack    = null;
        this._fadeDuration = null;
        this._fadeAt       = null;

        this._log('✅ Crossfade complete', 'success');
    }

    // ─── Preloading ───────────────────────────────────────────────────────────

    _preloadNextTrack(track) {
        this._clearPreload();

        // If the File object is available, create a fresh blob URL directly.
        // If only an audioURL exists (already a blob), reuse it as-is.
        if (track.file) {
            this._preloadedURL = URL.createObjectURL(track.file);
        } else if (track.audioURL) {
            this._preloadedURL = track.audioURL;  // reuse — don't double-wrap
        }

        if (this._preloadedURL) {
            this._log(`📥 Preloaded: ${track.metadata?.title ?? track.fileName}`, 'success');
        }
    }

    _clearPreload() {
        // Only revoke URLs we created ourselves (from track.file)
        if (this._preloadedURL && this._nextTrack?.file) {
            try { URL.revokeObjectURL(this._preloadedURL); } catch (_) {}
        }
        this._preloadedURL = null;
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    cancelFade() {
        this.stopMonitoring();

        clearTimeout(this._switchTimeout);
        clearTimeout(this._completeTimeout);
        this._switchTimeout   = null;
        this._completeTimeout = null;

        if (this._isFading && this._fadeGainNode && this._ctx) {
            const now = this._ctx.currentTime;
            this._fadeGainNode.gain.cancelScheduledValues(now);
            this._fadeGainNode.gain.setValueAtTime(1.0, now);
        }

        this._isFading     = false;
        this._nextTrack    = null;
        this._fadeDuration = null;
        this._fadeAt       = null;

        this._clearPreload();
    }

    // ─── Public setters ───────────────────────────────────────────────────────

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) this.cancelFade();
        this._saveSettings();
    }

    setGaplessEnabled(enabled) {
        this.gaplessEnabled = enabled;
        this._saveSettings();
    }

    setDuration(seconds) {
        this.baseDuration = Math.max(CrossfadeManager.MIN_FADE_S,
                            Math.min(CrossfadeManager.MAX_FADE_S, seconds));
        this._saveSettings();
    }

    setStartOffset(seconds) {
        this.fadeStartOffset = Math.max(3, Math.min(10, seconds));
        this._saveSettings();
    }

    getSettings() {
        return {
            enabled:         this.enabled,
            gaplessEnabled:  this.gaplessEnabled,
            baseDuration:    this.baseDuration,
            fadeStartOffset: this.fadeStartOffset,
            isFading:        this._isFading,
            nodesReady:      this._nodesReady,
        };
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        this.cancelFade();
        if (this._fadeGainNode) {
            try { this._fadeGainNode.disconnect(); } catch (_) {}
            this._fadeGainNode = null;
        }
        this._nodesReady = false;
        this._log('✅ CrossfadeManager destroyed', 'success');
    }

    /** Alias for callers using the old name. */
    dispose() { this.destroy(); }
}

window.CrossfadeManager = CrossfadeManager;