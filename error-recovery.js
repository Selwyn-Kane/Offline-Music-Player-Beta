/* ============================================
   ERROR RECOVERY v1.1
   ============================================ */

class ErrorRecovery {

    static MAX_RETRIES       = 3;
    static BASE_RETRY_DELAY  = 1_000;   // ms
    static MAX_RETRY_DELAY   = 10_000;  // ms
    static MAX_HISTORY       = 50;
    static CB_THRESHOLD      = 5;       // failures before circuit opens
    static CB_RESET_MS       = 60_000;  // how long before half-open attempt

    constructor(debugLog = console.log) {
        this._log = debugLog;

        // ── Circuit breaker ───────────────────────────────────────────────────
        this._cb = {
            state:           'closed',  // 'closed' | 'open' | 'half-open'
            failures:        0,
            lastFailureTime: null,
        };

        // ── Error history ─────────────────────────────────────────────────────
        this._history = [];     // newest first, capped at MAX_HISTORY

        // ── Cleanup registry ──────────────────────────────────────────────────
        this._listeners = [];   // { element, event, handler }
        this._alive     = true;

        // ── Online / offline (passive tracking only — no queuing) ─────────────
        this.isOnline = navigator.onLine;
        this._setupNetworkListeners();
    }

    // ─── Network state ────────────────────────────────────────────────────────
    // Tracks online/offline purely so callers can read `this.isOnline`.
    // No operation queuing — the player works entirely with local files.

    _setupNetworkListeners() {
        const onOnline  = () => { this.isOnline = true;  this._log('🌐 Network restored', 'success'); };
        const onOffline = () => { this.isOnline = false; this._log('🌐 Network lost', 'warning');   };

        window.addEventListener('online',  onOnline);
        window.addEventListener('offline', onOffline);

        this._listeners.push(
            { element: window, event: 'online',  handler: onOnline  },
            { element: window, event: 'offline', handler: onOffline },
        );
    }

    // ─── Circuit breaker ──────────────────────────────────────────────────────

    _cbAllow(opName) {
        const cb = this._cb;

        // Attempt half-open after reset timeout
        if (cb.state === 'open' && cb.lastFailureTime &&
            Date.now() - cb.lastFailureTime > ErrorRecovery.CB_RESET_MS) {
            cb.state    = 'half-open';
            cb.failures = 0;
            this._log(`⚡ Circuit half-open for "${opName}"`, 'info');
        }

        if (cb.state === 'open') {
            this._log(`⚡ Circuit open — rejecting "${opName}"`, 'error');
            return false;
        }
        return true;
    }

    _cbOnFailure(opName) {
        const cb = this._cb;
        cb.failures++;
        cb.lastFailureTime = Date.now();
        if (cb.failures >= ErrorRecovery.CB_THRESHOLD) {
            cb.state = 'open';
            this._log(`⚡ Circuit opened after ${cb.failures} failures for "${opName}"`, 'error');
        }
    }

    _cbOnSuccess() {
        const cb = this._cb;
        if (cb.state === 'half-open') {
            cb.state    = 'closed';
            cb.failures = 0;
            this._log('⚡ Circuit closed after successful operation', 'success');
        } else if (cb.state === 'closed' && cb.failures > 0) {
            cb.failures = Math.max(0, cb.failures - 1);
        }
    }

    // ─── Error classification ─────────────────────────────────────────────────

    _isTransient(error) {
        const msg  = error.message ?? '';
        const name = error.name    ?? '';
        return ['NetworkError', 'TimeoutError', 'ETIMEDOUT', 'ECONNRESET',
                'ECONNREFUSED', 'MEDIA_ERR_NETWORK']
            .some(t => msg.includes(t) || name.includes(t));
    }

    // ─── Error history ────────────────────────────────────────────────────────

    _record(opName, error, context = {}) {
        this._history.unshift({
            timestamp: Date.now(),
            operation: opName,
            message:   error.message,
            type:      error.name,
            transient: this._isTransient(error),
            context,
        });

        if (this._history.length > ErrorRecovery.MAX_HISTORY) {
            this._history.length = ErrorRecovery.MAX_HISTORY;
        }
    }

