/* ============================================
   Enhanced Volume Control System - FULLY FIXED
   Advanced features: normalization, boost, fade, presets, compression
   ============================================ */

class VolumeControl {
    constructor(player, debugLog) {
        this.player = player;
        this.debugLog = debugLog;
        
        // Core state
        this.baseVolume = 1;
        this.lastVolume = 1;
        this.isMutedState = false;
        this.volumeSaveTimeout = null;
        
        // Advanced features
        this.boostEnabled = false;
        this.boostAmount = 1.5; // 1.5 = 150%
        this.normalizationEnabled = true; // Enabled by default for better QoL
        this.targetLoudness = 0.7; // Target normalization level
        this.trackVolumes = new Map(); // Per-track volume memory
        this.volumeHistory = [];
        this.historyIndex = -1;
        this.maxHistorySize = 20;
        
        // Fade settings
        this.fadeEnabled = true;
        this.fadeInDuration = 0.5; // seconds
        this.fadeOutDuration = 0.3;
        this.isFading = false;
        this.fadeInterval = null;
        this.volumeBeforeFade = null; // Track volume before fade
        
        // Audio nodes (for boost and compression)
        this.gainNode = null;
        this.compressor = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.isAudioContextInitialized = false;
        
        // DOM elements
        this.volumeSlider = document.getElementById('volume-slider');
        this.volumeIcon = document.getElementById('volume-icon');
        this.volumePercentage = document.getElementById('volume-percentage');
        
        if (!this.volumeSlider || !this.volumeIcon || !this.volumePercentage) {
            console.error('Volume control elements not found in DOM');
            return;
        }
        
        this.init();
    }
    
    /**
     * Initialize volume control
     */
    init() {
        // Load saved settings
        this.loadSettings();
        
        // Apply initial volume (start with player.volume until Web Audio is ready)
        this.applyVolume(this.baseVolume);
        this.volumeSlider.value = this.baseVolume;
        
        // Update UI
        this.updateUI();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load per-track volumes
        this.loadTrackVolumes();
        
        // Initialize audio context immediately to ensure boost works
        this.setupAudioContextInitialization();
        
        this.debugLog('✅ Enhanced volume control initialized', 'success');
    }
    
    /**
     * Set up audio context initialization on user interaction
     */
    setupAudioContextInitialization() {
        const initAudio = () => {
            if (!this.isAudioContextInitialized) {
                this.initAudioNodes();
            }
        };
        
        // Try to initialize on any user interaction
        const events = ['click', 'keydown', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, initAudio, { once: true });
        });
        
        // Also try when player starts playing
        this.player.addEventListener('play', initAudio, { once: true });
    }
    
/**
 * ✅ ENHANCED: Initialize audio nodes with robust error handling and auto-reconnection
 * This version creates the nodes AND attempts to integrate them into the existing chain
 */
initAudioNodes() {
    if (this.isAudioContextInitialized) {
        this.debugLog('Audio nodes already initialized', 'info');
        return true;
    }
    
    try {
        // Step 1: Get or wait for audio context
        this.audioContext = window.audioContext || window.sharedAudioContext;
        
        if (!this.audioContext) {
            this.debugLog('⏳ AudioContext not ready yet - will retry on next interaction', 'warning');
            return false;
        }
        
        // Step 2: Resume context if suspended (critical for PWA/mobile)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                this.debugLog('✅ AudioContext resumed', 'success');
            }).catch(err => {
                this.debugLog(`⚠️ Failed to resume AudioContext: ${err.message}`, 'warning');
            });
        }
        
        // Step 3: Create gain node (volume + boost control)
        this.gainNode = this.audioContext.createGain();
        const initialGain = this.baseVolume * (this.boostEnabled ? this.boostAmount : 1.0);
        this.gainNode.gain.value = initialGain;
        
        // Step 4: Create compressor (prevent clipping, especially with boost)
        this.compressor = this.audioContext.createDynamicsCompressor();
        
        // Optimized settings to prevent distortion while maintaining dynamics
        this.compressor.threshold.setValueAtTime(-10, this.audioContext.currentTime);
        this.compressor.knee.setValueAtTime(20, this.audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(20, this.audioContext.currentTime);
        this.compressor.attack.setValueAtTime(0.001, this.audioContext.currentTime);
        this.compressor.release.setValueAtTime(0.1, this.audioContext.currentTime);
        
        // Step 5: Create makeup gain (compensate for compression reduction)
        this.makeupGain = this.audioContext.createGain();
        this.makeupGain.gain.value = 1.2;
        
        // Step 6: Store globally for script.js access
        window.volumeGainNode = this.gainNode;
        window.volumeCompressor = this.compressor;
        window.volumeMakeupGain = this.makeupGain;
        
        this.isAudioContextInitialized = true;
        
        this.debugLog('✅ Volume control nodes created successfully', 'success');
        
        // Step 7: Attempt automatic chain integration (non-blocking)
        this.attemptChainIntegration();
        
        return true;
        
    } catch (err) {
        this.debugLog(`❌ Failed to initialize audio nodes: ${err.message}`, 'error');
        this.isAudioContextInitialized = false;
        return false;
    }
}

