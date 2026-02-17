/* ============================================
   VOLUME CONTROL v3.0
   Auto-integrating, resource-safe, optimized
   ============================================ */

class VolumeControl {

    constructor(player, debugLog) {
        this._log = debugLog || (() => {});
        this.player = player;
        
        // Core state
        this.baseVolume = 1;
        this.lastVolume = 1;
        this.isMuted = false;
        
        // Features
        this.boostEnabled = false;
        this.boostAmount = 1.5;
        this.normalizationEnabled = true;
        this.targetLoudness = 0.7;
        this.fadeEnabled = true;
        this.fadeInDuration = 0.5;
        this.fadeOutDuration = 0.3;
        
        // Audio nodes
        this.gainNode = null;
        this.compressor = null;
        this.makeupGain = null;
        this.audioContext = null;
        this.isAudioContextReady = false;
        
        // State
        this.isFading = false;
        this.volumeBeforeFade = null;
        this.trackVolumes = new Map();
        this.volumeHistory = [];
        this.historyIndex = -1;
        this.maxHistorySize = 20;
        
        // Resource tracking
        this._resources = {
            intervals: new Set(),
            timeouts: new Set(),
            listeners: [],
            menuCleanup: null,
        };
        
        // Debounce timers
        this._saveTimer = null;
        this._wheelTimer = null;
        
        // Integration
        this._integrationRetries = 0;
        this._maxRetries = 5;
        this._retryInterval = null;
        
        // DOM refs
        this._dom = {
            slider: document.getElementById('volume-slider'),
            icon: document.getElementById('volume-icon'),
            percent: document.getElementById('volume-percentage'),
        };
        
        if (!this._dom.slider || !this._dom.icon || !this._dom.percent) {
            console.error('❌ Volume control elements missing');
            return;
        }
        
        this._init();
    }

    // ─── Initialization ───────────────────────────────────────────────────────

    _init() {
        this._loadSettings();
        this.applyVolume(this.baseVolume);
        this._dom.slider.value = this.baseVolume;
        this._updateUI();
        this._bindEvents();
        this._loadTrackMemory();
        this._setupAudioInit();
        
        this._log('✅ Volume control initialized', 'success');
    }

    _setupAudioInit() {
        const initHandler = () => {
            if (!this.isAudioContextReady) {
                const success = this._initAudioNodes();
                if (success) this._tryIntegration();
            }
        };
        
        // Try on user interaction
        ['click', 'keydown', 'touchstart'].forEach(event => {
            const listener = () => {
                initHandler();
                document.removeEventListener(event, listener);
            };
            document.addEventListener(event, listener);
            this._resources.listeners.push({ element: document, event, handler: listener });
        });
        
        // Try on player play
        const playListener = () => {
            initHandler();
            this.player.removeEventListener('play', playListener);
        };
        this.player.addEventListener('play', playListener);
        this._resources.listeners.push({ element: this.player, event: 'play', handler: playListener });
        
        // Try on audioContextReady event
        const ctxListener = () => {
            initHandler();
            document.removeEventListener('audioContextReady', ctxListener);
        };
        document.addEventListener('audioContextReady', ctxListener);
        this._resources.listeners.push({ element: document, event: 'audioContextReady', handler: ctxListener });
    }

    // ─── Audio Node Creation ──────────────────────────────────────────────────

    _initAudioNodes() {
        if (this.isAudioContextReady) return true;
        
        try {
            // Get global audio context
            this.audioContext = window.audioContext || window.sharedAudioContext;
            
            if (!this.audioContext) {
                this._log('⏳ AudioContext not ready', 'warning');
                return false;
            }
            
            // Resume if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
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
            
            // Expose globally (will be cleaned up in destroy)
            window.volumeGainNode = this.gainNode;
            window.volumeCompressor = this.compressor;
            window.volumeMakeupGain = this.makeupGain;
            
            this.isAudioContextReady = true;
            this._log('✅ Volume nodes created', 'success');
            return true;
            
        } catch (err) {
            this._log(`❌ Node creation failed: ${err.message}`, 'error');
            return false;
        }
    }

    // ─── Chain Integration ────────────────────────────────────────────────────

