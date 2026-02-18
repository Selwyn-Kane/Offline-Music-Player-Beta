/* ============================================
   AUDIO PIPELINE v1.2
   AudioContext, EQ nodes, and signal routing.

   Ownership of shared globals:
     This module OWNS and is the SOLE writer of:
       window.sharedAudioContext, sharedAudioSource,
       sharedAnalyser, sharedDataArray, sharedBufferLength,
       sharedBassFilter, sharedMidFilter, sharedTrebleFilter

     script.js mirrors these via _setWindowRef() for its own
     cleanup tracking — that's intentional — but must never
     write them independently.

   The 'audioContextReady' CustomEvent is dispatched by THIS
   module at the end of init(). script.js must NOT re-dispatch it.
   ============================================ */

class AudioPipeline {

    // Default frequencies / sizes used when APP_CONFIG is absent
    static DEFAULTS = {
        FFT_SIZE:      2048,
        BASS_FREQ_HZ:   200,
        MID_FREQ_HZ:   1000,
        TREBLE_FREQ_HZ:5000,
    };

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(debugLog = console.log) {
        this._log = debugLog;

        // AudioContext and nodes — null until init() succeeds
        this.audioContext  = null;
        this.audioSource   = null;
        this.analyser      = null;
        this.bassFilter    = null;
        this.midFilter     = null;
        this.trebleFilter  = null;

        // Convenience properties for visualizer consumers
        this.dataArray    = null;
        this.bufferLength = null;

        this.isInitialized     = false;
        this._analyserConnected = false;
    }

    // ─── Config helper ────────────────────────────────────────────────────────

    _cfg(key) {
        return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG[key] != null)
            ? APP_CONFIG[key]
            : AudioPipeline.DEFAULTS[key];
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    /**
     * Set up the full Web Audio pipeline for the given HTMLMediaElement.
     * Safe to call only once per instance — subsequent calls are no-ops.
     */
    init(player) {
        if (this.isInitialized) {
            this._log('⚠️ AudioPipeline already initialized', 'warning');
            return;
        }

        if (!player) {
            this._log('❌ AudioPipeline.init(): player element is required', 'error');
            return;
        }

        try {
            // 1. AudioContext — reuse an existing shared context if one was created
            //    by another module first; otherwise create a new one.
            this.audioContext = window.sharedAudioContext
                ?? new (window.AudioContext ?? window.webkitAudioContext)();
            window.sharedAudioContext = this.audioContext;

            // 2. Analyser (exposed for visualizer modules)
            this.analyser         = this.audioContext.createAnalyser();
            this.analyser.fftSize = this._cfg('FFT_SIZE');
            this.bufferLength     = this.analyser.frequencyBinCount;
            this.dataArray        = new Uint8Array(this.bufferLength);

            window.sharedAnalyser     = this.analyser;
            window.sharedDataArray    = this.dataArray;
            window.sharedBufferLength = this.bufferLength;

            // 3. EQ filters
            this.bassFilter = this._makeBiquad('lowshelf',  this._cfg('BASS_FREQ_HZ'));
            this.midFilter  = this._makeBiquad('peaking',   this._cfg('MID_FREQ_HZ'),  { Q: 1 });
            this.trebleFilter = this._makeBiquad('highshelf', this._cfg('TREBLE_FREQ_HZ'));

            window.sharedBassFilter   = this.bassFilter;
            window.sharedMidFilter    = this.midFilter;
            window.sharedTrebleFilter = this.trebleFilter;

            // 4. Source node — one per HTMLMediaElement. Creating a second one for
            //    the same element throws, so this must only ever be called once.
            this.audioSource        = this.audioContext.createMediaElementSource(player);
            window.sharedAudioSource = this.audioSource;

            // 5. Wire the chain
            this._connectNodes();

            this.isInitialized = true;
            this._log('✅ AudioPipeline initialized', 'success');

            // Notify other modules that the AudioContext is ready.
            // Script.js must NOT re-dispatch this event after calling init().
            document.dispatchEvent(new CustomEvent('audioContextReady'));

        } catch (err) {
            this._log(`❌ AudioPipeline init failed: ${err.message}`, 'error');
            // Partial cleanup so the instance is not left in a broken half-init state
            this._nullifyNodes();
        }
    }

    // ─── Node factory ─────────────────────────────────────────────────────────

    _makeBiquad(type, frequency, extras = {}) {
        const filter           = this.audioContext.createBiquadFilter();
        filter.type            = type;
        filter.frequency.value = frequency;
        filter.gain.value      = 0;
        if (extras.Q != null) filter.Q.value = extras.Q;
        return filter;
    }

    // ─── Signal chain ─────────────────────────────────────────────────────────