    getErrorStats(opName = null, windowMs = 300_000) {
        const cutoff  = Date.now() - windowMs;
        const entries = this._history.filter(e =>
            e.timestamp >= cutoff && (!opName || e.operation === opName)
        );
        return {
            total:     entries.length,
            transient: entries.filter(e =>  e.transient).length,
            permanent: entries.filter(e => !e.transient).length,
            byType:    entries.reduce((acc, e) => {
                acc[e.type] = (acc[e.type] || 0) + 1;
                return acc;
            }, {}),
        };
    }

    // ─── Core retry engine ────────────────────────────────────────────────────

    /**
     * Run `operation` (a zero-arg async factory) with automatic retry,
     * exponential back-off, and circuit-breaker integration.
     *
     * Returns { success, result?, error?, retriesExhausted?, circuitOpen? }
     */
    async retryOperation(operation, opName, context = {}) {
        if (!this._cbAllow(opName)) {
            return { success: false, error: new Error('Circuit breaker is open'), circuitOpen: true };
        }

        const timeout = context.timeout ?? 30_000;
        let attempt   = 0;  // local — no instance state stomping

        while (attempt < ErrorRecovery.MAX_RETRIES) {
            try {
                const result = await this._withTimeout(operation(), timeout, opName);
                this._cbOnSuccess();
                this._log(`✅ "${opName}" succeeded (attempt ${attempt + 1})`, 'success');
                return { success: true, result };

            } catch (err) {
                attempt++;
                this._record(opName, err, context);

                const retryable = this._isTransient(err) || context.retryOnError?.(err) === true;

                this._log(
                    `⚠️ "${opName}" failed (attempt ${attempt}/${ErrorRecovery.MAX_RETRIES}): ${err.message}`,
                    'warning'
                );

                if (!retryable) {
                    this._cbOnFailure(opName);
                    return { success: false, error: err, retryable: false };
                }

                if (attempt >= ErrorRecovery.MAX_RETRIES) {
                    this._cbOnFailure(opName);
                    return { success: false, error: err, retriesExhausted: true };
                }

                // Exponential back-off with ±30 % jitter
                const base  = ErrorRecovery.BASE_RETRY_DELAY * 2 ** (attempt - 1);
                const jitter = (Math.random() * 0.6 - 0.3) * base;
                const delay  = Math.min(base + jitter, ErrorRecovery.MAX_RETRY_DELAY);

                this._log(`🔁 Retrying "${opName}" in ${Math.round(delay)} ms…`, 'info');
                await this._sleep(delay);
            }
        }

        // Unreachable, but keeps TypeScript / linters happy
        return { success: false, error: new Error('Retry loop exited unexpectedly') };
    }