    _tryIntegration() {
        if (typeof window.reconnectAudioChainWithVolumeControl === 'function') {
            const success = window.reconnectAudioChainWithVolumeControl();
            
            if (success) {
                this._log('🔗 Integrated into audio chain', 'success');
                this._stopRetries();
                return true;
            }
        }
        
        // Schedule retries
        if (this._integrationRetries < this._maxRetries && !this._retryInterval) {
            this._retryInterval = setInterval(() => {
                this._integrationRetries++;
                
                if (typeof window.reconnectAudioChainWithVolumeControl === 'function') {
                    const success = window.reconnectAudioChainWithVolumeControl();
                    if (success) {
                        this._log('🔗 Integrated (retry)', 'success');
                        this._stopRetries();
                    }
                }
                
                if (this._integrationRetries >= this._maxRetries) {
                    this._log('⚠️ Max integration attempts reached', 'warning');
                    this._stopRetries();
                }
            }, 1000);
            
            this._resources.intervals.add(this._retryInterval);
        }
        
        return false;
    }

    _stopRetries() {
        if (this._retryInterval) {
            clearInterval(this._retryInterval);
            this._resources.intervals.delete(this._retryInterval);
            this._retryInterval = null;
        }
    }

    /**
     * Force manual reconnection (public API)
     */
    forceReconnect() {
        if (!this.isAudioContextReady) {
            this._log('❌ Cannot reconnect - nodes not ready', 'error');
            return false;
        }
        
        if (typeof window.reconnectAudioChainWithVolumeControl === 'function') {
            const success = window.reconnectAudioChainWithVolumeControl();
            if (success) {
                this._log('🔗 Manual reconnection successful', 'success');
                return true;
            }
        }
        
        this._log('❌ Manual reconnection failed', 'error');
        return false;
    }

    /**
     * Reset integration attempts (for new playlist loads)
     */
    resetIntegration() {
        this._integrationRetries = 0;
        this._stopRetries();
    }

    // ─── Volume Control ───────────────────────────────────────────────────────

    applyVolume(volume, smooth = false, trackAnalysis = null) {
        let normMultiplier = 1.0;
        
        // Apply normalization if enabled and analysis available
        if (this.normalizationEnabled && trackAnalysis?.loudness) {
            normMultiplier = this.targetLoudness / Math.max(0.1, trackAnalysis.loudness);
            normMultiplier = Math.max(0.5, Math.min(2.0, normMultiplier));
        }

        // Apply through audio nodes if available
        if (this.isAudioContextReady && this.gainNode && this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
            
            const boostMult = this.boostEnabled ? this.boostAmount : 1.0;
            const targetGain = volume * boostMult * normMultiplier;
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
            // Fallback to HTML5 audio
            this.player.volume = Math.min(1.0, volume * normMultiplier);
        }
    }

    setVolume(volume, addToHistory = true, smooth = false, trackAnalysis = null) {
        volume = Math.max(0, Math.min(1, volume));
        
        if (this.isFading) this._stopFade();
        
        if (addToHistory && volume !== this.baseVolume) {
            this._addToHistory(volume);
        }
        
        this.baseVolume = volume;
        this._dom.slider.value = volume;
        
        this.applyVolume(volume, smooth, trackAnalysis);
        
        if (this.isMuted && volume > 0) {
            this.isMuted = false;
            this.player.muted = false;
        }
        
        this._updateUI();
        this._debounceSave();
    }

    toggleMute() {
        if (this.isMuted) {
            this.isMuted = false;
            this.player.muted = false;
            this.setVolume(this.lastVolume, false);
            this._log('🔊 Unmuted', 'info');
        } else {
            this.lastVolume = this.baseVolume > 0 ? this.baseVolume : 0.5;
            this.isMuted = true;
            this.player.muted = true;
            this._log('🔇 Muted', 'info');
        }
        this._updateUI();
    }

    increaseVolume(delta = 0.1) {
        this.setVolume(Math.min(1, this.baseVolume + delta), true, true);
    }

    decreaseVolume(delta = 0.1) {
        this.setVolume(Math.max(0, this.baseVolume - delta), true, true);
    }

    // ─── Fading ───────────────────────────────────────────────────────────────

    _handlePlayEvent() {
        if (!this.fadeEnabled || this.isFading) return;
        
        const targetVolume = this.baseVolume;
        
        if (this.volumeBeforeFade !== null) {
            this.baseVolume = this.volumeBeforeFade;
            this.volumeBeforeFade = null;
        }
        
        this.isFading = true;
        
        this._fadeToVolume(0, targetVolume, this.fadeInDuration, () => {
            this.isFading = false;
            this.baseVolume = targetVolume;
            this._dom.slider.value = targetVolume;
            this._updateUI();
        });
    }

