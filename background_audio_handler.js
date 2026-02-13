/* ============================================
   ENHANCED Background Audio Handler
   Improved error handling, recovery, and features
   ============================================ */

class BackgroundAudioHandler {
    constructor() {
        this.player = null;
        this.wakeLock = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.isAudioContextSuspended = false;
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.metadataCache = new Map();
        this.lastPlaybackState = 'none';
        this.interruptionHandler = null;
        
        // Bind methods for event listeners
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.handleOnline = this.handleOnline.bind(this);
        this.handleOffline = this.handleOffline.bind(this);
        
        this.init();
    }
    
    async init() {
        console.log('🎵 Initializing ENHANCED Background Audio Handler...');
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    async setup() {
        this.player = document.getElementById('audio-player');
        
        if (!this.player) {
            console.error('❌ Audio player element not found');
            return;
        }
        
        try {
            // Setup in optimal order
            await this.setupAudioContext();
            this.setupMediaSession();
            await this.registerServiceWorker();
            this.setupWakeLock();
            this.setupPlayerListeners();
            this.setupInterruptionHandling();
            this.setupNetworkMonitoring();
            await this.requestPersistentStorage();
            
            console.log('✅ Background Audio Handler fully initialized');
        } catch (error) {
            console.error('❌ Setup failed:', error);
            this.handleSetupError(error);
        }
    }
    
    async setupAudioContext() {
        if (!window.AudioContext && !window.webkitAudioContext) {
            console.warn('⚠️ Web Audio API not supported');
            return;
        }
        
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();
            
            // Create audio graph for potential processing
            this.sourceNode = this.audioContext.createMediaElementSource(this.player);
            this.gainNode = this.audioContext.createGain();
            
            // Connect: source -> gain -> destination
            this.sourceNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            // Handle context state changes
            this.audioContext.addEventListener('statechange', () => {
                console.log(`🎚️ AudioContext state: ${this.audioContext.state}`);
                this.isAudioContextSuspended = this.audioContext.state === 'suspended';
            });
            
            console.log('✅ AudioContext initialized:', this.audioContext.state);
        } catch (error) {
            console.error('❌ AudioContext setup failed:', error);
        }
    }
    
    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('✅ AudioContext resumed');
                return true;
            } catch (error) {
                console.error('❌ Failed to resume AudioContext:', error);
                return false;
            }
        }
        return true;
    }
    
    setupMediaSession() {
        if (!('mediaSession' in navigator)) {
            console.warn('⚠️ Media Session API not supported');
            return;
        }
        
        console.log('🎮 Setting up Media Session API...');
        
        // Set initial metadata
        this.updateMediaSessionMetadata();
        
        // Setup all media control handlers with error handling
        const handlers = {
            play: () => this.handleMediaAction('play', () => this.player.play()),
            pause: () => this.handleMediaAction('pause', () => this.player.pause()),
            stop: () => this.handleMediaAction('stop', () => {
                this.player.pause();
                this.player.currentTime = 0;
            }),
            previoustrack: () => this.handleMediaAction('previous', () => {
                const prevBtn = document.getElementById('prev-button');
                if (prevBtn && !prevBtn.disabled) prevBtn.click();
            }),
            nexttrack: () => this.handleMediaAction('next', () => {
                const nextBtn = document.getElementById('next-button');
                if (nextBtn && !nextBtn.disabled) nextBtn.click();
            }),
            seekbackward: (details) => this.handleMediaAction('seekbackward', () => {
                if (this.player) {
                    this.player.currentTime = Math.max(
                        this.player.currentTime - (details.seekOffset || 10), 
                        0
                    );
                }
            }),
            seekforward: (details) => this.handleMediaAction('seekforward', () => {
                if (this.player) {
                    this.player.currentTime = Math.min(
                        this.player.currentTime + (details.seekOffset || 10), 
                        this.player.duration || 0
                    );
                }
            }),
            seekto: (details) => this.handleMediaAction('seekto', () => {
                if (this.player && details.seekTime !== undefined) {
                    this.player.currentTime = details.seekTime;
                }
            })
        };
        
        // Register all handlers with error catching
        Object.entries(handlers).forEach(([action, handler]) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (error) {
                console.warn(`⚠️ Failed to set ${action} handler:`, error);
            }
        });
        
        console.log('✅ Media Session handlers configured');
    }
    
    async handleMediaAction(actionName, actionFn) {
        console.log(`📱 Media Session: ${actionName}`);
        
        try {
            // Resume audio context if needed
            await this.resumeAudioContext();
            
            // Execute the action
            const result = actionFn();
            
            // Handle promises
            if (result && typeof result.catch === 'function') {
                await result.catch(error => {
                    console.error(`❌ Media action '${actionName}' failed:`, error);
                    this.handlePlaybackError(error);
                });
            }
        } catch (error) {
            console.error(`❌ Media action '${actionName}' error:`, error);
            this.handlePlaybackError(error);
        }
    }
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Worker not supported');
            return;
        }
        
        // Skip if running as Chrome extension
        if (window.chromeosPlatform && window.chromeosPlatform.isExtension) {
            console.log('⭐️ Skipping SW registration (extension mode)');
            return;
        }
        
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js', {
                scope: './',
                updateViaCache: 'none' // Always check for updates
            });
            
            console.log('✅ Service Worker registered:', registration.scope);
            
            // Listen for updates
            registration.addEventListener('updatefound', () => {
                console.log('🔄 Service Worker update found');
            });
            
            await navigator.serviceWorker.ready;
            console.log('✅ Service Worker ready for background audio');
            
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            // Don't throw - audio can work without SW
        }
    }
    
    async setupWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.warn('⚠️ Wake Lock API not supported');
            return;
        }
        
        const requestWakeLock = async () => {
            try {
                // Release existing lock if any
                if (this.wakeLock) {
                    await this.wakeLock.release();
                }
                
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('✅ Wake lock acquired');
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('🔓 Wake lock released');
                    this.wakeLock = null;
                });
            } catch (error) {
                console.warn('⚠️ Wake lock request failed:', error);
            }
        };
        
        const releaseWakeLock = async () => {
            if (this.wakeLock) {
                try {
                    await this.wakeLock.release();
                    this.wakeLock = null;
                } catch (error) {
                    console.warn('⚠️ Wake lock release failed:', error);
                }
            }
        };
        
        // Request wake lock when playing
        this.player.addEventListener('play', () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        });
        
        // Release wake lock when paused
        this.player.addEventListener('pause', releaseWakeLock);
        
        // Re-acquire wake lock when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.player && !this.player.paused) {
                requestWakeLock();
            } else if (document.visibilityState === 'hidden') {
                releaseWakeLock();
            }
        });
    }
    
    setupPlayerListeners() {
        if (!this.player) return;
        
        // Playback state listeners
        this.player.addEventListener('play', () => {
            this.handlePlaybackStateChange('playing');
            this.updateMediaSessionMetadata();
            this.retryAttempts = 0; // Reset retry counter on successful play
        });
        
        this.player.addEventListener('pause', () => {
            this.handlePlaybackStateChange('paused');
        });
        
        this.player.addEventListener('ended', () => {
            this.handlePlaybackStateChange('none');
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
        
        // Metadata and position updates
        this.player.addEventListener('loadedmetadata', () => {
            this.updateMediaSessionMetadata();
            this.updatePositionState();
        });
        
        this.player.addEventListener('timeupdate', () => {
            this.updatePositionState();
        });
        
        this.player.addEventListener('durationchange', () => {
            this.updatePositionState();
        });
        
        this.player.addEventListener('ratechange', () => {
            this.updatePositionState();
        });
        
        // Volume change
        this.player.addEventListener('volumechange', () => {
            if (this.gainNode) {
                this.gainNode.gain.value = this.player.volume;
            }
        });
        
        // Page lifecycle events
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    
    setupInterruptionHandling() {
        // Handle audio interruptions (phone calls, other apps, etc)
        if (this.audioContext) {
            this.interruptionHandler = () => {
                if (this.audioContext.state === 'interrupted') {
                    console.warn('⚠️ Audio interrupted');
                    // Audio will auto-resume on iOS when interruption ends
                }
            };
            
            this.audioContext.addEventListener('statechange', this.interruptionHandler);
        }
        
        // Handle page freeze/resume
        document.addEventListener('freeze', () => {
            console.log('🥶 Page frozen');
        });
        
        document.addEventListener('resume', async () => {
            console.log('🔄 Page resumed');
            if (this.player && !this.player.paused) {
                await this.resumeAudioContext();
            }
        });
    }
    
    setupNetworkMonitoring() {
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        
        // Check initial network status
        if (!navigator.onLine) {
            console.warn('⚠️ Starting offline');
        }
    }
    
    handleOnline() {
        console.log('🌐 Network connection restored');
        // Attempt to resume playback if it was interrupted
        if (this.player && this.player.paused && this.lastPlaybackState === 'playing') {
            console.log('🔄 Attempting to resume playback...');
            this.player.play().catch(error => {
                console.error('❌ Failed to resume after reconnection:', error);
            });
        }
    }
    
    handleOffline() {
        console.warn('📡 Network connection lost');
        // Audio may continue if cached, otherwise will error
    }
    
    handlePlaybackStateChange(state) {
        this.lastPlaybackState = state;
        
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = state;
        }
        
        console.log(`🎵 Playback state: ${state}`);
    }
    
    updatePositionState() {
        if (!('setPositionState' in navigator.mediaSession)) return;
        if (!this.player || !this.player.duration || isNaN(this.player.duration)) return;
        
        try {
            navigator.mediaSession.setPositionState({
                duration: this.player.duration,
                playbackRate: this.player.playbackRate,
                position: Math.min(this.player.currentTime, this.player.duration)
            });
        } catch (error) {
            // Silently ignore - this can fail during track transitions
        }
    }
    
    updateMediaSessionMetadata() {
        if (!('mediaSession' in navigator)) return;
        
        // Get current track info from global playlist
        if (typeof currentTrackIndex === 'undefined' || typeof playlist === 'undefined') {
            this.setDefaultMetadata();
            return;
        }
        
        if (currentTrackIndex === -1 || !playlist[currentTrackIndex]) {
            this.setDefaultMetadata();
            return;
        }
        
        const track = playlist[currentTrackIndex];
        const cacheKey = track.fileName || track.url;
        
        // Check cache first
        if (this.metadataCache.has(cacheKey)) {
            navigator.mediaSession.metadata = this.metadataCache.get(cacheKey);
            console.log('🎵 Media Session metadata (cached)');
            return;
        }
        
        // Create new metadata
        const metadata = track.metadata || {};
        const artwork = [];
        
        if (metadata.image) {
            artwork.push({ 
                src: metadata.image, 
                sizes: '512x512', 
                type: 'image/jpeg' 
            });
            artwork.push({ 
                src: metadata.image, 
                sizes: '192x192', 
                type: 'image/jpeg' 
            });
        } else {
            artwork.push({ 
                src: './icon-512.png', 
                sizes: '512x512', 
                type: 'image/png' 
            });
            artwork.push({ 
                src: './icon-192.png', 
                sizes: '192x192', 
                type: 'image/png' 
            });
        }
        
        const mediaMetadata = new MediaMetadata({
            title: metadata.title || track.fileName || 'Unknown Track',
            artist: metadata.artist || 'Unknown Artist',
            album: metadata.album || 'Unknown Album',
            artwork: artwork
        });
        
        // Cache and set
        this.metadataCache.set(cacheKey, mediaMetadata);
        navigator.mediaSession.metadata = mediaMetadata;
        
        console.log('🎵 Media Session metadata updated:', metadata.title || track.fileName);
    }
    
    setDefaultMetadata() {
        if (!('mediaSession' in navigator)) return;
        
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Music Player',
            artist: 'Ready to play',
            album: 'Ultimate Music Player',
            artwork: [
                { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: './icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
        });
    }
    
    async handlePlaybackError(error) {
        console.error('🚨 Playback error:', error);
        
        if (this.retryAttempts >= this.maxRetries) {
            console.error('❌ Max retry attempts reached');
            return;
        }
        
        this.retryAttempts++;
        console.log(`🔄 Retry attempt ${this.retryAttempts}/${this.maxRetries}`);
        
        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, this.retryAttempts - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            await this.resumeAudioContext();
            
            if (this.player && this.lastPlaybackState === 'playing') {
                await this.player.play();
                console.log('✅ Playback recovered');
            }
        } catch (retryError) {
            console.error('❌ Retry failed:', retryError);
        }
    }
    
    handleSetupError(error) {
        console.error('🚨 Setup error:', error);
        // Could dispatch custom event for UI to handle
        window.dispatchEvent(new CustomEvent('audiohandler:error', { 
            detail: { error, message: 'Audio handler setup failed' }
        }));
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            console.log('📱 App hidden - audio should continue via Media Session');
        } else {
            console.log('📱 App visible');
            // Resume audio context if needed
            this.resumeAudioContext();
        }
    }
    
    handleBeforeUnload(e) {
        if (this.player && !this.player.paused) {
            console.log('⚠️ Page unloading while audio playing');
            // Note: Can't prevent unload, just log for debugging
        }
    }
    
    async requestPersistentStorage() {
        if (!navigator.storage || !navigator.storage.persist) {
            console.warn('⚠️ Storage API not supported');
            return;
        }
        
        try {
            const isPersistent = await navigator.storage.persist();
            console.log(`💾 Persistent storage: ${isPersistent ? 'granted' : 'denied'}`);
            
            if (isPersistent) {
                // Check usage
                const estimate = await navigator.storage.estimate();
                const usage = (estimate.usage / estimate.quota * 100).toFixed(2);
                console.log(`💾 Storage usage: ${usage}% (${this.formatBytes(estimate.usage)} / ${this.formatBytes(estimate.quota)})`);
            } else {
                console.warn('⚠️ Storage may be cleared. Audio files could be lost.');
            }
        } catch (error) {
            console.warn('⚠️ Could not request persistent storage:', error);
        }
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // Public methods for external control
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
        return {
            audioContextState: this.audioContext?.state || 'unavailable',
            mediaSessionSupported: 'mediaSession' in navigator,
            wakeLockActive: !!this.wakeLock,
            serviceWorkerReady: navigator.serviceWorker?.controller !== null,
            isPlaying: this.player && !this.player.paused,
            retryAttempts: this.retryAttempts,
            networkStatus: navigator.onLine ? 'online' : 'offline'
        };
    }
    
    // Cleanup method
    destroy() {
        console.log('🧹 Cleaning up Background Audio Handler...');
        
        // Remove event listeners
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        
        // Release wake lock
        if (this.wakeLock) {
            this.wakeLock.release();
        }
        
        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        // Clear cache
        this.metadataCache.clear();
        
        console.log('✅ Cleanup complete');
    }
}

// Initialize immediately
const backgroundAudioHandler = new BackgroundAudioHandler();

// Make globally available
window.backgroundAudioHandler = backgroundAudioHandler;

// Expose status check for debugging
window.checkAudioStatus = () => {
    console.table(backgroundAudioHandler.getStatus());
    return backgroundAudioHandler.getStatus();
};

console.log('✅ ENHANCED background-audio-handler.js loaded');
console.log('💡 Tip: Run window.checkAudioStatus() to see current status');