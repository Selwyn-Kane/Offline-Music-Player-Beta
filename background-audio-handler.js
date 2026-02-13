/* ============================================
   Enhanced Background Audio Handler v2.0
   Pure coordination layer - no audio creation
   ============================================ */

class EnhancedBackgroundAudioHandler {
    constructor() {
        // Core references (set by script.js)
        this.player = null;
        this.audioContext = null;
        this.playlist = null;
        this.getCurrentTrackIndex = null;
        this.onMediaAction = {};
        
        // State management
        this.state = {
            playback: 'none',
            network: navigator.onLine,
            visibility: document.visibilityState,
            wakeLock: null,
            serviceWorkerReady: false
        };
        
        // Metadata cache for performance
        this.metadataCache = new Map();
        
        // Recovery system
        this.recovery = {
            attempts: 0,
            maxAttempts: 3,
            backoffMs: 1000,
            lastError: null
        };
        
        // Bound methods
        this.boundHandlers = {
            visibilityChange: this.handleVisibilityChange.bind(this),
            beforeUnload: this.handleBeforeUnload.bind(this),
            online: this.handleOnline.bind(this),
            offline: this.handleOffline.bind(this),
            freeze: this.handleFreeze.bind(this),
            resume: this.handleResume.bind(this)
        };
        
        console.log('🎵 Enhanced Background Audio Handler v2.0 initialized');
    }
    
    // ============================================
    // INITIALIZATION
    // ============================================
    
    async init(config) {
        console.log('🚀 Initializing background audio system...');
        
        // Store references from script.js
        this.player = config.player;
        this.playlist = config.playlist;
        this.getCurrentTrackIndex = config.getCurrentTrackIndex;
        this.onMediaAction = config.onMediaAction || {};
        
        // Validate required components
        if (!this.player) {
            throw new Error('Audio player element required');
        }
        
        try {
            // Initialize in optimal order
            this.setupPlayerListeners();
            this.setupMediaSession();
            await this.registerServiceWorker();
            await this.setupWakeLock();
            this.setupInterruptionHandling();
            this.setupNetworkMonitoring();
            await this.requestPersistentStorage();
            
            console.log('✅ Background audio system ready');
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            return false;
        }
    }
    
    // ============================================
    // AUDIO CONTEXT ACCESS (read-only from script.js)
    // ============================================
    
    getAudioContext() {
        // Read-only access to script.js audio context
        return window.audioContext || null;
    }
    
