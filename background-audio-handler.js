/* ============================================
   BACKGROUND AUDIO HANDLER v2.1
   Coordination layer — no audio creation.
   ============================================ */

class EnhancedBackgroundAudioHandler {

    // Reused across metadata calls — no need to rebuild the string every time
    static FALLBACK_ARTWORK = [{
        src: `data:image/svg+xml,${encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
            '<rect fill="#dc3545" width="100" height="100"/>' +
            '<text x="50" y="50" font-size="50" text-anchor="middle" dy=".3em" fill="white">♪</text>' +
            '</svg>'
        )}`,
        sizes: '512x512',
        type: 'image/svg+xml',
    }];

    constructor(debugLog = console.log) {
        this._log = debugLog;

        // Set by init()
        this.player                = null;
        this.playlist              = null;   // () => Track[]
        this.getCurrentTrackIndex  = null;   // () => number
        this.onMediaAction         = {};

        this.state = {
            playback:          'none',
            wakeLock:          null,
            serviceWorkerReady:false,
        };

        this._metadataCache = new Map();

        this._recovery = {
            attempts:    0,
            maxAttempts: 3,
            backoffMs:   1000,
        };

        // All tracked listeners for clean teardown
        this._listeners = [];   // { element, event, handler }

        this._log('🎵 BackgroundAudioHandler created', 'info');
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    async init(config) {
        this.player               = config.player;
        this.playlist             = config.playlist;
        this.getCurrentTrackIndex = config.getCurrentTrackIndex;
        this.onMediaAction        = config.onMediaAction ?? {};

        if (!this.player) throw new Error('Audio player element required');

        try {
            this._setupPlayerListeners();
            this._setupMediaSession();
            this._setupInterruptionHandling();
            await this._setupWakeLock();
            await this._registerServiceWorker();
            await this._requestPersistentStorage();

            this._log('✅ BackgroundAudioHandler ready', 'success');
            return true;
        } catch (err) {
            this._log(`❌ BackgroundAudioHandler init failed: ${err.message}`, 'error');
            return false;
        }
    }

    // ─── AudioContext access (read-only) ──────────────────────────────────────

    _getAudioContext() {
        return window.audioContext ?? null;
    }

    async _resumeAudioContext() {
        const ctx = this._getAudioContext();
        if (!ctx) return false;
        if (ctx.state !== 'suspended') return true;
        try {
            await ctx.resume();
            return true;
        } catch (err) {
            this._log(`⚠️ AudioContext resume failed: ${err.message}`, 'warning');
            return false;
        }
    }

    // ─── Media Session ────────────────────────────────────────────────────────

    _setupMediaSession() {
        if (!('mediaSession' in navigator)) {
            this._log('⚠️ Media Session API not supported', 'warning');
            return;
        }

        const actions = {
            play: async () => {
                await this._resumeAudioContext();
                return this.player.play();
            },
            pause:          () => this.player.pause(),
            stop:           () => { this.player.pause(); this.player.currentTime = 0; },
            previoustrack:  () => this._triggerMediaAction('previous'),
            nexttrack:      () => this._triggerMediaAction('next'),
            seekbackward:   ({ seekOffset = 10 }) => {
                this.player.currentTime = Math.max(this.player.currentTime - seekOffset, 0);
            },
            seekforward:    ({ seekOffset = 10 }) => {
                this.player.currentTime = Math.min(
                    this.player.currentTime + seekOffset,
                    this.player.duration ?? 0
                );
            },
            seekto:         ({ seekTime }) => {
                if (seekTime != null) this.player.currentTime = seekTime;
            },
        };

        for (const [action, handler] of Object.entries(actions)) {
            try {
                navigator.mediaSession.setActionHandler(action, async (details) => {
                    try {
                        const result = handler(details);
                        if (result?.catch) await result.catch(e => this._handlePlaybackError(e));
                        this._recovery.attempts = 0;
                    } catch (err) {
                        this._log(`❌ Media action '${action}' failed: ${err.message}`, 'error');
                        this._handlePlaybackError(err);
                    }
                });
            } catch {
                // Action not supported in this browser — silently skip
            }
        }

        this.updateMediaSessionMetadata();
        this._log('✅ Media Session configured', 'success');
    }

    _triggerMediaAction(action) {
        if (this.onMediaAction[action]) {
            this.onMediaAction[action]();
        }
    }

    updateMediaSessionMetadata(forceUpdate = false) {
        if (!('mediaSession' in navigator)) return;

        const index    = this.getCurrentTrackIndex?.() ?? -1;
        const playlist = this.playlist?.()             ?? [];
        const track    = playlist[index];

        if (!track) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title:   'Music Player',
                artist:  'Ready to play',
                album:   'Ultimate Music Player',
                artwork: EnhancedBackgroundAudioHandler.FALLBACK_ARTWORK,
            });
            return;
        }

        const cacheKey = `${track.fileName}_${index}`;

        if (!forceUpdate && this._metadataCache.has(cacheKey)) {
            navigator.mediaSession.metadata = this._metadataCache.get(cacheKey);
            return;
        }

        const meta    = track.metadata ?? {};
        const artwork = meta.image
            ? [512, 256, 192, 96].map(s => ({ src: meta.image, sizes: `${s}x${s}`, type: 'image/jpeg' }))
            : EnhancedBackgroundAudioHandler.FALLBACK_ARTWORK;

        const mediaMetadata = new MediaMetadata({
            title:  meta.title  || track.fileName || 'Unknown Track',
            artist: meta.artist || 'Unknown Artist',
            album:  meta.album  || 'Unknown Album',
            artwork,
        });

        // Cap cache at 50 entries
        if (this._metadataCache.size >= 50) {
            this._metadataCache.delete(this._metadataCache.keys().next().value);
        }
        this._metadataCache.set(cacheKey, mediaMetadata);
        navigator.mediaSession.metadata = mediaMetadata;
    }

    updatePlaybackState(state) {
        this.state.playback = state;
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = state;
        }
    }

    _updatePositionState() {
        if (!('setPositionState' in (navigator.mediaSession ?? {}))) return;
        const dur = this.player?.duration;
        if (!dur || !isFinite(dur)) {
            try { navigator.mediaSession.setPositionState(null); } catch (_) {}
            return;
        }
        try {
            navigator.mediaSession.setPositionState({
                duration:     dur,
                playbackRate: Math.abs(this.player.playbackRate) || 1,
                position:     Math.min(Math.max(this.player.currentTime, 0), dur),
            });
        } catch (_) {
            // Silently ignore — can fail during track transitions
        }
    }

    // ─── Player event listeners ───────────────────────────────────────────────

    _setupPlayerListeners() {
        const wire = (event, handler) => {
            this.player.addEventListener(event, handler);
            this._listeners.push({ element: this.player, event, handler });
        };

        wire('play', () => {
            this.updatePlaybackState('playing');
            this.updateMediaSessionMetadata();
            this._recovery.attempts = 0;
        });

        wire('pause',  () => this.updatePlaybackState('paused'));
        wire('ended',  () => this.updatePlaybackState('none'));

        wire('loadedmetadata', () => {
            this.updateMediaSessionMetadata(true);
            this._updatePositionState();
        });

        wire('durationchange', () => this._updatePositionState());
        wire('ratechange',     () => this._updatePositionState());

        // Throttle position updates to 1/s — no need to spam the Media Session API
        let lastPositionUpdate = 0;
        wire('timeupdate', () => {
            const now = Date.now();
            if (now - lastPositionUpdate >= 1000) {
                this._updatePositionState();
                lastPositionUpdate = now;
            }
        });

        wire('error', (e) => this._handlePlaybackError(e));
    }

    // ─── Interruption handling ────────────────────────────────────────────────

    _setupInterruptionHandling() {
        const wire = (element, event, handler) => {
            element.addEventListener(event, handler);
            this._listeners.push({ element, event, handler });
        };

        wire(document, 'visibilitychange', () => {
            if (!document.hidden && this.player && !this.player.paused) {
                this._resumeAudioContext();
            }
        });

        wire(document, 'freeze',  () => {/* audio continues via Media Session */});
        wire(document, 'resume',  async () => {
            if (this.player && !this.player.paused) await this._resumeAudioContext();
        });

        // Track online/offline state only — no auto-resume (player uses local files)
        wire(window, 'online',  () => { this._log('🌐 Network restored', 'info'); });
        wire(window, 'offline', () => { this._log('🌐 Network lost', 'warning'); });
    }

    // ─── Wake Lock ────────────────────────────────────────────────────────────

    async _setupWakeLock() {
        // On Android, delegate to the native KeepAwake Capacitor plugin —
        // more reliable than the WakeLock API when the app is backgrounded.
        if (window.NativeBridge?.isNative()) {
            const onPlay  = () => window.NativeBridge.keepScreenOn(true).catch(() => {});
            const onPause = () => window.NativeBridge.keepScreenOn(false).catch(() => {});
            const onEnded = () => window.NativeBridge.keepScreenOn(false).catch(() => {});

            this.player.addEventListener('play',  onPlay);
            this.player.addEventListener('pause', onPause);
            this.player.addEventListener('ended', onEnded);

            this._listeners.push(
                { element: this.player, event: 'play',  handler: onPlay  },
                { element: this.player, event: 'pause', handler: onPause },
                { element: this.player, event: 'ended', handler: onEnded },
            );

            this._log('✅ WakeLock: using native KeepAwake plugin', 'info');
            return true;
        }

        // Browser WakeLock API fallback (desktop Chrome, Edge, etc.)
        if (!('wakeLock' in navigator)) return false;

        const request = async () => {
            if (this.player.paused || document.visibilityState !== 'visible') return;
            try {
                if (this.state.wakeLock) {
                    await this.state.wakeLock.release().catch(() => {});
                }
                this.state.wakeLock = await navigator.wakeLock.request('screen');
                this.state.wakeLock.addEventListener('release', () => {
                    this.state.wakeLock = null;
                }, { once: true });
            } catch {
                this.state.wakeLock = null;
            }
        };

        const release = async () => {
            if (!this.state.wakeLock) return;
            try { await this.state.wakeLock.release(); } catch (_) {}
            this.state.wakeLock = null;
        };

        // Re-acquire after tab becomes visible while playing
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && !this.player.paused) request();
            else release();
        };

        this.player.addEventListener('play',  request);
        this.player.addEventListener('pause', release);
        document.addEventListener('visibilitychange', onVisibility);

        this._listeners.push(
            { element: this.player,   event: 'play',             handler: request      },
            { element: this.player,   event: 'pause',            handler: release      },
            { element: document,      event: 'visibilitychange', handler: onVisibility },
        );

        return true;
    }

    // ─── Service Worker ───────────────────────────────────────────────────────

    async _registerServiceWorker() {
        // Inside the Capacitor WebView the files are bundled as assets —
        // there is nothing to cache and no SW scope to register.
        if (window.NativeBridge?.isNative()) {
            this._log('⏭️ Service worker skipped (native mode)', 'info');
            return false;
        }
        if (!('serviceWorker' in navigator)) return false;

        try {
            const reg = await navigator.serviceWorker.register('./service-worker.js', {
                scope: './',
                updateViaCache: 'none',
            });

            reg.addEventListener('updatefound', () => {
                reg.installing?.addEventListener('statechange', function () {
                    if (this.state === 'activated') {
                        // New service worker activated — no action needed
                    }
                });
            });

            await navigator.serviceWorker.ready;
            this.state.serviceWorkerReady = true;
            this._log('✅ Service Worker ready', 'success');
            return true;
        } catch (err) {
            this._log(`⚠️ Service Worker registration failed: ${err.message}`, 'warning');
            return false;
        }
    }

    // ─── Persistent storage ───────────────────────────────────────────────────

    async _requestPersistentStorage() {
        if (!navigator.storage?.persist) return false;
        try {
            const granted = await navigator.storage.persist();
            this._log(`💾 Persistent storage: ${granted ? 'granted' : 'denied'}`, 'info');
            return granted;
        } catch {
            return false;
        }
    }

    // ─── Error recovery ───────────────────────────────────────────────────────

    async _handlePlaybackError(error) {
        const r = this._recovery;
        if (r.attempts >= r.maxAttempts) {
            this._log('❌ Max recovery attempts reached', 'error');
            r.attempts = 0;
            return false;
        }

        r.attempts++;
        const delay = Math.min(r.backoffMs * 2 ** (r.attempts - 1), 5000);
        this._log(`🔄 Recovery attempt ${r.attempts}/${r.maxAttempts} in ${delay} ms`, 'warning');

        await new Promise(resolve => setTimeout(resolve, delay));

        try {
            await this._resumeAudioContext();
            if (this.player && this.state.playback === 'playing') {
                await this.player.play();
                r.attempts = 0;
                return true;
            }
        } catch (err) {
            this._log(`❌ Recovery failed: ${err.message}`, 'error');
        }
        return false;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    async forceResume() {
        await this._resumeAudioContext();
        return this.player?.play();
    }

    clearMetadataCache() {
        this._metadataCache.clear();
    }

    getStatus() {
        const ctx = this._getAudioContext();
        return {
            audioContext: {
                exists:     !!ctx,
                state:      ctx?.state ?? 'not created',
                sampleRate: ctx?.sampleRate ?? 0,
            },
            playback: {
                state:       this.state.playback,
                paused:      this.player?.paused,
                currentTime: this.player?.currentTime ?? 0,
                duration:    this.player?.duration    ?? 0,
            },
            features: {
                mediaSession:      'mediaSession' in navigator,
                wakeLock:          'wakeLock'     in navigator,
                wakeLockActive:    !!this.state.wakeLock,
                serviceWorker:     this.state.serviceWorkerReady,
                persistentStorage: !!navigator.storage?.persist,
            },
            recovery: {
                attempts:    this._recovery.attempts,
                maxAttempts: this._recovery.maxAttempts,
            },
            cacheSize: this._metadataCache.size,
        };
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        this._listeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this._listeners = [];

        if (this.state.wakeLock) {
            this.state.wakeLock.release().catch(() => {});
            this.state.wakeLock = null;
        }

        this._metadataCache.clear();

        this._log('✅ BackgroundAudioHandler destroyed', 'success');
    }
}

// ─── Global instance ──────────────────────────────────────────────────────────

window.backgroundAudioHandler = new EnhancedBackgroundAudioHandler();

window.checkAudioStatus  = () => { const s = window.backgroundAudioHandler.getStatus(); console.table(s); return s; };
window.forceAudioResume  = () => window.backgroundAudioHandler.forceResume();

console.log('✅ BackgroundAudioHandler v2.1 loaded');