/**
 * ✅ NEW: Attempt to integrate volume nodes into existing audio chain
 * This runs asynchronously and retries if the chain isn't ready yet
 */
attemptChainIntegration() {
    // Check if script.js has the reconnection function
    if (typeof reconnectAudioChainWithVolumeControl === 'function') {
        // Try immediate connection
        const success = reconnectAudioChainWithVolumeControl();
        
        if (success) {
            this.debugLog('🔗 Volume control integrated into audio chain', 'success');
        } else {
            // Retry after a delay
            this.debugLog('⏳ Audio chain not ready - scheduling retry...', 'info');
            setTimeout(() => {
                const retrySuccess = reconnectAudioChainWithVolumeControl();
                if (retrySuccess) {
                    this.debugLog('🔗 Volume control integrated (retry successful)', 'success');
                } else {
                    this.debugLog('⚠️ Volume control nodes created but not yet connected', 'warning');
                }
            }, 1000);
        }
    } else {
        // Fallback: just log that nodes are ready
        this.debugLog('💡 Volume nodes ready - awaiting manual chain connection', 'info');
    }
}

/**
 * ✅ NEW: Force reconnection of audio chain
 * Call this manually if audio system is initialized after volume control
 * @returns {boolean} True if reconnection succeeded
 */
forceReconnect() {
    if (!this.isAudioContextInitialized) {
        this.debugLog('❌ Cannot reconnect - audio nodes not initialized', 'error');
        return false;
    }
    
    if (typeof reconnectAudioChainWithVolumeControl === 'function') {
        const success = reconnectAudioChainWithVolumeControl();
        if (success) {
            this.debugLog('🔗 Audio chain manually reconnected', 'success');
            return true;
        }
    }
    
    this.debugLog('❌ Manual reconnection failed', 'error');
    return false;
}
    
    /**
     * Apply volume to the appropriate control (gain node or player)
     * @param {number} volume - Volume value (0-1)
     * @param {boolean} smooth - Use smooth ramping
     */
    applyVolume(volume, smooth = false, trackAnalysis = null) {
        let normalizationMultiplier = 1.0;
        
        // Apply smart normalization if enabled and analysis is available
        if (this.normalizationEnabled && trackAnalysis && trackAnalysis.loudness) {
            const trackLoudness = trackAnalysis.loudness;
            // Calculate how much to adjust to reach target (simplified ReplayGain-like)
            // If track is quiet (e.g. 0.4), multiplier will be > 1.0
            // If track is loud (e.g. 0.9), multiplier will be < 1.0
            normalizationMultiplier = this.targetLoudness / Math.max(0.1, trackLoudness);
            
            // Clamp multiplier to prevent extreme changes
            normalizationMultiplier = Math.max(0.5, Math.min(2.0, normalizationMultiplier));
        }

        if (this.isAudioContextInitialized && this.gainNode && this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            // Use Web Audio API gain node
            const boostMultiplier = this.boostEnabled ? this.boostAmount : 1.0;
            const targetGain = volume * boostMultiplier * normalizationMultiplier;
            const now = this.audioContext.currentTime;
            
            try {
                if (smooth) {
                    this.gainNode.gain.setTargetAtTime(targetGain, now, 0.02);
                } else {
                    this.gainNode.gain.setValueAtTime(targetGain, now);
                }
            } catch (e) {
                this.gainNode.gain.value = targetGain;
            }
        } else {
            // Fallback to player.volume (boost/norm won't work here)
            this.player.volume = Math.min(1.0, volume * normalizationMultiplier);
        }
    }
    
    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Slider input handler with smooth ramping
        this.volumeSlider.addEventListener('input', (e) => {
            const newVolume = parseFloat(e.target.value);
            this.setVolume(newVolume, true, true); // smooth = true
        });
        
        // Mouse wheel on slider (finer control)
        this.volumeSlider.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newVolume = Math.max(0, Math.min(1, this.baseVolume + delta));
            this.setVolume(newVolume, false, true); // don't add to history, but smooth
        });
        
        // Icon click to toggle mute
        this.volumeIcon.addEventListener('click', () => {
            this.toggleMute();
        });
        
        // Double-click icon for quick volume reset to 100%
        this.volumeIcon.addEventListener('dblclick', () => {
            this.setVolume(1, true);
        });
        
        // Right-click icon for volume menu (custom context menu)
        this.volumeIcon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showVolumeMenu(e.clientX, e.clientY);
        });
        
        // Player events for smart fade
        this.player.addEventListener('play', () => this.handlePlayEvent());
        this.player.addEventListener('pause', () => this.handlePauseEvent());
        this.player.addEventListener('ended', () => this.handlePauseEvent());
        
        // Update UI on any volume change
        this.player.addEventListener('volumechange', () => {
            this.updateUI();
        });
    }
    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const savedVolume = localStorage.getItem('playerVolume');
            if (savedVolume) {
                this.baseVolume = Math.max(0, Math.min(1, parseFloat(savedVolume)));
                this.lastVolume = this.baseVolume;
            }
            
            const savedBoost = localStorage.getItem('volumeBoostEnabled');
            if (savedBoost !== null) {
                this.boostEnabled = savedBoost === 'true';
            }
            
            const savedBoostAmount = localStorage.getItem('volumeBoostAmount');
            if (savedBoostAmount) {
                this.boostAmount = Math.max(1.0, Math.min(3.0, parseFloat(savedBoostAmount)));
            }
            
            const savedNormalization = localStorage.getItem('volumeNormalizationEnabled');
            if (savedNormalization !== null) {
                this.normalizationEnabled = savedNormalization === 'true';
            }
            
            const savedFade = localStorage.getItem('volumeFadeEnabled');
            if (savedFade !== null) {
                this.fadeEnabled = savedFade === 'true';
            }
        } catch (err) {
            this.debugLog(`Failed to load volume settings: ${err.message}`, 'error');
        }
    }
    
    /**
     * Save settings to localStorage (debounced)
     */
    debounceSaveSettings() {
        clearTimeout(this.volumeSaveTimeout);
        this.volumeSaveTimeout = setTimeout(() => {
            try {
                localStorage.setItem('playerVolume', this.baseVolume.toString());
                localStorage.setItem('volumeBoostEnabled', this.boostEnabled.toString());
                localStorage.setItem('volumeBoostAmount', this.boostAmount.toString());
                localStorage.setItem('volumeNormalizationEnabled', this.normalizationEnabled.toString());
                localStorage.setItem('volumeFadeEnabled', this.fadeEnabled.toString());
            } catch (err) {
                this.debugLog(`Failed to save volume settings: ${err.message}`, 'error');
            }
        }, 500);
    }
    
    /**
     * Update volume UI
     */
    updateUI() {
        const effectiveVolume = this.getEffectiveVolume();
        const displayVolume = Math.round(this.baseVolume * 100);
        
        // Update percentage display
        let displayText = `${displayVolume}%`;
        if (this.boostEnabled && this.boostAmount > 1) {
            const effectivePercent = Math.round(effectiveVolume * 100);
            displayText = `${displayVolume}% (${effectivePercent}%)`;
        }
        this.volumePercentage.textContent = displayText;
        
        // Update slider visual
        this.volumeSlider.value = this.baseVolume;
        if (this.volumeSlider.style.setProperty) {
            this.volumeSlider.style.setProperty('--volume-percent', `${displayVolume}%`);
        }
        
        // Update icon based on volume level
        if (this.isMutedState || this.baseVolume === 0) {
            this.volumeIcon.textContent = '🔇';
        } else if (this.baseVolume < 0.3) {
            this.volumeIcon.textContent = '🔈';
        } else if (this.baseVolume < 0.7) {
            this.volumeIcon.textContent = '🔉';
        } else {
            this.volumeIcon.textContent = '🔊';
        }
        
        // Add boost indicator
        if (this.boostEnabled && this.boostAmount > 1) {
            this.volumeIcon.style.color = '#ffc107';
            this.volumeIcon.title = `Volume Boost Active (${Math.round(this.boostAmount * 100)}%)`;
        } else {
            this.volumeIcon.style.color = '';
            this.volumeIcon.title = 'Volume Control';
        }
    }
    
    /**
     * Set volume with smooth ramping
     * @param {number} volume - Target volume (0-1)
     * @param {boolean} addToHistory - Whether to add to undo history
     * @param {boolean} smooth - Use smooth ramping
     */
    setVolume(volume, addToHistory = true, smooth = false, trackAnalysis = null) {
        volume = Math.max(0, Math.min(1, volume));
        
        if (this.isFading) {
            this.stopFade();
        }
        
        if (addToHistory && volume !== this.baseVolume) {
            this.addToHistory(volume);
        }
        
        this.baseVolume = volume;
        this.volumeSlider.value = volume;
        
        this.applyVolume(volume, smooth, trackAnalysis);
        
        if (this.isMutedState && volume > 0) {
            this.isMutedState = false;
            this.player.muted = false;
        }
        
        this.updateUI();
        this.debounceSaveSettings();
    }
    
    /**
     * Toggle mute/unmute
     */
    toggleMute() {
        if (this.isMutedState) {
            // Unmute
            this.isMutedState = false;
            this.player.muted = false;
            this.setVolume(this.lastVolume, false);
            this.debugLog('🔊 Unmuted', 'info');
        } else {
            // Mute
            this.lastVolume = this.baseVolume > 0 ? this.baseVolume : 0.5;
            this.isMutedState = true;
            this.player.muted = true;
            this.debugLog('🔇 Muted', 'info');
        }
        this.updateUI();
    }
    
    /**
     * Smart fade in on play
     */
    handlePlayEvent() {
        if (!this.fadeEnabled || this.isFading) return;
        
        // Store the target volume
        const targetVolume = this.baseVolume;
        
        // If we have a saved volume from before fade, use it
        if (this.volumeBeforeFade !== null) {
            this.baseVolume = this.volumeBeforeFade;
            this.volumeBeforeFade = null;
        }
        
        this.isFading = true;
        
        // Fade in from 0 to target
        this.fadeToVolume(0, targetVolume, this.fadeInDuration, () => {
            this.isFading = false;
            this.baseVolume = targetVolume;
            this.volumeSlider.value = targetVolume;
            this.updateUI();
        });
    }
    
    /**
     * Smart fade out on pause
     */
    handlePauseEvent() {
        if (!this.fadeEnabled || this.isFading) return;
        
        // Don't fade if already at low volume
        if (this.baseVolume < 0.1) return;
        
        this.isFading = true;
        
        // Save current volume to restore on next play
        this.volumeBeforeFade = this.baseVolume;
        const currentVolume = this.baseVolume;
        
        // Fade out to 0
        this.fadeToVolume(currentVolume, 0, this.fadeOutDuration, () => {
            this.isFading = false;
            // Keep baseVolume at the saved value for UI display
            // but the actual audio will be at 0
        });
    }
    
    /**
     * Stop any active fade
     */
    stopFade() {
        if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }
        
        // Cancel any scheduled gain changes
        if (this.isAudioContextInitialized && this.gainNode && this.audioContext) {
            const now = this.audioContext.currentTime;
            this.gainNode.gain.cancelScheduledValues(now);
        }
        
        this.isFading = false;
        this.volumeBeforeFade = null;
    }
    
    /**
     * Fade from current volume to target volume over duration
     * @param {number} startVolume - Starting volume (0-1)
     * @param {number} targetVolume - Target volume (0-1)
     * @param {number} duration - Fade duration in seconds
     * @param {Function} callback - Called when fade completes
     */
    fadeToVolume(startVolume, targetVolume, duration, callback) {
        // Clear any existing fade
        this.stopFade();
        
        const startTime = Date.now();
        const volumeDelta = targetVolume - startVolume;
        
        if (this.isAudioContextInitialized && this.gainNode && this.audioContext) {
            // Resume audio context if needed
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            // Use Web Audio API for smooth fading
            const now = this.audioContext.currentTime;
            const boostMultiplier = this.boostEnabled ? this.boostAmount : 1.0;
            
            try {
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(startVolume * boostMultiplier, now);
                this.gainNode.gain.linearRampToValueAtTime(targetVolume * boostMultiplier, now + duration);
            } catch (e) {
                // Fallback if scheduling fails
                this.gainNode.gain.value = startVolume * boostMultiplier;
            }
            
            // Update UI during fade
            let currentDisplayVolume = startVolume;
            this.fadeInterval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                currentDisplayVolume = startVolume + (volumeDelta * progress);
                
                // Update slider without triggering volume change
                this.volumeSlider.value = currentDisplayVolume;
                
                if (progress >= 1) {
                    clearInterval(this.fadeInterval);
                    this.fadeInterval = null;
                    if (callback) callback();
                }
            }, 50);
        } else {
            // Fallback to JavaScript animation
            this.fadeInterval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                const currentVolume = startVolume + (volumeDelta * progress);
                this.applyVolume(currentVolume);
                this.volumeSlider.value = currentVolume;
                
                if (progress >= 1) {
                    clearInterval(this.fadeInterval);
                    this.fadeInterval = null;
                    if (callback) callback();
                }
            }, 50);
        }
    }
    
    /**
     * Enable/disable volume boost
     * @param {boolean} enabled - Enable boost
     * @param {number} amount - Boost multiplier (1.0 - 3.0)
     */
    setBoost(enabled, amount = 1.5) {
        this.boostEnabled = enabled;
        this.boostAmount = Math.max(1.0, Math.min(3.0, amount));
        
        // Ensure audio context is initialized for boost to work
        if (enabled && !this.isAudioContextInitialized) {
            this.initAudioNodes();
        }
        
        // Reapply volume with new boost setting
        this.applyVolume(this.baseVolume, true);
        
        this.updateUI();
        this.debounceSaveSettings();
        
        const status = enabled ? 'ON' : 'OFF';
        const percent = Math.round(this.boostAmount * 100);
        this.debugLog(`🎚️ Volume boost: ${status} (${percent}%)`, 'info');
        
        if (enabled && !this.isAudioContextInitialized) {
            this.debugLog('⚠️ Boost requires Web Audio - play audio to enable', 'warn');
        }
    }
    
    /**
     * Enable/disable smart fade
     * @param {boolean} enabled - Enable fade
     */
    setFade(enabled) {
        this.fadeEnabled = enabled;
        
        // If disabling fade while fading, stop the fade
        if (!enabled && this.isFading) {
            this.stopFade();
            // Restore proper volume
            if (this.volumeBeforeFade !== null) {
                this.setVolume(this.volumeBeforeFade, false);
                this.volumeBeforeFade = null;
            }
        }
        
        this.debounceSaveSettings();
        this.debugLog(`🎵 Smart fade: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }
    
    /**
     * Apply volume preset
     * @param {string} preset - Preset name
     */
    applyPreset(preset) {
        const presets = {
            silent: 0,
            quiet: 0.3,
            normal: 0.7,
            loud: 1.0,
            nightMode: 0.4,
            cinema: 0.8
        };
        
        if (preset in presets) {
            this.setVolume(presets[preset], true, true);
            this.debugLog(`🎚️ Applied volume preset: ${preset}`, 'info');
        }
    }
    
    /**
     * Remember volume for specific track
     * @param {string} trackId - Unique track identifier
     * @param {number} volume - Volume to remember
     */
    rememberTrackVolume(trackId, volume) {
        if (!trackId) return;
        
        this.trackVolumes.set(trackId, volume);
        this.saveTrackVolumes();
    }
    
    /**
     * Apply remembered volume for track
     * @param {string} trackId - Unique track identifier
     * @returns {boolean} True if volume was applied
     */
    applyTrackVolume(trackId) {
        if (!trackId || !this.trackVolumes.has(trackId)) return false;
        
        const savedVolume = this.trackVolumes.get(trackId);
        this.setVolume(savedVolume, false, true);
        this.debugLog(`📌 Applied saved volume for track: ${Math.round(savedVolume * 100)}%`, 'info');
        return true;
    }
    
    /**
     * Save track volumes to localStorage
     */
    saveTrackVolumes() {
        try {
            const data = Array.from(this.trackVolumes.entries());
            localStorage.setItem('volumeTrackMemory', JSON.stringify(data));
        } catch (err) {
            this.debugLog(`Failed to save track volumes: ${err.message}`, 'error');
        }
    }
    
    /**
     * Load track volumes from localStorage
     */
    loadTrackVolumes() {
        try {
            const data = localStorage.getItem('volumeTrackMemory');
            if (data) {
                const entries = JSON.parse(data);
                this.trackVolumes = new Map(entries);
                this.debugLog(`📚 Loaded ${this.trackVolumes.size} track volume memories`, 'info');
            }
        } catch (err) {
            this.debugLog(`Failed to load track volumes: ${err.message}`, 'error');
        }
    }
    
    /**
     * Add volume change to history for undo/redo
     * @param {number} volume - Volume value
     */
    addToHistory(volume) {
        // Remove any redo history
        this.volumeHistory = this.volumeHistory.slice(0, this.historyIndex + 1);
        
        // Add new entry
        this.volumeHistory.push(volume);
        this.historyIndex = this.volumeHistory.length - 1;
        
        // Limit history size
        if (this.volumeHistory.length > this.maxHistorySize) {
            this.volumeHistory.shift();
            this.historyIndex--;
        }
    }
    
    /**
     * Undo last volume change
     */
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const volume = this.volumeHistory[this.historyIndex];
            this.setVolume(volume, false, true);
            this.debugLog(`↩️ Undo: ${Math.round(volume * 100)}%`, 'info');
            return true;
        }
        return false;
    }
    
    /**
     * Redo volume change
     */
    redo() {
        if (this.historyIndex < this.volumeHistory.length - 1) {
            this.historyIndex++;
            const volume = this.volumeHistory[this.historyIndex];
            this.setVolume(volume, false, true);
            this.debugLog(`↪️ Redo: ${Math.round(volume * 100)}%`, 'info');
            return true;
        }
        return false;
    }
    
    /**
     * Show custom volume menu
     * @param {number} x - Mouse X position
     * @param {number} y - Mouse Y position
     */
    showVolumeMenu(x, y) {
        // Remove existing menu
        const existing = document.getElementById('volume-context-menu');
        if (existing) existing.remove();
        
        const menu = document.createElement('div');
        menu.id = 'volume-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: #1a1a1a;
            border: 2px solid #dc3545;
            border-radius: 8px;
            padding: 10px;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            min-width: 200px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        const options = [
            { label: '🔇 Silent (0%)', action: () => this.applyPreset('silent') },
            { label: '🔉 Quiet (30%)', action: () => this.applyPreset('quiet') },
            { label: '🔊 Normal (70%)', action: () => this.applyPreset('normal') },
            { label: '📢 Loud (100%)', action: () => this.applyPreset('loud') },
            { separator: true },
            { label: `🌙 Night Mode (40%)`, action: () => this.applyPreset('nightMode') },
            { label: `🎬 Cinema (80%)`, action: () => this.applyPreset('cinema') },
            { separator: true },
            { 
                label: `⚡ Boost: ${this.boostEnabled ? 'ON ✓' : 'OFF'}`, 
                action: () => this.setBoost(!this.boostEnabled, this.boostAmount) 
            },
            { 
                label: `🎵 Fade: ${this.fadeEnabled ? 'ON ✓' : 'OFF'}`, 
                action: () => this.setFade(!this.fadeEnabled) 
            }
        ];
        
        options.forEach(opt => {
            if (opt.separator) {
                const sep = document.createElement('div');
                sep.style.cssText = 'height: 1px; background: #333; margin: 5px 0;';
                menu.appendChild(sep);
            } else {
                const item = document.createElement('div');
                item.textContent = opt.label;
                item.style.cssText = `
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 4px;
                    color: #fff;
                    font-size: 14px;
                    transition: background 0.2s;
                `;
                item.addEventListener('mouseover', () => item.style.background = '#dc3545');
                item.addEventListener('mouseout', () => item.style.background = '');
                item.addEventListener('click', () => {
                    opt.action();
                    menu.remove();
                });
                menu.appendChild(item);
            }
        });
        
        document.body.appendChild(menu);
        
        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        // Delay to prevent immediate close from the same click
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }
    
    /**
     * Get effective volume (including boost)
     * @returns {number} Effective volume
     */
    getEffectiveVolume() {
        return Math.min(1.0, this.baseVolume * (this.boostEnabled ? this.boostAmount : 1.0));
    }
    
    /**
     * Increase volume by delta
     * @param {number} delta - Amount to increase (default 0.1)
     */
    increaseVolume(delta = 0.1) {
        const newVolume = Math.min(1, this.baseVolume + delta);
        this.setVolume(newVolume, true, true);
    }
    
    /**
     * Decrease volume by delta
     * @param {number} delta - Amount to decrease (default 0.1)
     */
    decreaseVolume(delta = 0.1) {
        const newVolume = Math.max(0, this.baseVolume - delta);
        this.setVolume(newVolume, true, true);
    }
    
    /**
     * Get current volume
     * @returns {number} Current base volume (0-1)
     */
    getVolume() {
        return this.baseVolume;
    }
    
    /**
     * Check if muted
     * @returns {boolean} True if muted
     */
    isMuted() {
        return this.isMutedState;
    }
    
    /**
     * Check if boost is enabled
     * @returns {boolean} True if boost is enabled
     */
    isBoostEnabled() {
        return this.boostEnabled;
    }
    
    setBoost(enabled, amount = 1.5) {
        this.boostEnabled = enabled;
        this.boostAmount = Math.max(1.0, Math.min(3.0, amount));
        
        if (enabled && !this.isAudioContextInitialized) {
            this.initAudioNodes();
        }
        
        this.applyVolume(this.baseVolume, true);
        this.updateUI();
        this.debounceSaveSettings();
        
        const status = enabled ? 'ON' : 'OFF';
        const percent = Math.round(this.boostAmount * 100);
        this.debugLog(`🎚️ Volume boost: ${status} (${percent}%)`, 'info');
    }

    /**
     * Enable/disable smart normalization
     * @param {boolean} enabled - Enable normalization
     */
    setNormalization(enabled) {
        this.normalizationEnabled = enabled;
        this.applyVolume(this.baseVolume, true);
        this.debounceSaveSettings();
        this.debugLog(`⚖️ Smart Normalization: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }
    
    /**
     * Get boost amount
     * @returns {number} Boost multiplier
     */
    getBoostAmount() {
        return this.boostAmount;
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        // Stop any active fades
        this.stopFade();
        
        // Clear timeouts
        if (this.volumeSaveTimeout) {
            clearTimeout(this.volumeSaveTimeout);
        }
        
        // Disconnect audio nodes
        if (this.sourceNode) {
            try {
                this.sourceNode.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
        
        if (this.gainNode) {
            try {
                this.gainNode.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
        
        if (this.compressor) {
            try {
                this.compressor.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
        
        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        this.debugLog('🔇 Volume control destroyed', 'info');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VolumeControl;
}