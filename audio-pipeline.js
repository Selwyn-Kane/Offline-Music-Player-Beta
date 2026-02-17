/* ============================================
   AUDIO PIPELINE v1.1
   AudioContext, EQ nodes, and signal routing.
   ============================================ */

class AudioPipeline {

    // Default frequencies if APP_CONFIG is not present
    static DEFAULTS = {
        FFT_SIZE:      2048,
        BASS_FREQ_HZ:   200,
        MID_FREQ_HZ:   1000,
        TREBLE_FREQ_HZ:5000,
    };

    constructor(debugLog = console.log) {
        this._log = debugLog;

        this.audioContext  = null;
        this.audioSource   = null;
        this.analyser      = null;
        this.bassFilter    = null;
        this.midFilter     = null;
        this.trebleFilter  = null;

        // Convenience refs populated after init for visualizer consumers
        this.dataArray    = null;
        this.bufferLength = null;

        this.isInitialized = false;
        this._analyserConnected = false; // guard against disconnecting before first connect
    }

    // ─── Config helper ────────────────────────────────────────────────────────

    /** Read from APP_CONFIG if available, fall back to class defaults. */
    _cfg(key) {
        return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG[key] != null)
            ? APP_CONFIG[key]
            : AudioPipeline.DEFAULTS[key];
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    init(player) {
        if (this.isInitialized) return;

        try {
            // 1. AudioContext
            this.audioContext = window.sharedAudioContext
                ?? new (window.AudioContext ?? window.webkitAudioContext)();
            window.sharedAudioContext = this.audioContext;

            // 2. Analyser (used by visualizer modules via window.sharedAnalyser)
            this.analyser          = this.audioContext.createAnalyser();
            this.analyser.fftSize  = this._cfg('FFT_SIZE');
            this.bufferLength      = this.analyser.frequencyBinCount;
            this.dataArray         = new Uint8Array(this.bufferLength);
            window.sharedAnalyser      = this.analyser;
            window.sharedDataArray     = this.dataArray;
            window.sharedBufferLength  = this.bufferLength;

            // 3. EQ filters
            this.bassFilter                   = this.audioContext.createBiquadFilter();
            this.bassFilter.type              = 'lowshelf';
            this.bassFilter.frequency.value   = this._cfg('BASS_FREQ_HZ');
            this.bassFilter.gain.value        = 0;
            window.sharedBassFilter           = this.bassFilter;

            this.midFilter                    = this.audioContext.createBiquadFilter();
            this.midFilter.type               = 'peaking';
            this.midFilter.frequency.value    = this._cfg('MID_FREQ_HZ');
            this.midFilter.Q.value            = 1;
            this.midFilter.gain.value         = 0;
            window.sharedMidFilter            = this.midFilter;

            this.trebleFilter                 = this.audioContext.createBiquadFilter();
            this.trebleFilter.type            = 'highshelf';
            this.trebleFilter.frequency.value = this._cfg('TREBLE_FREQ_HZ');
            this.trebleFilter.gain.value      = 0;
            window.sharedTrebleFilter         = this.trebleFilter;

            // 4. Source node (one per HTMLMediaElement — never create a second)
            this.audioSource        = this.audioContext.createMediaElementSource(player);
            window.sharedAudioSource = this.audioSource;

            // 5. Wire everything up
            this._connectNodes();

            this.isInitialized = true;
            this._log('✅ AudioPipeline initialized', 'success');

            // NOTE: script.js dispatches 'audioContextReady' after calling init(),
            // so we don't dispatch it here to avoid a double-fire.

        } catch (err) {
            this._log(`❌ AudioPipeline init failed: ${err.message}`, 'error');
        }
    }

    // ─── Signal chain ─────────────────────────────────────────────────────────

