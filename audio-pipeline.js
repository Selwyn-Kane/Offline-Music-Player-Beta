/* ============================================
   Audio Pipeline Module
   Handles AudioContext, nodes, and routing.
   Adheres to "Potato-Friendly" standards.
   ============================================ */

class AudioPipeline {
    constructor(debugLog = console.log) {
        this.debugLog = debugLog;
        this.audioContext = null;
        this.analyser = null;
        this.audioSource = null;
        this.bassFilter = null;
        this.midFilter = null;
        this.trebleFilter = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the audio pipeline
     * @param {HTMLAudioElement} player - The audio element
     */
    init(player) {
        if (this.isInitialized) return;

        try {
            // 1. Get or create AudioContext
            this.audioContext = window.sharedAudioContext || new (window.AudioContext || window.webkitAudioContext)();
            window.sharedAudioContext = this.audioContext;

            // 2. Create Analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.FFT_SIZE) ? APP_CONFIG.FFT_SIZE : 2048;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            window.sharedAnalyser = this.analyser;
            window.sharedDataArray = this.dataArray;
            window.sharedBufferLength = this.bufferLength;

            // 3. Create EQ Filters
            this.bassFilter = this.audioContext.createBiquadFilter();
            this.bassFilter.type = 'lowshelf';
            this.bassFilter.frequency.value = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.BASS_FREQ_HZ) ? APP_CONFIG.BASS_FREQ_HZ : 200;
            this.bassFilter.gain.value = 0;
            window.sharedBassFilter = this.bassFilter;

            this.midFilter = this.audioContext.createBiquadFilter();
            this.midFilter.type = 'peaking';
            this.midFilter.frequency.value = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.MID_FREQ_HZ) ? APP_CONFIG.MID_FREQ_HZ : 1000;
            this.midFilter.Q.value = 1;
            this.midFilter.gain.value = 0;
            window.sharedMidFilter = this.midFilter;

            this.trebleFilter = this.audioContext.createBiquadFilter();
            this.trebleFilter.type = 'highshelf';
            this.trebleFilter.frequency.value = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.TREBLE_FREQ_HZ) ? APP_CONFIG.TREBLE_FREQ_HZ : 5000;
            this.trebleFilter.gain.value = 0;
            window.sharedTrebleFilter = this.trebleFilter;

            // 4. Create Source
            if (!window.sharedAudioSource) {
                this.audioSource = this.audioContext.createMediaElementSource(player);
                window.sharedAudioSource = this.audioSource;
            } else {
                this.audioSource = window.sharedAudioSource;
            }

            // 5. Initial Connection
            this.connectNodes();

            this.isInitialized = true;
            this.debugLog('✅ Audio Pipeline initialized', 'success');
            
            // Dispatch event for other modules
            document.dispatchEvent(new CustomEvent('audioContextReady'));
            
        } catch (error) {
            this.debugLog(`❌ Audio Pipeline initialization failed: ${error.message}`, 'error');
        }
    }

    /**
     * Connect or reconnect the audio nodes in the correct order
     * Chain: source → bass → mid → treble → [volume/compressor] → analyser → output
     */
    connectNodes() {
        if (!this.audioSource) return;

        try {
            // Disconnect everything first to avoid double connections
            this.audioSource.disconnect();
            this.bassFilter.disconnect();
            this.midFilter.disconnect();
            this.trebleFilter.disconnect();
            if (window.volumeGainNode) window.volumeGainNode.disconnect();
            if (window.volumeCompressor) window.volumeCompressor.disconnect();
            if (window.volumeMakeupGain) window.volumeMakeupGain.disconnect();
            this.analyser.disconnect();

            // Start building the chain
            this.audioSource.connect(this.bassFilter);
            this.bassFilter.connect(this.midFilter);
            this.midFilter.connect(this.trebleFilter);

            let lastNode = this.trebleFilter;

            // Integrate Volume Control nodes if they exist
            if (window.volumeGainNode && window.volumeCompressor && window.volumeMakeupGain) {
                lastNode.connect(window.volumeGainNode);
                window.volumeGainNode.connect(window.volumeCompressor);
                window.volumeCompressor.connect(window.volumeMakeupGain);
                lastNode = window.volumeMakeupGain;
            }

            // Connect to Analyser and then Destination
            lastNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.debugLog('🔗 Audio chain connected successfully', 'success');
        } catch (error) {
            this.debugLog(`❌ Failed to connect audio nodes: ${error.message}`, 'error');
        }
    }

    /**
     * Set EQ gain with smooth transition
     */
    setGain(filter, value) {
        if (!filter || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        // Adhere to "Potato-Friendly" rule: Use setTargetAtTime for smooth transitions
        filter.gain.setTargetAtTime(value, now, 0.02);
    }

    setBass(value) { this.setGain(this.bassFilter, value); }
    setMid(value) { this.setGain(this.midFilter, value); }
    setTreble(value) { this.setGain(this.trebleFilter, value); }

    /**
     * Resume AudioContext if suspended
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            this.debugLog('🔊 AudioContext resumed', 'success');
        }
    }

    /**
     * Suspend AudioContext
     */
    async suspend() {
        if (this.audioContext && this.audioContext.state === 'running') {
            await this.audioContext.suspend();
            this.debugLog('🔇 AudioContext suspended', 'info');
        }
    }

    /**
     * Get frequency data for visualizers
     */
    getFrequencyData() {
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            return this.dataArray;
        }
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioPipeline;
}