    async resumeAudioContext() {
        const ctx = this.getAudioContext();
        
        if (!ctx) {
            console.warn('⚠️ AudioContext not yet created by script.js');
            return false;
        }
        
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
                console.log('✅ AudioContext resumed');
                return true;
            } catch (error) {
                console.error('❌ Failed to resume AudioContext:', error);
                this.recovery.lastError = error;
                return false;
            }
        }
        
        return true;
    }
    
    // ============================================
    // MEDIA SESSION API
    // ============================================
    
    setupMediaSession() {
        if (!('mediaSession' in navigator)) {
            console.warn('⚠️ Media Session API not supported');
            return;
        }
        
        console.log('🎮 Configuring Media Session API...');
        
        // Define action handlers
        const actions = {
            play: async () => {
                await this.resumeAudioContext();
                return this.player.play();
            },
            pause: () => this.player.pause(),
            stop: () => {
                this.player.pause();
                this.player.currentTime = 0;
            },
            previoustrack: () => this.triggerMediaAction('previous'),
            nexttrack: () => this.triggerMediaAction('next'),
            seekbackward: (details) => {
                const offset = details.seekOffset || 10;
                this.player.currentTime = Math.max(this.player.currentTime - offset, 0);
            },
            seekforward: (details) => {
                const offset = details.seekOffset || 10;
                this.player.currentTime = Math.min(
                    this.player.currentTime + offset, 
                    this.player.duration || 0
                );
            },
            seekto: (details) => {
                if (details.seekTime !== undefined) {
                    this.player.currentTime = details.seekTime;
                }
            }
        };
        
        // Register handlers with error handling
        Object.entries(actions).forEach(([action, handler]) => {
            try {
                navigator.mediaSession.setActionHandler(action, async (details) => {
                    console.log(`📱 Media Session: ${action}`);
                    
                    try {
                        const result = handler(details);
                        if (result && typeof result.catch === 'function') {
                            await result.catch(err => this.handlePlaybackError(err));
                        }
                        this.recovery.attempts = 0; // Reset on success
                    } catch (error) {
                        console.error(`❌ Media action '${action}' failed:`, error);
                        this.handlePlaybackError(error);
                    }
                });
            } catch (error) {
                console.warn(`⚠️ Could not set handler for ${action}:`, error);
            }
        });
        
        // Initialize metadata
        this.updateMediaSessionMetadata();
        
        console.log('✅ Media Session configured');
    }
    
    triggerMediaAction(action) {
        // Call handler provided by script.js
        if (this.onMediaAction[action]) {
            this.onMediaAction[action]();
        } else {
            console.warn(`⚠️ No handler for media action: ${action}`);
        }
    }
    
    updateMediaSessionMetadata(forceUpdate = false) {
        if (!('mediaSession' in navigator)) return;
        
        const trackIndex = this.getCurrentTrackIndex ? this.getCurrentTrackIndex() : -1;
        const playlist = this.playlist ? this.playlist() : [];
        
        if (trackIndex === -1 || !playlist[trackIndex]) {
            this.setDefaultMetadata();
            return;
        }
        
        const track = playlist[trackIndex];
        const cacheKey = `${track.fileName}_${trackIndex}`;
        
        // Use cached metadata unless forced update
        if (!forceUpdate && this.metadataCache.has(cacheKey)) {
            navigator.mediaSession.metadata = this.metadataCache.get(cacheKey);
            return;
        }
        
        const metadata = track.metadata || {};
        const artwork = [];
        
        if (metadata.image) {
            // Multiple sizes for different devices
            [512, 256, 192, 96].forEach(size => {
                artwork.push({ 
                    src: metadata.image, 
                    sizes: `${size}x${size}`, 
                    type: 'image/jpeg' 
                });
            });
        } else {
            // Fallback SVG icon
            const iconSvg = `data:image/svg+xml,${encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
                '<rect fill="#dc3545" width="100" height="100"/>' +
                '<text x="50" y="50" font-size="50" text-anchor="middle" dy=".3em" fill="white">♪</text>' +
                '</svg>'
            )}`;
            artwork.push({ src: iconSvg, sizes: '512x512', type: 'image/svg+xml' });
        }
        
        // Enhance title with status if helpful
        const displayTitle = metadata.title || track.fileName || 'Unknown Track';
        const displayArtist = metadata.artist || 'Unknown Artist';
        
        const mediaMetadata = new MediaMetadata({
            title: displayTitle,
            artist: displayArtist,
            album: metadata.album || 'Unknown Album',
            artwork: artwork
        });
        
        // Cache for performance
        this.metadataCache.set(cacheKey, mediaMetadata);
        
        // Limit cache size
        if (this.metadataCache.size > 50) {
            const firstKey = this.metadataCache.keys().next().value;
            this.metadataCache.delete(firstKey);
        }
        
        navigator.mediaSession.metadata = mediaMetadata;
        console.log('🎵 Media Session metadata updated:', metadata.title || track.fileName);
    }
    
    setDefaultMetadata() {
        if (!('mediaSession' in navigator)) return;
        
        const iconSvg = `data:image/svg+xml,${encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
            '<rect fill="#dc3545" width="100" height="100"/>' +
            '<text x="50" y="50" font-size="50" text-anchor="middle" dy=".3em" fill="white">♪</text>' +
            '</svg>'
        )}`;
        
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Music Player',
            artist: 'Ready to play',
            album: 'Ultimate Music Player',
            artwork: [{ src: iconSvg, sizes: '512x512', type: 'image/svg+xml' }]
        });
    }
    
    updatePlaybackState(state) {
        this.state.playback = state;
        
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = state;
        }
        
        console.log(`🎵 Playback state: ${state}`);
    }
    
    updatePositionState() {
        if (!('setPositionState' in navigator.mediaSession)) return;
        if (!this.player || !this.player.duration || isNaN(this.player.duration)) {
            try {
                navigator.mediaSession.setPositionState(null);
            } catch(e) {}
            return;
        }
        
        try {
            const duration = this.player.duration;
            const position = Math.min(Math.max(this.player.currentTime, 0), duration);
            
            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: Math.abs(this.player.playbackRate) || 1.0,
                position: position
            });
        } catch (error) {
            // Silently ignore - can fail during track transitions
        }
    }
    
    // ============================================
    // SERVICE WORKER
    // ============================================
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Worker not supported');
            return false;
        }
        
        // Skip in extension environments
        if (window.chromeosPlatform?.isExtension) {
            console.log('⏭️ Skipping SW registration (extension mode)');
            return false;
        }
        
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js', {
                scope: './',
                updateViaCache: 'none'
            });
            
            console.log('✅ Service Worker registered:', registration.scope);
            
            // Listen for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('🔄 Service Worker update found');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated') {
                        console.log('✅ Service Worker updated');
                    }
                });
            });
            
            // Wait for ready
            await navigator.serviceWorker.ready;
            this.state.serviceWorkerReady = true;
            console.log('✅ Service Worker ready');
            
            return true;
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            return false;
        }
    }
    
    // ============================================
    // WAKE LOCK
    // ============================================
    
    async setupWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.warn('⚠️ Wake Lock API not supported');
            return false;
        }
        
        const requestWakeLock = async () => {
            // Only request when playing and visible
            if (this.player.paused || document.visibilityState !== 'visible') {
                return;
            }
            
            try {
                // Release old lock first
                if (this.state.wakeLock) {
                    await this.state.wakeLock.release().catch(() => {});
                }
                
                this.state.wakeLock = await navigator.wakeLock.request('screen');
                console.log('✅ Wake lock acquired');
                
                this.state.wakeLock.addEventListener('release', () => {
                    console.log('🔓 Wake lock released');
                    this.state.wakeLock = null;
                });
            } catch (error) {
                console.warn('⚠️ Wake lock request failed:', error);
                this.state.wakeLock = null;
            }
        };
        
        const releaseWakeLock = async () => {
            if (this.state.wakeLock) {
                try {
                    await this.state.wakeLock.release();
                    this.state.wakeLock = null;
                    console.log('🔓 Wake lock released');
                } catch (error) {
                    console.warn('⚠️ Wake lock release failed:', error);
                }
            }
        };
        
        // Request on play (if visible)
        this.player.addEventListener('play', requestWakeLock);
        
        // Release on pause
        this.player.addEventListener('pause', releaseWakeLock);
        
        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.player.paused) {
                requestWakeLock();
            } else {
                releaseWakeLock();
            }
        });
        
        console.log('✅ Wake Lock configured');
        return true;
    }
    
    // ============================================
    // PLAYER EVENT LISTENERS
    // ============================================
    
    setupPlayerListeners() {
        if (!this.player) return;
        
        // Playback state events
        this.player.addEventListener('play', () => {
            this.updatePlaybackState('playing');
            this.updateMediaSessionMetadata();
            this.recovery.attempts = 0;
        });
        
        this.player.addEventListener('pause', () => {
            this.updatePlaybackState('paused');
        });
        
        this.player.addEventListener('ended', () => {
            this.updatePlaybackState('none');
        });
        
        // Metadata events
        this.player.addEventListener('loadedmetadata', () => {
            this.updateMediaSessionMetadata(true);
            this.updatePositionState();
        });
        
        // Position tracking
        let lastPositionUpdate = 0;
        this.player.addEventListener('timeupdate', () => {
            const now = Date.now();
            // Throttle position updates to every 1 second
            if (now - lastPositionUpdate > 1000) {
                this.updatePositionState();
                lastPositionUpdate = now;
            }
        });
        
        this.player.addEventListener('durationchange', () => {
            this.updatePositionState();
        });
        
        this.player.addEventListener('ratechange', () => {
            this.updatePositionState();
        });
        
        // Error handling
        this.player.addEventListener('error', (e) => {
            console.error('❌ Player error:', e);
            this.handlePlaybackError(e);
        });
        
        this.player.addEventListener('stalled', () => {
            console.warn('⚠️ Playback stalled');
        });
        
        this.player.addEventListener('waiting', () => {
            console.log('⏳ Buffering...');
        });
        
        this.player.addEventListener('canplay', () => {
            console.log('✅ Can play');
        });
        
        console.log('✅ Player listeners configured');
    }
    
    // ============================================
    // INTERRUPTION HANDLING
    // ============================================
    
    setupInterruptionHandling() {
        // Page lifecycle events
        document.addEventListener('freeze', this.boundHandlers.freeze);
        document.addEventListener('resume', this.boundHandlers.resume);
        document.addEventListener('visibilitychange', this.boundHandlers.visibilityChange);
        window.addEventListener('beforeunload', this.boundHandlers.beforeUnload);
        
        console.log('✅ Interruption handling configured');
    }
    
    handleFreeze() {
        console.log('🥶 Page frozen');
        // Audio will continue via Media Session
    }
    
    async handleResume() {
        console.log('🔄 Page resumed');
        
        // Resume audio context if needed
        if (this.player && !this.player.paused) {
            await this.resumeAudioContext();
        }
    }
    
    handleVisibilityChange() {
        this.state.visibility = document.visibilityState;
        
        if (document.hidden) {
            console.log('📱 App hidden - audio continues via Media Session');
        } else {
            console.log('📱 App visible');
            
            // Resume audio context if playing
            if (this.player && !this.player.paused) {
                this.resumeAudioContext();
            }
        }
    }
    
    handleBeforeUnload(e) {
        if (this.player && !this.player.paused) {
            console.log('⚠️ Page unloading while audio playing');
            // Don't show confirmation dialog - let audio continue
        }
    }
    
    // ============================================
    // NETWORK MONITORING
    // ============================================
    
    setupNetworkMonitoring() {
        window.addEventListener('online', this.boundHandlers.online);
        window.addEventListener('offline', this.boundHandlers.offline);
        
        this.state.network = navigator.onLine;
        
        if (!navigator.onLine) {
            console.warn('⚠️ Starting offline');
        }
        
        console.log('✅ Network monitoring configured');
    }
    
    handleOnline() {
        console.log('🌐 Network connection restored');
        this.state.network = true;
        
        // Try to resume if was playing before disconnect
        if (this.player && this.player.paused && this.state.playback === 'playing') {
            console.log('🔄 Attempting to resume playback...');
            
            this.player.play().catch(error => {
                console.error('❌ Failed to resume after reconnection:', error);
            });
        }
    }
    
    handleOffline() {
        console.warn('📡 Network connection lost');
        this.state.network = false;
    }
    
    // ============================================
    // ERROR RECOVERY
    // ============================================
    
    async handlePlaybackError(error) {
        console.error('🚨 Playback error:', error);
        this.recovery.lastError = error;
        
        // Check if we should retry
        if (this.recovery.attempts >= this.recovery.maxAttempts) {
            console.error('❌ Max retry attempts reached');
            this.recovery.attempts = 0;
            return false;
        }
        
        this.recovery.attempts++;
        const delay = Math.min(
            this.recovery.backoffMs * Math.pow(2, this.recovery.attempts - 1), 
            5000
        );
        
        console.log(`🔄 Retry attempt ${this.recovery.attempts}/${this.recovery.maxAttempts} in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            // Try to resume audio context
            await this.resumeAudioContext();
            
            // Try to resume playback if was playing
            if (this.player && this.state.playback === 'playing') {
                await this.player.play();
                console.log('✅ Playback recovered');
                this.recovery.attempts = 0;
                return true;
            }
        } catch (retryError) {
            console.error('❌ Retry failed:', retryError);
            return false;
        }
        
        return false;
    }
    
    resetRecovery() {
        this.recovery.attempts = 0;
        this.recovery.lastError = null;
    }
    
    // ============================================
    // PERSISTENT STORAGE
    // ============================================
    
    async requestPersistentStorage() {
        if (!navigator.storage?.persist) {
            console.warn('⚠️ Storage API not supported');
            return false;
        }
        
        try {
            const isPersistent = await navigator.storage.persist();
            console.log(`💾 Persistent storage: ${isPersistent ? 'granted' : 'denied'}`);
            
            if (isPersistent) {
                const estimate = await navigator.storage.estimate();
                const usage = (estimate.usage / estimate.quota * 100).toFixed(2);
                const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
                const totalMB = (estimate.quota / 1024 / 1024).toFixed(2);
                
                console.log(`💾 Storage: ${usage}% used (${usedMB} MB / ${totalMB} MB)`);
            } else {
                console.warn('⚠️ Storage may be cleared. Consider enabling persistent storage.');
            }
            
            return isPersistent;
        } catch (error) {
            console.warn('⚠️ Could not request persistent storage:', error);
            return false;
        }
    }
    
    // ============================================
    // PUBLIC API
    // ============================================
    
    async forceResume() {
        console.log('🔄 Force resume requested');
        
        await this.resumeAudioContext();
        
        if (this.player) {
            return this.player.play();
        }
    }
    
    clearMetadataCache() {
        this.metadataCache.clear();
        console.log('🗑️ Metadata cache cleared');
    }
    
    getStatus() {
        const ctx = this.getAudioContext();
        
        return {
            audioContext: {
                exists: !!ctx,
                state: ctx?.state || 'not created',
                sampleRate: ctx?.sampleRate || 0
            },
            playback: {
                state: this.state.playback,
                paused: this.player?.paused,
                currentTime: this.player?.currentTime || 0,
                duration: this.player?.duration || 0
            },
            features: {
                mediaSession: 'mediaSession' in navigator,
                wakeLock: 'wakeLock' in navigator,
                wakeLockActive: !!this.state.wakeLock,
                serviceWorker: this.state.serviceWorkerReady,
                persistentStorage: 'persist' in (navigator.storage || {})
            },
            network: {
                online: this.state.network,
                type: navigator.connection?.effectiveType || 'unknown'
            },
            recovery: {
                attempts: this.recovery.attempts,
                maxAttempts: this.recovery.maxAttempts,
                lastError: this.recovery.lastError?.message || null
            },
            visibility: this.state.visibility,
            cacheSize: this.metadataCache.size
        };
    }
    
    destroy() {
        console.log('🧹 Cleaning up Background Audio Handler...');
        
        // Remove event listeners
        Object.entries(this.boundHandlers).forEach(([name, handler]) => {
            switch (name) {
                case 'visibilityChange':
                    document.removeEventListener('visibilitychange', handler);
                    break;
                case 'beforeUnload':
                    window.removeEventListener('beforeunload', handler);
                    break;
                case 'online':
                    window.removeEventListener('online', handler);
                    break;
                case 'offline':
                    window.removeEventListener('offline', handler);
                    break;
                case 'freeze':
                    document.removeEventListener('freeze', handler);
                    break;
                case 'resume':
                    document.removeEventListener('resume', handler);
                    break;
            }
        });
        
        // Release wake lock
        if (this.state.wakeLock) {
            this.state.wakeLock.release().catch(() => {});
        }
        
        // Clear caches
        this.metadataCache.clear();
        
        // Reset state
        this.state = {
            playback: 'none',
            network: navigator.onLine,
            visibility: document.visibilityState,
            wakeLock: null,
            serviceWorkerReady: false
        };
        
        console.log('✅ Cleanup complete');
    }
}

// ============================================
// GLOBAL INITIALIZATION
// ============================================

// Create global instance
window.backgroundAudioHandler = new EnhancedBackgroundAudioHandler();

// Debug helpers
window.checkAudioStatus = () => {
    const status = window.backgroundAudioHandler.getStatus();
    console.table(status);
    return status;
};

window.forceAudioResume = () => {
    return window.backgroundAudioHandler.forceResume();
};

console.log('✅ Enhanced Background Audio Handler v2.0 loaded');
console.log('💡 Waiting for script.js to initialize...');
console.log('💡 Run window.checkAudioStatus() to see current status');