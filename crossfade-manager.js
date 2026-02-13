/* ============================================
   Crossfade Manager - ENHANCED v3.0
   Smart transitions, Gapless Playback, and Audio Smoothing
   ============================================ */

class CrossfadeManager {
    constructor(audioContext, debugLog) {
        this.audioContext = audioContext;
        this.debugLog = debugLog;
        
        // Core settings
        this.enabled = false;
        this.gaplessEnabled = true; // New: Gapless playback support
        this.baseDuration = 4; // Default crossfade duration in seconds
        
        // State tracking
        this.isFading = false;
        this.fadeStartTime = null;
        this.scheduledNextTrack = null;
        this.fadeCheckInterval = null;
        this.lastCheckTime = 0;
        
        // Audio nodes (created lazily)
        this.fadeGainNode = null;
        this.isInitialized = false;
        
        // Next track preload
        this.nextTrackPreloaded = null;
        this.preloadBlob = null;
        
        // Smart fade parameters
        this.minFadeDuration = 1.5;
        this.maxFadeDuration = 8;
        this.fadeStartOffset = 5; // Start fade X seconds before track ends
        
        // Load saved settings
        this.loadSettings();
        
        this.debugLog('✅ Enhanced Crossfade Manager initialized', 'success');
    }
    
    /**
     * Initialize audio nodes when audio context is ready
     */
    initAudioNodes() {
        if (this.isInitialized || !this.audioContext) {
            return false;
        }
        
        try {
            // Create gain node for fade control
            this.fadeGainNode = this.audioContext.createGain();
            this.fadeGainNode.gain.value = 1.0;
            
            // Store globally for audio chain integration
            window.crossfadeFadeGain = this.fadeGainNode;
            
            this.isInitialized = true;
            this.debugLog('🎚️ Crossfade audio nodes created', 'success');
            return true;
        } catch (err) {
            this.debugLog(`❌ Failed to init crossfade nodes: ${err.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Connect to audio chain - call this after EQ chain is set up
     */
    connectToAudioChain(inputNode, outputNode) {
        if (!this.isInitialized) {
            this.initAudioNodes();
        }
        
        if (!this.fadeGainNode) {
            this.debugLog('⚠️ Cannot connect - nodes not initialized', 'warning');
            return false;
        }
        
        try {
            // Disconnect existing connection
            inputNode.disconnect();
            
            // Insert our fade gain node
            inputNode.connect(this.fadeGainNode);
            this.fadeGainNode.connect(outputNode);
            
            this.debugLog('✅ Crossfade inserted into audio chain', 'success');
            return true;
        } catch (err) {
            this.debugLog(`❌ Chain connection failed: ${err.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const enabled = localStorage.getItem('crossfadeEnabled');
            if (enabled !== null) {
                this.enabled = enabled === 'true';
            }
            
            const gapless = localStorage.getItem('gaplessEnabled');
            if (gapless !== null) {
                this.gaplessEnabled = gapless === 'true';
            }
            
            const duration = localStorage.getItem('crossfadeDuration');
            if (duration !== null) {
                this.baseDuration = parseFloat(duration);
            }
            
            const offset = localStorage.getItem('crossfadeStartOffset');
            if (offset !== null) {
                this.fadeStartOffset = parseFloat(offset);
            }
        } catch (err) {
            this.debugLog('⚠️ Could not load crossfade settings', 'warning');
        }
    }
    
    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('crossfadeEnabled', this.enabled.toString());
            localStorage.setItem('gaplessEnabled', this.gaplessEnabled.toString());
            localStorage.setItem('crossfadeDuration', this.baseDuration.toString());
            localStorage.setItem('crossfadeStartOffset', this.fadeStartOffset.toString());
        } catch (err) {
            this.debugLog('⚠️ Could not save crossfade settings', 'warning');
        }
    }
    
    /**
     * Calculate optimal crossfade duration based on track analysis
     */
    calculateFadeDuration(currentTrack, nextTrack) {
        // If gapless is enabled and tracks are from same album/artist, use very short fade
        if (this.gaplessEnabled && 
            currentTrack?.metadata?.album === nextTrack?.metadata?.album && 
            currentTrack?.metadata?.album) {
            this.debugLog('✨ Gapless transition detected (Same Album)', 'info');
            return 0.1; // Minimal crossfade for gapless
        }

        let duration = this.baseDuration;
        
        if (!currentTrack?.analysis || !nextTrack?.analysis) {
            return duration;
        }
        
        const currBPM = currentTrack.analysis.bpm || 120;
        const nextBPM = nextTrack.analysis.bpm || 120;
        const bpmDiff = Math.abs(currBPM - nextBPM);
        
        const currEnergy = currentTrack.analysis.energy || 0.5;
        const nextEnergy = nextTrack.analysis.energy || 0.5;
        const energyDiff = Math.abs(currEnergy - nextEnergy);
        
        // Similar tracks = longer fade (smooth blend)
        if (bpmDiff < 8 && energyDiff < 0.15) {
            duration = Math.min(this.maxFadeDuration, this.baseDuration + 2);
            this.debugLog(`🎵 Similar tracks → ${duration}s fade`, 'info');
        }
        // Very different = shorter fade (quick transition)
        else if (bpmDiff > 30 || energyDiff > 0.5) {
            duration = Math.max(this.minFadeDuration, this.baseDuration - 1.5);
            this.debugLog(`⚡ Different tracks → ${duration}s fade`, 'info');
        }
        
        return duration;
    }
    