    _handlePauseEvent() {
        if (!this.fadeEnabled || this.isFading || this.baseVolume < 0.1) return;
        
        this.isFading = true;
        this.volumeBeforeFade = this.baseVolume;
        
        this._fadeToVolume(this.baseVolume, 0, this.fadeOutDuration, () => {
            this.isFading = false;
        });
    }

    _stopFade() {
        // Clear any fade intervals
        this._resources.intervals.forEach(id => {
            // Check if it's a fade interval by seeing if clearing it stops the fade
            try { clearInterval(id); } catch (e) {}
        });
        this._resources.intervals.clear();
        
        // Cancel scheduled values
        if (this.isAudioContextReady && this.gainNode && this.audioContext) {
            try {
                this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            } catch (e) {}
        }
        
        this.isFading = false;
        this.volumeBeforeFade = null;
    }

    _fadeToVolume(startVolume, targetVolume, duration, callback) {
        this._stopFade();
        
        const startTime = Date.now();
        const volumeDelta = targetVolume - startVolume;
        
        if (this.isAudioContextReady && this.gainNode && this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
            
            const now = this.audioContext.currentTime;
            const boostMult = this.boostEnabled ? this.boostAmount : 1.0;
            
            try {
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(startVolume * boostMult, now);
                this.gainNode.gain.linearRampToValueAtTime(targetVolume * boostMult, now + duration);
            } catch (e) {
                this.gainNode.gain.value = startVolume * boostMult;
            }
            
            const interval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                this._dom.slider.value = startVolume + (volumeDelta * progress);
                
                if (progress >= 1) {
                    clearInterval(interval);
                    this._resources.intervals.delete(interval);
                    if (callback) callback();
                }
            }, 50);
            