    /**
     * Build (or rebuild) the node chain:
     *   source → bass → mid → treble → [volumeGain → compressor → makeupGain] → analyser → destination
     *
     * Safe to call at any time after init() — all nodes are disconnected first.
     * Exposed publicly as `reconnect()` for callers that need to re-wire after
     * volume-control nodes are created post-init.
     */
    _connectNodes() {
        if (!this.audioSource) return;

        try {
            // Disconnect all nodes (order doesn't matter for disconnect)
            const nodesToReset = [
                this.audioSource,
                this.bassFilter,
                this.midFilter,
                this.trebleFilter,
                window.volumeGainNode,
                window.volumeCompressor,
                window.volumeMakeupGain,
            ];
            nodesToReset.forEach(n => { if (n) try { n.disconnect(); } catch (_) {} });

            // Analyser may not have been connected yet on the very first call
            if (this._analyserConnected) {
                try { this.analyser.disconnect(); } catch (_) {}
            }

            // Build EQ chain
            this.audioSource.connect(this.bassFilter);
            this.bassFilter.connect(this.midFilter);
            this.midFilter.connect(this.trebleFilter);

            let tail = this.trebleFilter;

            // Insert volume-control nodes if they exist
            if (window.volumeGainNode && window.volumeCompressor && window.volumeMakeupGain) {
                tail.connect(window.volumeGainNode);
                window.volumeGainNode.connect(window.volumeCompressor);
                window.volumeCompressor.connect(window.volumeMakeupGain);
                tail = window.volumeMakeupGain;
            }

            // Analyser → destination
            tail.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            this._analyserConnected = true;

            this._log('🔗 Audio chain connected', 'success');
        } catch (err) {
            this._log(`❌ Audio chain connection failed: ${err.message}`, 'error');
        }
    }

    /** Public alias — called by script.js's reconnectAudioChainWithVolumeControl. */
    reconnect() {
        this._connectNodes();
    }

    // ─── EQ helpers ───────────────────────────────────────────────────────────

    /**
     * Smoothly ramp a filter's gain to `value` dB.
     * Uses setTargetAtTime (time-constant 20 ms) for click-free transitions.
     */
    setGain(filter, value) {
        if (!filter || !this.audioContext) return;
        filter.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.02);
    }

    setBass(value)   { this.setGain(this.bassFilter,   value); }
    setMid(value)    { this.setGain(this.midFilter,    value); }
    setTreble(value) { this.setGain(this.trebleFilter, value); }

    // ─── Context lifecycle ────────────────────────────────────────────────────

    async resume() {
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
            this._log('🔊 AudioContext resumed', 'success');
        }
    }

    async suspend() {
        if (this.audioContext?.state === 'running') {
            await this.audioContext.suspend();
            this._log('🔇 AudioContext suspended', 'info');
        }
    }

    // ─── Visualizer data ──────────────────────────────────────────────────────

    /** Returns the frequency byte array, refreshed in-place. Null if not ready. */
    getFrequencyData() {
        if (!this.analyser || !this.dataArray) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        if (!this.isInitialized) return;

        try {
            // Disconnect all nodes before closing the context
            [
                this.audioSource,
                this.bassFilter,
                this.midFilter,
                this.trebleFilter,
                this.analyser,
            ].forEach(n => { if (n) try { n.disconnect(); } catch (_) {} });

            this.audioContext?.close();
        } catch (err) {
            this._log(`⚠️ AudioPipeline destroy error: ${err.message}`, 'warning');
        }

        // Clear shared globals so other modules don't hold stale references
        window.sharedAudioContext  = null;
        window.sharedAudioSource   = null;
        window.sharedAnalyser      = null;
        window.sharedDataArray     = null;
        window.sharedBufferLength  = null;
        window.sharedBassFilter    = null;
        window.sharedMidFilter     = null;
        window.sharedTrebleFilter  = null;

        this.isInitialized      = false;
        this._analyserConnected = false;

        this._log('✅ AudioPipeline destroyed', 'success');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioPipeline;
}