    /**
     * Determine when to start fading based on track analysis
     */
    calculateFadeStartPoint(track, duration) {
        if (!track?.analysis || !duration) {
            return duration - this.fadeStartOffset;
        }
        
        const trackDuration = duration;
        const analysis = track.analysis;
        
        // If track has outro, start fade during it
        if (analysis.outro && analysis.outro.start) {
            const outroStart = analysis.outro.start;
            const fadeStart = Math.max(
                trackDuration - this.fadeStartOffset - 3,
                outroStart - (this.baseDuration / 2)
            );
            return fadeStart;
        }
        
        // High energy tracks = later fade
        if (analysis.energy > 0.7) {
            return trackDuration - this.fadeStartOffset - 1.5;
        }
        
        // Low energy = earlier fade
        if (analysis.energy < 0.3) {
            return trackDuration - this.fadeStartOffset - 4.5;
        }
        
        // Default
        return trackDuration - this.fadeStartOffset - 3;
    }
    
    /**
     * Preload next track audio data
     */
    async preloadNextTrack(track) {
        if (!track || (!track.audioURL && !track.file)) {
            return false;
        }
        
        try {
            // Clean up previous preload
            if (this.preloadBlob) {
                URL.revokeObjectURL(this.preloadBlob);
                this.preloadBlob = null;
            }
            
            let blob;
            if (track.file) {
                blob = track.file;
            } else {
                const response = await fetch(track.audioURL);
                blob = await response.blob();
            }

            this.preloadBlob = URL.createObjectURL(blob);
            this.nextTrackPreloaded = track;
            
            const title = track.metadata?.title || track.fileName;
            this.debugLog(`📥 Preloaded: ${title}`, 'success');
            return true;
        } catch (err) {
            this.debugLog(`⚠️ Preload failed: ${err.message}`, 'warning');
            return false;
        }
    }
    
    /**
     * Start monitoring for crossfade opportunity
     */
    startMonitoring(player, currentTrack, nextTrack, onFadeCallback) {
        if ((!this.enabled && !this.gaplessEnabled) || !nextTrack) {
            return;
        }
        
        // Initialize nodes if needed
        if (!this.isInitialized) {
            this.initAudioNodes();
        }
        
        // Store callback
        this.onFadeStart = onFadeCallback;
        this.scheduledNextTrack = nextTrack;
        
        // Preload next track
        this.preloadNextTrack(nextTrack);
        
        // Calculate when to start fade
        const fadeDuration = this.calculateFadeDuration(currentTrack, nextTrack);
        const fadeStartTime = this.calculateFadeStartPoint(currentTrack, player.duration);
        
        this.fadeStartTime = fadeStartTime;
        this.fadeDuration = fadeDuration;
        
        // Start checking every 200ms
        this.stopMonitoring();
        this.fadeCheckInterval = setInterval(() => {
            this.checkFadePoint(player, currentTrack, nextTrack);
        }, 200);
        
        this.debugLog(`👁️ Monitoring for transition at ${fadeStartTime.toFixed(1)}s`, 'info');
    }
    
    /**
     * Check if it's time to start fading
     */
    checkFadePoint(player, currentTrack, nextTrack) {
        if ((!this.enabled && !this.gaplessEnabled) || this.isFading || !player || !this.scheduledNextTrack) {
            return;
        }
        
        const currentTime = player.currentTime;
        const duration = player.duration;
        
        if (!duration || isNaN(duration)) {
            return;
        }

        // Recalculate fade start time if not set
        if (!this.fadeStartTime || isNaN(this.fadeStartTime)) {
            this.fadeStartTime = this.calculateFadeStartPoint(currentTrack, duration);
        }
        
        // Check if we've reached fade point
        if (currentTime >= this.fadeStartTime && currentTime < duration - 0.2) {
            this.executeFade(player, currentTrack, nextTrack);
        }
    }
    
