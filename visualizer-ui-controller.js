/* ============================================
   Visualizer UI Controller
   Manages all visualizer UI interactions and fullscreen mode
   ============================================ */

class VisualizerUIController {
    constructor(visualizerManager, debugLog) {
        this.manager = visualizerManager;
        this.debugLog = debugLog;
        
        // State
        this.fullscreenActive = false;
        this.controlsHidden = false;
        this.hideTimer = null;
        
        // Fullscreen helper for cross-browser support
        this.fullscreenHelper = typeof FullscreenHelper !== 'undefined' ? new FullscreenHelper() : null;
        
        // UI Elements (will be set during init)
        this.elements = {
            // Fullscreen toggle button
            toggle: null,
            
            // Fullscreen container and canvas
            container: null,
            canvas: null,
            
            // Control buttons
            modeBtn: null,
            prevBtn: null,
            playPauseBtn: null,
            nextBtn: null,
            closeBtn: null,
            forceHideBtn: null,
            
            // Display elements
            title: null,
            artist: null,
            currentTime: null,
            duration: null
        };
        
        // Callbacks (to be set by script.js)
        this.callbacks = {
            onPrevious: null,
            onNext: null,
            onPlayPause: null,
            getTrackInfo: null,
            getCurrentTime: null,
            getDuration: null,
            isPaused: null,
            getAudioData: null
        };
        
        this.debugLog('🎨 VisualizerUIController created', 'success');
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    
    init(elementIds) {
        this.debugLog('Initializing visualizer UI controller...', 'info');
        
        // Get all DOM elements
        this.elements.toggle = document.getElementById(elementIds.toggle);
        this.elements.container = document.getElementById(elementIds.container);
        this.elements.canvas = document.getElementById(elementIds.canvas);
        this.elements.modeBtn = document.getElementById(elementIds.modeBtn);
        this.elements.prevBtn = document.getElementById(elementIds.prevBtn);
        this.elements.playPauseBtn = document.getElementById(elementIds.playPauseBtn);
        this.elements.nextBtn = document.getElementById(elementIds.nextBtn);
        this.elements.closeBtn = document.getElementById(elementIds.closeBtn);
        this.elements.title = document.querySelector(elementIds.title);
        this.elements.artist = document.querySelector(elementIds.artist);
        this.elements.currentTime = document.getElementById(elementIds.currentTime);
        this.elements.duration = document.getElementById(elementIds.duration);
        
        // Create force hide button
        this.createForceHideButton();
        
        // Attach event listeners
        this.attachEventListeners();
        
        this.debugLog('✅ Visualizer UI controller initialized', 'success');
        return true;
    }
    
    createForceHideButton() {
        this.elements.forceHideBtn = document.createElement('button');
        this.elements.forceHideBtn.id = 'viz-force-hide-btn';
        this.elements.forceHideBtn.innerHTML = '👁️';
        this.elements.forceHideBtn.title = 'Toggle controls visibility';
        this.elements.forceHideBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            font-size: 24px;
            cursor: pointer;
            z-index: 10002;
            transition: opacity 0.3s, transform 0.2s;
            backdrop-filter: blur(10px);
        `;
        
        this.elements.forceHideBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleControlsVisibility();
        };
        
        if (this.elements.container) {
            this.elements.container.appendChild(this.elements.forceHideBtn);
        }
    }
    
    attachEventListeners() {
        // Toggle fullscreen
        if (this.elements.toggle) {
            this.elements.toggle.onclick = () => this.toggleFullscreen();
        }
        
        // Mode switching
        if (this.elements.modeBtn) {
            this.elements.modeBtn.onclick = () => this.cycleMode();
        }
        
        // Playback controls
        if (this.elements.prevBtn) {
            this.elements.prevBtn.onclick = () => {
                if (this.callbacks.onPrevious) this.callbacks.onPrevious();
                this.updateTrackInfo();
            };
        }
        
        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.onclick = () => {
                if (this.callbacks.onPlayPause) this.callbacks.onPlayPause();
            };
        }
        
        if (this.elements.nextBtn) {
            this.elements.nextBtn.onclick = () => {
                if (this.callbacks.onNext) this.callbacks.onNext();
                this.updateTrackInfo();
            };
        }
        
        if (this.elements.closeBtn) {
            this.elements.closeBtn.onclick = () => this.exitFullscreen();
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.fullscreenActive) return;
            
            if (e.key === 'Escape') {
                e.preventDefault();
                this.exitFullscreen();
            } else if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                this.cycleMode();
            } else if (e.key === 'h' || e.key === 'H') {
                e.preventDefault();
                this.toggleControlsVisibility();
            }
        });
        
        // Global keyboard shortcut for opening
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            if (this.fullscreenActive && this.elements.canvas) {
                this.manager.resizeFullscreenCanvas();
            }
        });
    }
    
    // ============================================
    // CALLBACKS
    // ============================================
    
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
    
    // ============================================
    // FULLSCREEN CONTROL
    // ============================================
    
    toggleFullscreen() {
        if (this.fullscreenActive) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }
    
enterFullscreen() {
    if (!this.elements.container || !this.elements.canvas) {
        this.debugLog('Fullscreen elements not found', 'error');
        return;
    }
    
    this.fullscreenActive = true;
    
    // Show container
    this.elements.container.classList.remove('fullscreen-viz-hidden');
    
    // Try to use native fullscreen API with cross-browser support
    if (this.fullscreenHelper) {
        this.fullscreenHelper.requestFullscreen(this.elements.container).catch(err => {
            console.warn('Fullscreen API failed, using CSS fallback:', err);
        });
    }
    
    // Resize canvas to full window
    this.elements.canvas.width = window.innerWidth;
    this.elements.canvas.height = window.innerHeight;
    
    // ✅ FIX: Get audio data SYNCHRONOUSLY from multiple sources
    let audioData = null;
    
    // Try callback first
    if (this.callbacks.getAudioData) {
        audioData = this.callbacks.getAudioData();
    }
    
    // Fallback to global analyser
    if (!audioData && window.sharedAnalyser && window.sharedDataArray) {
        audioData = {
            analyser: window.sharedAnalyser,
            dataArray: window.sharedDataArray,
            bufferLength: window.sharedBufferLength
        };
        console.log('✅ Using shared audio data');
    }
    
    // Last resort: try to get from script.js globals
    if (!audioData && window.analyser && window.dataArray) {
        audioData = {
            analyser: window.analyser,
            dataArray: window.dataArray,
            bufferLength: window.bufferLength
        };
        console.log('✅ Using global audio data');
    }
    
    // Validate we got audio data
    if (!audioData || !audioData.analyser || !audioData.dataArray) {
        console.error('❌ Failed to get audio data for fullscreen visualizer');
        alert('Cannot start visualizer: audio system not ready. Please play a track first.');
        this.exitFullscreen();
        return;
    }
    
    console.log('✅ Audio data validated:', {
        hasAnalyser: !!audioData.analyser,
        hasDataArray: !!audioData.dataArray,
        bufferLength: audioData.bufferLength
    });
    
    // ✅ FIX: Initialize WITH audio data directly
    this.manager.initFullscreenVisualizer(
        this.elements.canvas,
        audioData.analyser,
        audioData.dataArray,
        audioData.bufferLength
    );
    
    // Start animation immediately
    this.manager.startFullscreen();
    console.log('✅ Fullscreen visualizer animation started');
    
    // Update track info
    this.updateTrackInfo();
    
    // Setup auto-hide
    this.setupAutoHide();
    
    // Update toggle button
    if (this.elements.toggle) {
        this.elements.toggle.classList.add('active');
        this.elements.toggle.textContent = '🌌 Exit Visualizer';
    }
    
    this.debugLog('Fullscreen visualizer activated', 'success');
}
    
    exitFullscreen() {
        this.fullscreenActive = false;
        
        // Exit native fullscreen if active
        if (this.fullscreenHelper && this.fullscreenHelper.isFullscreenActive()) {
            this.fullscreenHelper.exitFullscreen().catch(err => {
                console.warn('Error exiting fullscreen:', err);
            });
        }
        
        // Hide container
        if (this.elements.container) {
            this.elements.container.classList.add('fullscreen-viz-hidden');
        }
        
        // Stop visualizer
        this.manager.stopFullscreen();
        
        // Clear auto-hide timer
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        
        // Reset controls visibility
        this.controlsHidden = false;
        if (this.elements.container) {
            this.elements.container.classList.remove('controls-hidden', 'auto-hide');
        }
        
        // Update toggle button
        if (this.elements.toggle) {
            this.elements.toggle.classList.remove('active');
            this.elements.toggle.textContent = '🌌 Fullscreen Visualizer';
        }
        
        this.debugLog('Fullscreen visualizer deactivated', 'info');
    }
    
    // ============================================
    // AUTO-HIDE SYSTEM
    // ============================================
    
    setupAutoHide() {
        const resetHideTimer = () => {
            if (this.elements.container) {
                this.elements.container.classList.remove('auto-hide');
            }
            
            // If controls are manually hidden, show everything on interaction
            if (this.controlsHidden) {
                this.controlsHidden = false;
                if (this.elements.container) {
                    this.elements.container.classList.remove('controls-hidden');
                }
                if (this.elements.forceHideBtn) {
                    this.elements.forceHideBtn.style.opacity = '1';
                    this.elements.forceHideBtn.style.pointerEvents = 'all';
                }
            }
            
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
            }
            
            this.hideTimer = setTimeout(() => {
                if (this.elements.container) {
                    this.elements.container.classList.add('auto-hide');
                }
                this.hideTimer = null;
            }, 3000);
        };
        
        // Remove old listeners
        if (this.elements.container) {
            const oldMove = this.elements.container._autoHideMouseMove;
            const oldClick = this.elements.container._autoHideClick;
            const oldTouch = this.elements.container._autoHideTouchStart;
            
            if (oldMove) this.elements.container.removeEventListener('mousemove', oldMove);
            if (oldClick) this.elements.container.removeEventListener('click', oldClick);
            if (oldTouch) this.elements.container.removeEventListener('touchstart', oldTouch);
            
            // Store new listeners
            this.elements.container._autoHideMouseMove = resetHideTimer;
            this.elements.container._autoHideClick = resetHideTimer;
            this.elements.container._autoHideTouchStart = resetHideTimer;
            
            // Attach listeners
            this.elements.container.addEventListener('mousemove', resetHideTimer);
            this.elements.container.addEventListener('click', resetHideTimer);
            this.elements.container.addEventListener('touchstart', resetHideTimer);
        }
        
        // Initial call
        resetHideTimer();
    }
    
    toggleControlsVisibility() {
        this.controlsHidden = !this.controlsHidden;
        
        if (this.elements.container) {
            if (this.controlsHidden) {
                this.elements.container.classList.add('controls-hidden');
                if (this.elements.forceHideBtn) {
                    this.elements.forceHideBtn.style.opacity = '0';
                    this.elements.forceHideBtn.style.pointerEvents = 'none';
                }
            } else {
                this.elements.container.classList.remove('controls-hidden');
                if (this.elements.forceHideBtn) {
                    this.elements.forceHideBtn.style.opacity = '1';
                    this.elements.forceHideBtn.style.pointerEvents = 'all';
                }
            }
        }
    }
    
    // ============================================
    // MODE SWITCHING
    // ============================================
    
    cycleMode() {
        const modes = ['bars', 'circular', 'waveform', 'particles', 'nebula', '3dwave', 'spectrum', 'radial', 'energyflow'];
        const currentMode = this.manager.vizMode;
        const currentIndex = modes.indexOf(currentMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        
        this.manager.setVizMode(nextMode);
        
        const modeNames = {
            'bars': 'Bars',
            'circular': 'Circular',
            'waveform': 'Waveform',
            'particles': 'Particles',
            'nebula': 'Nebula',
            '3dwave': '3D Wave',
            'spectrum': 'Spectrum',
            'radial': 'Radial',
            'energyflow': 'Energy Flow'
        };
        
        if (this.elements.modeBtn) {
            this.elements.modeBtn.textContent = `🎨 Mode: ${modeNames[nextMode]}`;
        }
        
        this.debugLog(`Visualizer mode: ${modeNames[nextMode]}`, 'info');
    }
    
    // ============================================
    // TRACK INFO UPDATES
    // ============================================
    
    updateTrackInfo() {
        if (!this.fullscreenActive) return;
        
        const trackInfo = this.callbacks.getTrackInfo ? this.callbacks.getTrackInfo() : null;
        
        if (trackInfo) {
            if (this.elements.title) {
                this.elements.title.textContent = trackInfo.title || 'Unknown Track';
            }
            if (this.elements.artist) {
                this.elements.artist.textContent = trackInfo.artist || 'Unknown Artist';
            }
        } else {
            if (this.elements.title) this.elements.title.textContent = 'No track loaded';
            if (this.elements.artist) this.elements.artist.textContent = '--';
        }
        
        this.updateTimeDisplay();
    }
    
    updateTimeDisplay() {
        if (!this.fullscreenActive) return;
        
        const currentTime = this.callbacks.getCurrentTime ? this.callbacks.getCurrentTime() : 0;
        const duration = this.callbacks.getDuration ? this.callbacks.getDuration() : 0;
        
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = this.formatTime(currentTime);
        }
        if (this.elements.duration) {
            this.elements.duration.textContent = this.formatTime(duration);
        }
    }
    
    updatePlayPauseButton() {
        if (!this.fullscreenActive || !this.elements.playPauseBtn) return;
        
        const isPaused = this.callbacks.isPaused ? this.callbacks.isPaused() : true;
        this.elements.playPauseBtn.textContent = isPaused ? '▶ Play' : '⏸ Pause';
    }
    
    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${min}:${sec}`;
    }
    
    // ============================================
    // PUBLIC METHODS FOR SCRIPT.JS
    // ============================================
    
    onTrackChange() {
        this.updateTrackInfo();
    }
    
    onTimeUpdate() {
        if (this.fullscreenActive) {
            this.updateTimeDisplay();
        }
    }
    
    onPlayStateChange() {
        this.updatePlayPauseButton();
    }
    
    isActive() {
        return this.fullscreenActive;
    }
    
    // ============================================
    // CLEANUP
    // ============================================
    
    dispose() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }
        
        this.exitFullscreen();
        
        this.debugLog('VisualizerUIController disposed', 'info');
    }
}

// Export for use in script.js
window.VisualizerUIController = VisualizerUIController;
console.log('✅ VisualizerUIController loaded');