    _withTimeout(promise, ms, opName) {
        return new Promise((resolve, reject) => {
            const id = setTimeout(
                () => reject(new Error(`"${opName}" timed out after ${ms} ms`)),
                ms
            );
            promise.then(
                v  => { clearTimeout(id); resolve(v); },
                e  => { clearTimeout(id); reject(e);  }
            );
        });
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Audio error handling ─────────────────────────────────────────────────

    handleAudioError(audioElement, trackInfo) {
        const error = audioElement.error;
        if (!error) {
            this._log('handleAudioError called with no error on element', 'warning');
            return { errorMessage: 'No error', hasRecovery: false };
        }

        let message;
        let type;
        let retryable    = false;
        let recoveryFn   = null;

        switch (error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
                message   = 'Playback aborted by user';
                type      = 'aborted';
                break;

            case MediaError.MEDIA_ERR_NETWORK:
                message   = 'Network error while loading audio';
                type      = 'network';
                retryable = true;
                recoveryFn = () => this._retryLoad(audioElement, trackInfo);
                break;

            case MediaError.MEDIA_ERR_DECODE:
                message    = 'Audio file is corrupted or unsupported format';
                type       = 'decode';
                recoveryFn = () => this._skipToNext(trackInfo);
                break;

            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                message    = 'Audio format not supported';
                type       = 'unsupported';
                recoveryFn = () => this._skipToNext(trackInfo);
                break;

            default:
                message    = `Unknown media error (code ${error.code})`;
                type       = 'unknown';
                retryable  = true;
                recoveryFn = () => this._retryLoad(audioElement, trackInfo);
        }

        this._record('audioPlayback', { name: type, message, code: error.code }, { trackInfo });
        this._log(`❌ Audio error [${type}]: ${message}`, 'error');

        if (recoveryFn) {
            this._log('🔧 Attempting automatic recovery…', 'info');
            Promise.resolve(recoveryFn()).catch(e => {
                this._log(`❌ Recovery failed: ${e.message}`, 'error');
            });
        }

        return { errorMessage: message, errorType: type, hasRecovery: !!recoveryFn, retryable, errorCode: error.code };
    }

    async _retryLoad(audioElement, trackInfo = {}) {
        if (!audioElement?.src) {
            this._log('Cannot retry: missing audio src', 'error');
            return false;
        }

        const src = audioElement.src;

        const result = await this.retryOperation(async () => {
            audioElement.removeAttribute('src');
            audioElement.load();
            await this._sleep(500);

            audioElement.src = src;
            audioElement.load();

            await new Promise((resolve, reject) => {
                const id = setTimeout(() => {
                    cleanup();
                    reject(new Error('Audio load timed out'));
                }, 10_000);

                const onCanPlay = () => { cleanup(); resolve(); };
                const onError   = () => { cleanup(); reject(new Error('Audio element error on reload')); };
                const cleanup   = () => {
                    clearTimeout(id);
                    audioElement.removeEventListener('canplay', onCanPlay);
                    audioElement.removeEventListener('error',   onError);
                };

                audioElement.addEventListener('canplay', onCanPlay, { once: true });
                audioElement.addEventListener('error',   onError,   { once: true });
            });

            await audioElement.play();
        }, 'audioReload', { timeout: 15_000 });

        if (!result.success) {
            this._log(`❌ Reload failed: ${result.error?.message}`, 'error');
            if (result.retriesExhausted) this._skipToNext(trackInfo);
            return false;
        }

        return true;
    }

    _skipToNext(trackInfo) {
        const name = trackInfo?.name ?? trackInfo?.title ?? 'unknown';
        this._log(`⏭️ Skipping problematic track: ${name}`, 'warning');

        const btn = document.getElementById('next-button');
        if (!btn || btn.disabled) {
            this._log('Next button not available — cannot skip', 'warning');
            return false;
        }

        try {
            btn.click();
            return true;
        } catch (e) {
            this._log(`❌ Skip failed: ${e.message}`, 'error');
            return false;
        }
    }

    // ─── Storage error handling ───────────────────────────────────────────────

    handleStorageError(error, operation) {
        this._log(`❌ Storage error in "${operation}": ${error.message}`, 'error');
        this._record(operation, error, { type: 'storage' });

        const response = { recovery: 'none', message: error.message, retryable: false, action: null };

        if (error.name === 'QuotaExceededError') {
            response.recovery  = 'clearOldData';
            response.message   = 'Storage full — please free up space';
            response.retryable = true;
            response.action    = () => window.dispatchEvent(new CustomEvent('storageCleanupNeeded'));

        } else if (error.name === 'NotFoundError') {
            response.recovery = 'ignore';
            response.message  = 'Item not found in storage';

        } else if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
            response.recovery = 'checkPermissions';
            response.message  = 'Storage access denied — check browser settings';

        } else if (error.name === 'DataError' || error.message.includes('corrupt')) {
            response.recovery  = 'clearCorruptData';
            response.message   = 'Storage data corrupted';
            response.retryable = true;
            response.action    = () => window.dispatchEvent(
                new CustomEvent('storageRecoveryNeeded', { detail: { operation } })
            );

        } else if (this._isTransient(error)) {
            response.recovery  = 'retry';
            response.message   = 'Temporary storage issue';
            response.retryable = true;
        }

        return response;
    }

    // ─── Health / stats ───────────────────────────────────────────────────────

    getHealthStatus() {
        const stats = this.getErrorStats();
        return {
            circuitBreaker: {
                state:   this._cb.state,
                failures:this._cb.failures,
                healthy: this._cb.state === 'closed',
            },
            errors: {
                recentTotal: stats.total,
                transient:   stats.transient,
                permanent:   stats.permanent,
                byType:      stats.byType,
            },
            network: {
                online: this.isOnline,
            },
            overall: this._cb.state === 'closed' && stats.permanent < 3 ? 'healthy' : 'degraded',
        };
    }

    reset() {
        this._history     = [];
        this._cb.state    = 'closed';
        this._cb.failures = 0;
        this._cb.lastFailureTime = null;
        this._log('🔄 ErrorRecovery reset', 'info');
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        if (!this._alive) return;
        this._alive = false;

        this._listeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this._listeners = [];

        this._history = [];
        this._log('✅ ErrorRecovery destroyed', 'info');
    }
}

window.ErrorRecovery = ErrorRecovery;