    /**
     * Execute the actual crossfade
     */
async executeFade(player, currentTrack, nextTrack) {
    if (this.isFading) {
        return;
    }
    
    this.isFading = true;
    this.stopMonitoring();
    
    try {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        const fadeDuration = this.fadeDuration || this.baseDuration;
        const now = this.audioContext.currentTime;
        
        const currentTime = player.currentTime;
        const timeRemaining = player.duration - currentTime;
        
        // Start fade out
        if (this.fadeGainNode && this.enabled) {
            this.fadeGainNode.gain.cancelScheduledValues(now);
            this.fadeGainNode.gain.setValueAtTime(this.fadeGainNode.gain.value, now);
            this.fadeGainNode.gain.exponentialRampToValueAtTime(0.001, now + fadeDuration);
            this.debugLog(`📉 Fading out over ${fadeDuration.toFixed(1)}s`, 'info');
        }
        
        // Switch slightly before end for gapless/crossfade
        const switchDelay = Math.max(0, (timeRemaining - (this.enabled ? 0.3 : 0.05)) * 1000);
        
        setTimeout(() => {
            this.switchToNextTrack(player, nextTrack);
        }, switchDelay);
        
        // Reset after fade completes
        setTimeout(() => {
            this.completeFade();
        }, (this.enabled ? fadeDuration : 0.5) * 1000 + 500);
        
    } catch (err) {
        this.debugLog(`❌ Fade execution failed: ${err.message}`, 'error');
        this.isFading = false;
    }
}
    
    /**
     * Switch to next track during fade
     */
switchToNextTrack(player, nextTrack) {
    if (!this.onFadeStart) {
        return;
    }
    
    this.debugLog('🔄 Transitioning tracks...', 'info');
    
    let startTime = 0;
    // Only skip intro if crossfade is enabled (not for gapless album transitions)
    if (this.enabled && nextTrack.analysis?.intro && nextTrack.analysis.intro.end) {
        if (nextTrack.analysis.intro.end > 2) {
            startTime = Math.min(8, nextTrack.analysis.intro.end);
        }
    }
    
    this.onFadeStart({
        track: nextTrack,
        startTime: startTime,
        preloadedURL: this.preloadBlob
    });
}
    
    /**
     * Complete fade and reset
     */
    completeFade() {
        if (!this.isFading) {
            return;
        }
        
        this.isFading = false;
        
        // Restore gain to full
        if (this.fadeGainNode && this.audioContext) {
            const now = this.audioContext.currentTime;
            this.fadeGainNode.gain.cancelScheduledValues(now);
            this.fadeGainNode.gain.setValueAtTime(1.0, now);
        }
        
        // Clean up
        if (this.preloadBlob) {
            URL.revokeObjectURL(this.preloadBlob);
            this.preloadBlob = null;
        }
        
        this.scheduledNextTrack = null;
        this.fadeStartTime = null;
        this.fadeDuration = null;
        
        this.debugLog('✅ Transition complete', 'success');
    }
    
    stopMonitoring() {
        if (this.fadeCheckInterval) {
            clearInterval(this.fadeCheckInterval);
            this.fadeCheckInterval = null;
        }
    }
    
    cancelFade() {
        this.stopMonitoring();
        
        if (this.isFading && this.fadeGainNode && this.audioContext) {
            const now = this.audioContext.currentTime;
            this.fadeGainNode.gain.cancelScheduledValues(now);
            this.fadeGainNode.gain.setValueAtTime(1.0, now);
        }
        
        this.isFading = false;
        this.scheduledNextTrack = null;
        this.fadeStartTime = null;
        
        if (this.preloadBlob) {
            URL.revokeObjectURL(this.preloadBlob);
            this.preloadBlob = null;
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) this.cancelFade();
        this.saveSettings();
    }

    setGaplessEnabled(enabled) {
        this.gaplessEnabled = enabled;
        this.saveSettings();
        this.debugLog(`Gapless: ${enabled ? 'ON ✨' : 'OFF'}`, 'info');
    }
    
    setDuration(seconds) {
        this.baseDuration = Math.max(this.minFadeDuration, Math.min(this.maxFadeDuration, seconds));
        this.saveSettings();
    }
    
    setStartOffset(seconds) {
        this.fadeStartOffset = Math.max(3, Math.min(10, seconds));
        this.saveSettings();
    }
    
    getSettings() {
        return {
            enabled: this.enabled,
            gaplessEnabled: this.gaplessEnabled,
            baseDuration: this.baseDuration,
            fadeStartOffset: this.fadeStartOffset,
            isFading: this.isFading,
            isInitialized: this.isInitialized
        };
    }
    
    dispose() {
        this.cancelFade();
        this.stopMonitoring();
        if (this.preloadBlob) URL.revokeObjectURL(this.preloadBlob);
        if (this.fadeGainNode) try { this.fadeGainNode.disconnect(); } catch (err) {}
    }
}

window.CrossfadeManager = CrossfadeManager;