    /**
     * Build (or rebuild) the full node chain:
     *   source → bass → mid → treble → [volumeGain → compressor → makeupGain] → analyser → destination
     *
     * Volume-control nodes are owned by VolumeControl and may not yet exist when
     * init() is called. They are spliced in when present; when absent the chain
     * connects directly treble → analyser. Call reconnect() after VolumeControl
     * creates its nodes to insert them into the chain.
     *
     * All nodes are fully disconnected before reconnecting so the chain is always
     * in a consistent state after this call.
     */
    _connectNodes() {
        if (!this.audioSource || !this.audioContext) return;

        try {
            // Disconnect every node we own or may have previously connected.
            // We must NOT call disconnect() on VolumeControl's nodes without
            // immediately reconnecting them — the brief disconnect is safe because
            // Web Audio node graphs tolerate transient disconnections without
            // producing audible glitches at this low level.
            const toDisconnect = [
                this.audioSource,
                this.bassFilter,
                this.midFilter,
                this.trebleFilter,
                window.volumeGainNode,
                window.volumeCompressor,
                window.volumeMakeupGain,
                window.crossfadeFadeGain,
            ];
            if (this._analyserConnected) toDisconnect.push(this.analyser);

            toDisconnect.forEach(n => {
                if (n) try { n.disconnect(); } catch (_) {}
            });

            // Build EQ chain
            this.audioSource.connect(this.bassFilter);
            this.bassFilter.connect(this.midFilter);
            this.midFilter.connect(this.trebleFilter);

            let tail = this.trebleFilter;

            // Splice in volume-control nodes if VolumeControl has created them
            const vc = this._volumeControlNodes();
            if (vc) {
                tail.connect(vc.gain);
                vc.gain.connect(vc.compressor);
                vc.compressor.connect(vc.makeup);
                tail = vc.makeup;
            }

            // Splice in crossfade fade-gain node if CrossfadeManager has created it.
            // Placing it here (after EQ + volume, before analyser) means the
            // visualiser also fades, matching the intended UX.
            if (window.crossfadeFadeGain) {
                tail.connect(window.crossfadeFadeGain);
                tail = window.crossfadeFadeGain;
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

    /**
     * Returns the three VolumeControl nodes as a grouped object, or null if any
     * are missing. Using a single null-check point avoids scattered conditionals.
     */
    _volumeControlNodes() {
        const gain       = window.volumeGainNode;
        const compressor = window.volumeCompressor;
        const makeup     = window.volumeMakeupGain;

        return (gain && compressor && makeup) ? { gain, compressor, makeup } : null;
    }

    /**
     * Public reconnect — call this after VolumeControl creates its audio nodes
     * to insert them into the existing pipeline chain.
     */
    reconnect() {
        if (!this.isInitialized) {
            this._log('⚠️ reconnect() called before init()', 'warning');
            return;
        }
        this._connectNodes();
    }

    // ─── EQ helpers ───────────────────────────────────────────────────────────

    /**
     * Smoothly ramp a filter's gain to `value` dB over a 20 ms time-constant.
     * Uses setTargetAtTime to avoid audible clicks on sudden changes.
     */
    setGain(filter, value) {
        if (!filter || !this.audioContext || !this.isInitialized) return;
        filter.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.02);
    }

    setBass(value)   { this.setGain(this.bassFilter,   value); }
    setMid(value)    { this.setGain(this.midFilter,    value); }
    setTreble(value) { this.setGain(this.trebleFilter, value); }

    // ─── Context lifecycle ────────────────────────────────────────────────────

    async resume() {
        if (!this.isInitialized || !this.audioContext) return;
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            this._log('🔊 AudioContext resumed', 'success');
        }
    }

    async suspend() {
        if (!this.isInitialized || !this.audioContext) return;
        if (this.audioContext.state === 'running') {
            await this.audioContext.suspend();
            this._log('🔇 AudioContext suspended', 'info');
        }
    }

    // ─── Visualizer data ──────────────────────────────────────────────────────

    /**
     * Populate and return the frequency byte array.
     * Returns null if the pipeline is not ready.
     */
    getFrequencyData() {
        if (!this.isInitialized || !this.analyser || !this.dataArray) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        if (!this.isInitialized) {
            this._log('⚠️ AudioPipeline.destroy() called before init()', 'warning');
            return;
        }

        this._log('🧹 Destroying AudioPipeline…', 'info');

        try {
            // Disconnect all owned nodes before closing the context
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

        this._nullifyNodes();

        this.isInitialized     = false;
        this._analyserConnected = false;

        this._log('✅ AudioPipeline destroyed', 'success');
    }

    /**
     * Null out all node references so that post-destroy access causes an obvious
     * error rather than silently operating on a disconnected/closed node.
     */
    _nullifyNodes() {
        this.audioContext = null;
        this.audioSource  = null;
        this.analyser     = null;
        this.bassFilter   = null;
        this.midFilter    = null;
        this.trebleFilter = null;
        this.dataArray    = null;
        this.bufferLength = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioPipeline;
}

console.log('✅ AudioPipeline v1.2 loaded');