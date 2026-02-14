/* ============================================
   Enhanced Volume Control v2.0 - WITH AUTO-INTEGRATION
   Automatically integrates into audio chain when available
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
        this.boostAmount = 1.5;
        this.normalizationEnabled = true;
        this.targetLoudness = 0.7;
        this.trackVolumes = new Map();
        this.volumeHistory = [];
        this.historyIndex = -1;
        this.maxHistorySize = 20;
        
        // Fade settings
        this.fadeEnabled = true;
        this.fadeInDuration = 0.5;
        this.fadeOutDuration = 0.3;
        this.isFading = false;
        this.fadeInterval = null;
        this.volumeBeforeFade = null;
        
        // Audio nodes
        this.gainNode = null;
        this.compressor = null;
        this.makeupGain = null;
        this.audioContext = null;
        this.isAudioContextInitialized = false;
        
        // Integration tracking
        this.integrationAttempts = 0;
        this.maxIntegrationAttempts = 5;
        this.integrationInterval = null;
        
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
    
    init() {
        this.loadSettings();
        this.applyVolume(this.baseVolume);
        this.volumeSlider.value = this.baseVolume;
        this.updateUI();
        this.setupEventListeners();
        this.loadTrackVolumes();
        this.setupAudioContextInitialization();
        
        this.debugLog('✅ Volume control initialized', 'success');
    }
    
    setupAudioContextInitialization() {
        const initAudio = () => {
            if (!this.isAudioContextInitialized) {
                const success = this.initAudioNodes();
                if (success) {
                    // Try to integrate into existing chain
                    this.attemptChainIntegration();
                }
            }
        };
        
        // Try on user interaction
        const events = ['click', 'keydown', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, initAudio, { once: true });
        });
        
        // Try when player starts
        this.player.addEventListener('play', initAudio, { once: true });
        
        // Also try on audioContextReady event
        document.addEventListener('audioContextReady', initAudio, { once: true });
    }
    
    /**
     * ✅ ENHANCED: Create audio nodes and attempt integration
     */
    initAudioNodes() {
        if (this.isAudioContextInitialized) {
            return true;
        }
        
        try {
            // Get audio context
            this.audioContext = window.audioContext || window.sharedAudioContext;
            
            if (!this.audioContext) {
                this.debugLog('⏳ AudioContext not ready - will retry', 'warning');
                return false;
            }
            
            // Resume if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(err => 
                    this.debugLog(`Resume failed: ${err.message}`, 'warning')
                );
            }
            
            // Create gain node
            this.gainNode = this.audioContext.createGain();
            const initialGain = this.baseVolume * (this.boostEnabled ? this.boostAmount : 1.0);
            this.gainNode.gain.value = initialGain;
            
            // Create compressor
            this.compressor = this.audioContext.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-10, this.audioContext.currentTime);
            this.compressor.knee.setValueAtTime(20, this.audioContext.currentTime);
            this.compressor.ratio.setValueAtTime(20, this.audioContext.currentTime);
            this.compressor.attack.setValueAtTime(0.001, this.audioContext.currentTime);
            this.compressor.release.setValueAtTime(0.1, this.audioContext.currentTime);
            
            // Create makeup gain
            this.makeupGain = this.audioContext.createGain();
            this.makeupGain.gain.value = 1.2;
            
            // Store globally
            window.volumeGainNode = this.gainNode;
            window.volumeCompressor = this.compressor;
            window.volumeMakeupGain = this.makeupGain;
            
            this.isAudioContextInitialized = true;
            this.debugLog('✅ Volume nodes created', 'success');
            
            return true;
            
        } catch (err) {
            this.debugLog(`❌ Node creation failed: ${err.message}`, 'error');
            return false;
        }
    }
    
    /**
     * ✅ NEW: Automatic chain integration with retry
     */
    attemptChainIntegration() {
        // Check if reconnection function exists in script.js
        if (typeof window.reconnectAudioChainWithVolumeControl === 'function') {
            const success = window.reconnectAudioChainWithVolumeControl();
            
            if (success) {
                this.debugLog('🔗 Volume control integrated into audio chain', 'success');
                this.stopIntegrationRetries();
                return true;
            }
        }
        
        // If integration failed, schedule retries
        if (this.integrationAttempts < this.maxIntegrationAttempts) {
            this.integrationAttempts++;
            this.debugLog(`⏳ Integration retry ${this.integrationAttempts}/${this.maxIntegrationAttempts}`, 'info');
            
            if (!this.integrationInterval) {
                this.integrationInterval = setInterval(() => {
                    this.retryIntegration();
                }, 1000);
            }
        } else {
            this.stopIntegrationRetries();
            this.debugLog('⚠️ Max integration attempts reached - manual reconnection may be needed', 'warning');
        }
        
        return false;
    }
    
    retryIntegration() {
        if (typeof window.reconnectAudioChainWithVolumeControl === 'function') {
            const success = window.reconnectAudioChainWithVolumeControl();
            
            if (success) {
                this.debugLog('🔗 Volume control integrated (retry successful)', 'success');
                this.stopIntegrationRetries();
            } else if (this.integrationAttempts >= this.maxIntegrationAttempts) {
                this.stopIntegrationRetries();
            } else {
                this.integrationAttempts++;
            }
        }
    }
    
    stopIntegrationRetries() {
        if (this.integrationInterval) {
            clearInterval(this.integrationInterval);
            this.integrationInterval = null;
        }
    }
    
    /**
     * ✅ PUBLIC: Force manual reconnection
     */
    forceReconnect() {
        if (!this.isAudioContextInitialized) {
            this.debugLog('❌ Cannot reconnect - nodes not initialized', 'error');
            return false;
        }
        
        if (typeof window.reconnectAudioChainWithVolumeControl === 'function') {
            const success = window.reconnectAudioChainWithVolumeControl();
            if (success) {
                this.debugLog('🔗 Manual reconnection successful', 'success');
                return true;
            }
        }
        
        this.debugLog('❌ Manual reconnection failed', 'error');
        return false;
    }
    
    applyVolume(volume, smooth = false, trackAnalysis = null) {
        let normalizationMultiplier = 1.0;
        
        if (this.normalizationEnabled && trackAnalysis && trackAnalysis.loudness) {
            const trackLoudness = trackAnalysis.loudness;
            normalizationMultiplier = this.targetLoudness / Math.max(0.1, trackLoudness);
            normalizationMultiplier = Math.max(0.5, Math.min(2.0, normalizationMultiplier));
        }

        if (this.isAudioContextInitialized && this.gainNode && this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
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
            this.player.volume = Math.min(1.0, volume * normalizationMultiplier);
        }
    }
    
    setupEventListeners() {
        this.volumeSlider.addEventListener('input', (e) => {
            const newVolume = parseFloat(e.target.value);
            this.setVolume(newVolume, true, true);
        });
        
        this.volumeSlider.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newVolume = Math.max(0, Math.min(1, this.baseVolume + delta));
            this.setVolume(newVolume, false, true);
        });
        
        this.volumeIcon.addEventListener('click', () => {
            this.toggleMute();
        });
        
        this.volumeIcon.addEventListener('dblclick', () => {
            this.setVolume(1, true);
        });
        
        this.volumeIcon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showVolumeMenu(e.clientX, e.clientY);
        });
        
        this.player.addEventListener('play', () => this.handlePlayEvent());
        this.player.addEventListener('pause', () => this.handlePauseEvent());
        this.player.addEventListener('ended', () => this.handlePauseEvent());
        
        this.player.addEventListener('volumechange', () => {
            this.updateUI();
        });
    }
    
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
            this.debugLog(`Failed to load settings: ${err.message}`, 'error');
        }
    }
    
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
                this.debugLog(`Failed to save settings: ${err.message}`, 'error');
            }
        }, 500);
    }
    
    updateUI() {
        const effectiveVolume = this.getEffectiveVolume();
        const displayVolume = Math.round(this.baseVolume * 100);
        
        let displayText = `${displayVolume}%`;
        if (this.boostEnabled && this.boostAmount > 1) {
            const effectivePercent = Math.round(effectiveVolume * 100);
            displayText = `${displayVolume}% (${effectivePercent}%)`;
        }
        this.volumePercentage.textContent = displayText;
        
        this.volumeSlider.value = this.baseVolume;
        if (this.volumeSlider.style.setProperty) {
            this.volumeSlider.style.setProperty('--volume-percent', `${displayVolume}%`);
        }
        
        if (this.isMutedState || this.baseVolume === 0) {
            this.volumeIcon.textContent = '🔇';
        } else if (this.baseVolume < 0.3) {
            this.volumeIcon.textContent = '🔈';
        } else if (this.baseVolume < 0.7) {
            this.volumeIcon.textContent = '🔉';
        } else {
            this.volumeIcon.textContent = '🔊';
        }
        
        if (this.boostEnabled && this.boostAmount > 1) {
            this.volumeIcon.style.color = '#ffc107';
            this.volumeIcon.title = `Volume Boost Active (${Math.round(this.boostAmount * 100)}%)`;
        } else {
            this.volumeIcon.style.color = '';
            this.volumeIcon.title = 'Volume Control';
        }
    }
    
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
    
    toggleMute() {
        if (this.isMutedState) {
            this.isMutedState = false;
            this.player.muted = false;
            this.setVolume(this.lastVolume, false);
            this.debugLog('🔊 Unmuted', 'info');
        } else {
            this.lastVolume = this.baseVolume > 0 ? this.baseVolume : 0.5;
            this.isMutedState = true;
            this.player.muted = true;
            this.debugLog('🔇 Muted', 'info');
        }
        this.updateUI();
    }
    
    handlePlayEvent() {
        if (!this.fadeEnabled || this.isFading) return;
        
        const targetVolume = this.baseVolume;
        
        if (this.volumeBeforeFade !== null) {
            this.baseVolume = this.volumeBeforeFade;
            this.volumeBeforeFade = null;
        }
        
        this.isFading = true;
        
        this.fadeToVolume(0, targetVolume, this.fadeInDuration, () => {
            this.isFading = false;
            this.baseVolume = targetVolume;
            this.volumeSlider.value = targetVolume;
            this.updateUI();
        });
    }
    
    handlePauseEvent() {
        if (!this.fadeEnabled || this.isFading) return;
        if (this.baseVolume < 0.1) return;
        
        this.isFading = true;
        this.volumeBeforeFade = this.baseVolume;
        const currentVolume = this.baseVolume;
        
        this.fadeToVolume(currentVolume, 0, this.fadeOutDuration, () => {
            this.isFading = false;
        });
    }
    
    stopFade() {
        if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
        }
        
        if (this.isAudioContextInitialized && this.gainNode && this.audioContext) {
            const now = this.audioContext.currentTime;
            this.gainNode.gain.cancelScheduledValues(now);
        }
        
        this.isFading = false;
        this.volumeBeforeFade = null;
    }
    
    fadeToVolume(startVolume, targetVolume, duration, callback) {
        this.stopFade();
        
        const startTime = Date.now();
        const volumeDelta = targetVolume - startVolume;
        
        if (this.isAudioContextInitialized && this.gainNode && this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const now = this.audioContext.currentTime;
            const boostMultiplier = this.boostEnabled ? this.boostAmount : 1.0;
            
            try {
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(startVolume * boostMultiplier, now);
                this.gainNode.gain.linearRampToValueAtTime(targetVolume * boostMultiplier, now + duration);
            } catch (e) {
                this.gainNode.gain.value = startVolume * boostMultiplier;
            }
            
            let currentDisplayVolume = startVolume;
            this.fadeInterval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                currentDisplayVolume = startVolume + (volumeDelta * progress);
                this.volumeSlider.value = currentDisplayVolume;
                
                if (progress >= 1) {
                    clearInterval(this.fadeInterval);
                    this.fadeInterval = null;
                    if (callback) callback();
                }
            }, 50);
        } else {
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
    
    setBoost(enabled, amount = 1.5) {
        this.boostEnabled = enabled;
        this.boostAmount = Math.max(1.0, Math.min(3.0, amount));
        
        if (enabled && !this.isAudioContextInitialized) {
            const success = this.initAudioNodes();
            if (success) {
                this.attemptChainIntegration();
            }
        }
        
        this.applyVolume(this.baseVolume, true);
        this.updateUI();
        this.debounceSaveSettings();
        
        const status = enabled ? 'ON' : 'OFF';
        const percent = Math.round(this.boostAmount * 100);
        this.debugLog(`🎚️ Volume boost: ${status} (${percent}%)`, 'info');
    }
    
    setFade(enabled) {
        this.fadeEnabled = enabled;
        
        if (!enabled && this.isFading) {
            this.stopFade();
            if (this.volumeBeforeFade !== null) {
                this.setVolume(this.volumeBeforeFade, false);
                this.volumeBeforeFade = null;
            }
        }
        
        this.debounceSaveSettings();
        this.debugLog(`🎵 Smart fade: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }
    
    setNormalization(enabled) {
        this.normalizationEnabled = enabled;
        this.applyVolume(this.baseVolume, true);
        this.debounceSaveSettings();
        this.debugLog(`⚖️ Smart Normalization: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }
    
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
            this.debugLog(`🎚️ Applied preset: ${preset}`, 'info');
        }
    }
    
    rememberTrackVolume(trackId, volume) {
        if (!trackId) return;
        this.trackVolumes.set(trackId, volume);
        this.saveTrackVolumes();
    }
    
    applyTrackVolume(trackId) {
        if (!trackId || !this.trackVolumes.has(trackId)) return false;
        
        const savedVolume = this.trackVolumes.get(trackId);
        this.setVolume(savedVolume, false, true);
        this.debugLog(`📌 Applied saved volume: ${Math.round(savedVolume * 100)}%`, 'info');
        return true;
    }
    
    saveTrackVolumes() {
        try {
            const data = Array.from(this.trackVolumes.entries());
            localStorage.setItem('volumeTrackMemory', JSON.stringify(data));
        } catch (err) {
            this.debugLog(`Failed to save track volumes: ${err.message}`, 'error');
        }
    }
    
    loadTrackVolumes() {
        try {
            const data = localStorage.getItem('volumeTrackMemory');
            if (data) {
                const entries = JSON.parse(data);
                this.trackVolumes = new Map(entries);
                this.debugLog(`📚 Loaded ${this.trackVolumes.size} track memories`, 'info');
            }
        } catch (err) {
            this.debugLog(`Failed to load track volumes: ${err.message}`, 'error');
        }
    }
    
    addToHistory(volume) {
        this.volumeHistory = this.volumeHistory.slice(0, this.historyIndex + 1);
        this.volumeHistory.push(volume);
        this.historyIndex = this.volumeHistory.length - 1;
        
        if (this.volumeHistory.length > this.maxHistorySize) {
            this.volumeHistory.shift();
            this.historyIndex--;
        }
    }
    
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
    
    showVolumeMenu(x, y) {
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
            },
            { 
                label: `⚖️ Normalize: ${this.normalizationEnabled ? 'ON ✓' : 'OFF'}`, 
                action: () => this.setNormalization(!this.normalizationEnabled) 
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
        
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }
    
    getEffectiveVolume() {
        return Math.min(1.0, this.baseVolume * (this.boostEnabled ? this.boostAmount : 1.0));
    }
    
    increaseVolume(delta = 0.1) {
        const newVolume = Math.min(1, this.baseVolume + delta);
        this.setVolume(newVolume, true, true);
    }
    
    decreaseVolume(delta = 0.1) {
        const newVolume = Math.max(0, this.baseVolume - delta);
        this.setVolume(newVolume, true, true);
    }
    
    getVolume() {
        return this.baseVolume;
    }
    
    isMuted() {
        return this.isMutedState;
    }
    
    isBoostEnabled() {
        return this.boostEnabled;
    }
    
    getBoostAmount() {
        return this.boostAmount;
    }
    
    destroy() {
        this.stopFade();
        this.stopIntegrationRetries();
        
        if (this.volumeSaveTimeout) {
            clearTimeout(this.volumeSaveTimeout);
        }
        
        if (this.gainNode) {
            try {
                this.gainNode.disconnect();
            } catch (e) {}
        }
        
        if (this.compressor) {
            try {
                this.compressor.disconnect();
            } catch (e) {}
        }
        
        if (this.makeupGain) {
            try {
                this.makeupGain.disconnect();
            } catch (e) {}
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        this.debugLog('🔇 Volume control destroyed', 'info');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = VolumeControl;
}