            this._resources.intervals.add(interval);
        } else {
            const interval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                const currentVolume = startVolume + (volumeDelta * progress);
                this.applyVolume(currentVolume);
                this._dom.slider.value = currentVolume;
                
                if (progress >= 1) {
                    clearInterval(interval);
                    this._resources.intervals.delete(interval);
                    if (callback) callback();
                }
            }, 50);
            
            this._resources.intervals.add(interval);
        }
    }

    // ─── Feature Toggles ──────────────────────────────────────────────────────

    setBoost(enabled, amount = 1.5) {
        this.boostEnabled = enabled;
        this.boostAmount = Math.max(1.0, Math.min(3.0, amount));
        
        if (enabled && !this.isAudioContextReady) {
            const success = this._initAudioNodes();
            if (success) this._tryIntegration();
        }
        
        this.applyVolume(this.baseVolume, true);
        this._updateUI();
        this._debounceSave();
        
        const percent = Math.round(this.boostAmount * 100);
        this._log(`🎚️ Volume boost: ${enabled ? 'ON' : 'OFF'} (${percent}%)`, 'info');
    }

    setFade(enabled) {
        this.fadeEnabled = enabled;
        
        if (!enabled && this.isFading) {
            this._stopFade();
            if (this.volumeBeforeFade !== null) {
                this.setVolume(this.volumeBeforeFade, false);
                this.volumeBeforeFade = null;
            }
        }
        
        this._debounceSave();
        this._log(`🎵 Fade: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }

    setNormalization(enabled) {
        this.normalizationEnabled = enabled;
        this.applyVolume(this.baseVolume, true);
        this._debounceSave();
        this._log(`⚖️ Normalization: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }

    applyPreset(preset) {
        const presets = {
            silent: 0,
            quiet: 0.3,
            normal: 0.7,
            loud: 1.0,
            nightMode: 0.4,
            cinema: 0.8,
        };
        
        if (preset in presets) {
            this.setVolume(presets[preset], true, true);
            this._log(`🎚️ Preset: ${preset}`, 'info');
        }
    }

    // ─── Track Memory ─────────────────────────────────────────────────────────

    rememberTrackVolume(trackId, volume) {
        if (!trackId) return;
        this.trackVolumes.set(trackId, volume);
        this._saveTrackMemory();
    }

    applyTrackVolume(trackId) {
        if (!trackId || !this.trackVolumes.has(trackId)) return false;
        
        const savedVolume = this.trackVolumes.get(trackId);
        this.setVolume(savedVolume, false, true);
        this._log(`📌 Restored volume: ${Math.round(savedVolume * 100)}%`, 'info');
        return true;
    }

    // ─── History (Undo/Redo) ──────────────────────────────────────────────────

    _addToHistory(volume) {
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
            this._log(`↩️ Undo: ${Math.round(volume * 100)}%`, 'info');
            return true;
        }
        return false;
    }

    redo() {
        if (this.historyIndex < this.volumeHistory.length - 1) {
            this.historyIndex++;
            const volume = this.volumeHistory[this.historyIndex];
            this.setVolume(volume, false, true);
            this._log(`↪️ Redo: ${Math.round(volume * 100)}%`, 'info');
            return true;
        }
        return false;
    }

    // ─── UI ───────────────────────────────────────────────────────────────────

    _updateUI() {
        if (!this._dom.slider || !this._dom.icon || !this._dom.percent) return;
        
        const effectiveVolume = this._getEffectiveVolume();
        const displayVolume = Math.round(this.baseVolume * 100);
        
        let displayText = `${displayVolume}%`;
        if (this.boostEnabled && this.boostAmount > 1) {
            const effectivePercent = Math.round(effectiveVolume * 100);
            displayText = `${displayVolume}% (${effectivePercent}%)`;
        }
        this._dom.percent.textContent = displayText;
        
        this._dom.slider.value = this.baseVolume;
        if (this._dom.slider.style.setProperty) {
            this._dom.slider.style.setProperty('--volume-percent', `${displayVolume}%`);
        }
        
        // Update icon
        if (this.isMuted || this.baseVolume === 0) {
            this._dom.icon.textContent = '🔇';
        } else if (this.baseVolume < 0.3) {
            this._dom.icon.textContent = '🔈';
        } else if (this.baseVolume < 0.7) {
            this._dom.icon.textContent = '🔉';
        } else {
            this._dom.icon.textContent = '🔊';
        }
        
        // Boost indicator
        if (this.boostEnabled && this.boostAmount > 1) {
            this._dom.icon.style.color = '#ffc107';
            this._dom.icon.title = `Volume Boost Active (${Math.round(this.boostAmount * 100)}%)`;
        } else {
            this._dom.icon.style.color = '';
            this._dom.icon.title = 'Volume Control';
        }
    }

    _showVolumeMenu(x, y) {
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        const options = [
            { label: '🔇 Silent (0%)', action: () => this.applyPreset('silent') },
            { label: '🔉 Quiet (30%)', action: () => this.applyPreset('quiet') },
            { label: '🔊 Normal (70%)', action: () => this.applyPreset('normal') },
            { label: '📢 Loud (100%)', action: () => this.applyPreset('loud') },
            { separator: true },
            { label: '🌙 Night Mode (40%)', action: () => this.applyPreset('nightMode') },
            { label: '🎬 Cinema (80%)', action: () => this.applyPreset('cinema') },
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
            },
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
        
        // Keep within viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }
        
        // Close on outside click
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
            this._resources.menuCleanup = closeHandler;
        }, 10);
    }

    // ─── Event Binding ────────────────────────────────────────────────────────

    _bindEvents() {
        const wire = (el, event, handler) => {
            if (!el) return;
            el.addEventListener(event, handler);
            this._resources.listeners.push({ element: el, event, handler });
        };
        
        // Slider
        wire(this._dom.slider, 'input', e => {
            const newVolume = parseFloat(e.target.value);
            this.setVolume(newVolume, true, true);
        });
        
        // Wheel (debounced)
        wire(this._dom.slider, 'wheel', e => {
            e.preventDefault();
            
            clearTimeout(this._wheelTimer);
            this._wheelTimer = setTimeout(() => {
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                const newVolume = Math.max(0, Math.min(1, this.baseVolume + delta));
                this.setVolume(newVolume, false, true);
            }, 50);
        });
        
        // Icon clicks
        wire(this._dom.icon, 'click', () => this.toggleMute());
        wire(this._dom.icon, 'dblclick', () => this.setVolume(1, true));
        wire(this._dom.icon, 'contextmenu', e => {
            e.preventDefault();
            this._showVolumeMenu(e.clientX, e.clientY);
        });
        
        // Player events
        wire(this.player, 'play', () => this._handlePlayEvent());
        wire(this.player, 'pause', () => this._handlePauseEvent());
        wire(this.player, 'ended', () => this._handlePauseEvent());
        wire(this.player, 'volumechange', () => this._updateUI());
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    _loadSettings() {
        try {
            const vol = localStorage.getItem('playerVolume');
            if (vol) {
                this.baseVolume = Math.max(0, Math.min(1, parseFloat(vol)));
                this.lastVolume = this.baseVolume;
            }
            
            const boost = localStorage.getItem('volumeBoostEnabled');
            if (boost !== null) this.boostEnabled = boost === 'true';
            
            const boostAmt = localStorage.getItem('volumeBoostAmount');
            if (boostAmt) this.boostAmount = Math.max(1.0, Math.min(3.0, parseFloat(boostAmt)));
            
            const norm = localStorage.getItem('volumeNormalizationEnabled');
            if (norm !== null) this.normalizationEnabled = norm === 'true';
            
            const fade = localStorage.getItem('volumeFadeEnabled');
            if (fade !== null) this.fadeEnabled = fade === 'true';
        } catch (err) {
            this._log(`Failed to load settings: ${err.message}`, 'error');
        }
    }

    _debounceSave() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            try {
                localStorage.setItem('playerVolume', this.baseVolume.toString());
                localStorage.setItem('volumeBoostEnabled', this.boostEnabled.toString());
                localStorage.setItem('volumeBoostAmount', this.boostAmount.toString());
                localStorage.setItem('volumeNormalizationEnabled', this.normalizationEnabled.toString());
                localStorage.setItem('volumeFadeEnabled', this.fadeEnabled.toString());
            } catch (err) {
                this._log(`Failed to save settings: ${err.message}`, 'error');
            }
        }, 500);
    }

    _loadTrackMemory() {
        try {
            const data = localStorage.getItem('volumeTrackMemory');
            if (data) {
                const entries = JSON.parse(data);
                this.trackVolumes = new Map(entries);
                this._log(`📚 Loaded ${this.trackVolumes.size} track volumes`, 'info');
            }
        } catch (err) {
            this._log(`Failed to load track memory: ${err.message}`, 'error');
        }
    }

    _saveTrackMemory() {
        try {
            const data = Array.from(this.trackVolumes.entries());
            localStorage.setItem('volumeTrackMemory', JSON.stringify(data));
        } catch (err) {
            this._log(`Failed to save track memory: ${err.message}`, 'error');
        }
    }

    // ─── Public Getters ───────────────────────────────────────────────────────

    getVolume() {
        return this.baseVolume;
    }

    isMutedState() {
        return this.isMuted;
    }

    isBoostEnabled() {
        return this.boostEnabled;
    }

    getBoostAmount() {
        return this.boostAmount;
    }

    _getEffectiveVolume() {
        return Math.min(1.0, this.baseVolume * (this.boostEnabled ? this.boostAmount : 1.0));
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    destroy() {
        this._log('🧹 Destroying volume control...', 'info');
        
        // Stop any active fades
        this._stopFade();
        
        // Stop integration retries
        this._stopRetries();
        
        // Clear timers
        clearTimeout(this._saveTimer);
        clearTimeout(this._wheelTimer);
        
        // Clear all intervals
        this._resources.intervals.forEach(id => clearInterval(id));
        this._resources.intervals.clear();
        
        // Clear all timeouts
        this._resources.timeouts.forEach(id => clearTimeout(id));
        this._resources.timeouts.clear();
        
        // Remove all event listeners
        this._resources.listeners.forEach(({ element, event, handler }) => {
            try {
                element.removeEventListener(event, handler);
            } catch (e) {}
        });
        this._resources.listeners = [];
        
        // Remove menu cleanup handler
        if (this._resources.menuCleanup) {
            document.removeEventListener('click', this._resources.menuCleanup);
        }
        
        // Remove any open menu
        const menu = document.getElementById('volume-context-menu');
        if (menu) menu.remove();
        
        // Disconnect audio nodes
        if (this.gainNode) {
            try { this.gainNode.disconnect(); } catch (e) {}
        }
        if (this.compressor) {
            try { this.compressor.disconnect(); } catch (e) {}
        }
        if (this.makeupGain) {
            try { this.makeupGain.disconnect(); } catch (e) {}
        }
        
        // Clean up global references
        if (window.volumeGainNode === this.gainNode) delete window.volumeGainNode;
        if (window.volumeCompressor === this.compressor) delete window.volumeCompressor;
        if (window.volumeMakeupGain === this.makeupGain) delete window.volumeMakeupGain;
        
        // Clear maps and arrays
        this.trackVolumes.clear();
        this.volumeHistory = [];
        
        // Don't close the audio context if it's shared
        // The main app will handle that
        
        this._log('✅ Volume control destroyed', 'success');
    }
}

// ─── Module Export ────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VolumeControl;
}
