/* ============================================
   Error Recovery System - Enhanced Version
   ============================================ */

class ErrorRecovery {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // Start with 1 second
        this.maxRetryDelay = 10000; // Max 10 seconds
        
        // Circuit breaker pattern
        this.circuitBreaker = {
            failures: 0,
            threshold: 5,
            resetTimeout: 60000, // 1 minute
            state: 'closed', // closed, open, half-open
            lastFailureTime: null
        };
        
        // Error tracking and statistics
        this.errorHistory = [];
        this.maxHistorySize = 50;
        this.operationTimeouts = new Map();
        
        // Online/offline state management
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.setupNetworkListeners();
    }
    
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.debugLog('Network connection restored', 'success');
            this.processPendingOperations();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.debugLog('Network connection lost', 'warning');
        });
    }
    
    async processPendingOperations() {
        if (this.pendingOperations.length === 0) return;
        
        this.debugLog(`Processing ${this.pendingOperations.length} pending operations`, 'info');
        const operations = [...this.pendingOperations];
        this.pendingOperations = [];
        
        for (const op of operations) {
            try {
                await op.operation();
                if (op.onSuccess) op.onSuccess();
            } catch (error) {
                this.debugLog(`Pending operation failed: ${error.message}`, 'error');
                if (op.onError) op.onError(error);
            }
        }
    }
    
    checkCircuitBreaker(operationName) {
        const cb = this.circuitBreaker;
        
        // Reset if enough time has passed
        if (cb.state === 'open' && cb.lastFailureTime) {
            if (Date.now() - cb.lastFailureTime > cb.resetTimeout) {
                this.debugLog(`Circuit breaker entering half-open state for ${operationName}`, 'info');
                cb.state = 'half-open';
                cb.failures = 0;
            }
        }
        
        if (cb.state === 'open') {
            this.debugLog(`Circuit breaker is open for ${operationName}, rejecting operation`, 'error');
            return false;
        }
        
        return true;
    }
    
    recordCircuitBreakerFailure(operationName) {
        const cb = this.circuitBreaker;
        cb.failures++;
        cb.lastFailureTime = Date.now();
        
        if (cb.failures >= cb.threshold) {
            cb.state = 'open';
            this.debugLog(
                `Circuit breaker opened after ${cb.failures} failures for ${operationName}`,
                'error'
            );
        }
    }
    
    recordCircuitBreakerSuccess() {
        const cb = this.circuitBreaker;
        if (cb.state === 'half-open') {
            cb.state = 'closed';
            cb.failures = 0;
            this.debugLog('Circuit breaker closed after successful operation', 'success');
        } else if (cb.state === 'closed' && cb.failures > 0) {
            cb.failures = Math.max(0, cb.failures - 1);
        }
    }
    
    isTransientError(error) {
        const transientErrors = [
            'NetworkError',
            'TimeoutError',
            'ETIMEDOUT',
            'ECONNRESET',
            'ECONNREFUSED',
            'MEDIA_ERR_NETWORK'
        ];
        
        return transientErrors.some(type => 
            error.message?.includes(type) || 
            error.name?.includes(type) ||
            error.code?.toString().includes(type)
        );
    }
    
    recordError(operationName, error, context) {
        const errorRecord = {
            timestamp: Date.now(),
            operation: operationName,
            message: error.message,
            type: error.name,
            context,
            transient: this.isTransientError(error)
        };
        
        this.errorHistory.unshift(errorRecord);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.pop();
        }

        // Notify user of significant errors
        if (window.uiManager && !errorRecord.transient) {
            window.uiManager.notify(`Error in ${operationName}: ${error.message}`, 'error');
        } else if (window.uiManager && errorRecord.transient) {
            window.uiManager.notify(`Temporary issue: ${error.message}. Retrying...`, 'warning');
        }
    }
    
    getErrorStats(operationName = null, timeWindow = 300000) {
        const now = Date.now();
        const recentErrors = this.errorHistory.filter(e => 
            now - e.timestamp < timeWindow &&
            (!operationName || e.operation === operationName)
        );
        
        return {
            total: recentErrors.length,
            transient: recentErrors.filter(e => e.transient).length,
            permanent: recentErrors.filter(e => !e.transient).length,
            byType: recentErrors.reduce((acc, e) => {
                acc[e.type] = (acc[e.type] || 0) + 1;
                return acc;
            }, {})
        };
    }
    
    async retryOperation(operation, operationName, context = {}) {
        // Check circuit breaker
        if (!this.checkCircuitBreaker(operationName)) {
            return { 
                success: false, 
                error: new Error('Circuit breaker is open'), 
                context,
                circuitBreakerOpen: true
            };
        }
        
        // Check if offline and operation requires network
        if (!this.isOnline && context.requiresNetwork !== false) {
            this.debugLog(`${operationName} requires network but device is offline`, 'warning');
            
            if (context.queueWhenOffline) {
                this.pendingOperations.push({
                    operation,
                    onSuccess: context.onSuccess,
                    onError: context.onError
                });
                return { success: false, error: new Error('Queued for retry when online'), queued: true };
            }
            
            return { success: false, error: new Error('Device is offline'), context };
        }
        
        this.retryCount = 0;
        const startTime = Date.now();
        const timeout = context.timeout || 30000; // 30 second default timeout
        
        while (this.retryCount < this.maxRetries) {
            try {
                // Wrap operation with timeout
                const result = await this.withTimeout(operation(), timeout, operationName);
                
                this.retryCount = 0; // Reset on success
                this.recordCircuitBreakerSuccess();
                
                const duration = Date.now() - startTime;
                this.debugLog(`${operationName} succeeded in ${duration}ms`, 'success');
                
                return { success: true, result, duration };
            } catch (error) {
                this.retryCount++;
                this.recordError(operationName, error, context);
                
                // Check if error is retryable
                const isRetryable = this.isTransientError(error) || context.retryOnError?.(error);
                
                this.debugLog(
                    `${operationName} failed (attempt ${this.retryCount}/${this.maxRetries}): ${error.message}`,
                    'warning'
                );
                
                if (!isRetryable) {
                    this.debugLog(`${operationName} failed with non-retryable error`, 'error');
                    this.recordCircuitBreakerFailure(operationName);
                    return { success: false, error, context, retryable: false };
                }
                
                if (this.retryCount >= this.maxRetries) {
                    this.debugLog(`${operationName} failed after ${this.maxRetries} attempts`, 'error');
                    this.recordCircuitBreakerFailure(operationName);
                    return { success: false, error, context, retriesExhausted: true };
                }
                
                // Exponential backoff with jitter
                const baseDelay = this.retryDelay * Math.pow(2, this.retryCount - 1);
                const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
                const delay = Math.min(baseDelay + jitter, this.maxRetryDelay);
                
                this.debugLog(`Retrying ${operationName} in ${Math.round(delay)}ms...`, 'info');
                await this.sleep(delay);
            }
        }
    }
    
    async withTimeout(promise, timeoutMs, operationName) {
        let timeoutId;
        
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Operation ${operationName} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        
        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    handleAudioError(audioElement, trackInfo) {
        const error = audioElement.error;
        if (!error) {
            this.debugLog('handleAudioError called but no error present', 'warning');
            return { errorMessage: 'No error', hasRecovery: false };
        }
        
        let errorMessage = 'Unknown audio error';
        let recoveryAction = null;
        let errorType = 'unknown';
        let isRetryable = false;
        
        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                errorMessage = 'Playback aborted by user';
                errorType = 'aborted';
                isRetryable = false;
                break;
            case error.MEDIA_ERR_NETWORK:
                errorMessage = 'Network error while loading audio';
                errorType = 'network';
                isRetryable = true;
                recoveryAction = () => this.retryLoad(audioElement, trackInfo);
                break;
            case error.MEDIA_ERR_DECODE:
                errorMessage = 'Audio file is corrupted or unsupported format';
                errorType = 'decode';
                isRetryable = false;
                recoveryAction = () => this.skipToNext(trackInfo);
                break;
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage = 'Audio format not supported by browser';
                errorType = 'unsupported';
                isRetryable = false;
                recoveryAction = () => this.skipToNext(trackInfo);
                break;
            default:
                errorMessage = `Unknown media error (code: ${error.code})`;
                errorType = 'unknown';
                isRetryable = true;
                recoveryAction = () => this.retryLoad(audioElement, trackInfo);
        }
        
        // Record error for statistics
        this.recordError('audioPlayback', { 
            name: errorType, 
            message: errorMessage,
            code: error.code
        }, { trackInfo });
        
        this.debugLog(`Audio error: ${errorMessage} (${errorType})`, 'error');
        
        if (recoveryAction) {
            this.debugLog('Attempting automatic recovery...', 'info');
            
            // Execute recovery action asynchronously and handle errors
            Promise.resolve(recoveryAction()).catch(recoveryError => {
                this.debugLog(`Recovery action failed: ${recoveryError.message}`, 'error');
            });
        }
        
        return { 
            errorMessage, 
            errorType,
            hasRecovery: !!recoveryAction,
            isRetryable,
            errorCode: error.code
        };
    }
    
    async retryLoad(audioElement, trackInfo = {}) {
        if (!audioElement || !audioElement.src) {
            this.debugLog('Cannot retry load: invalid audio element or missing src', 'error');
            return false;
        }
        
        const src = audioElement.src;
        const maxLoadRetries = 2;
        
        return await this.retryOperation(
            async () => {
                // Clear current source and force reload
                audioElement.removeAttribute('src');
                audioElement.load();
                
                await this.sleep(500);
                
                // Restore source
                audioElement.src = src;
                audioElement.load();
                
                // Wait for the audio to be ready
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        cleanup();
                        reject(new Error('Audio load timeout'));
                    }, 10000);
                    
                    const onCanPlay = () => {
                        cleanup();
                        resolve();
                    };
                    
                    const onError = (e) => {
                        cleanup();
                        reject(new Error(`Audio load failed: ${e.message || 'unknown error'}`));
                    };
                    
                    const cleanup = () => {
                        clearTimeout(timeout);
                        audioElement.removeEventListener('canplay', onCanPlay);
                        audioElement.removeEventListener('error', onError);
                    };
                    
                    audioElement.addEventListener('canplay', onCanPlay, { once: true });
                    audioElement.addEventListener('error', onError, { once: true });
                });
                
                // Attempt to play
                await audioElement.play();
                
                this.debugLog(`Audio reload successful for: ${trackInfo.name || 'unknown track'}`, 'success');
                return true;
            },
            'audioReload',
            { 
                timeout: 15000,
                requiresNetwork: true,
                trackInfo 
            }
        ).then(result => {
            if (result.success) {
                return true;
            } else {
                this.debugLog(`Reload failed after retries: ${result.error?.message}`, 'error');
                
                // If reload failed, try skipping to next track
                if (result.retriesExhausted) {
                    this.skipToNext(trackInfo);
                }
                
                return false;
            }
        });
    }
    
    skipToNext(trackInfo) {
        const trackName = trackInfo?.name || trackInfo?.title || 'unknown track';
        this.debugLog(`Skipping problematic track: ${trackName}`, 'warning');
        
        const nextButton = document.getElementById('next-button');
        if (!nextButton) {
            this.debugLog('Next button not found in DOM', 'error');
            return false;
        }
        
        if (nextButton.disabled) {
            this.debugLog('Next button is disabled, cannot skip', 'warning');
            return false;
        }
        
        try {
            nextButton.click();
            this.debugLog('Successfully skipped to next track', 'success');
            return true;
        } catch (error) {
            this.debugLog(`Failed to skip track: ${error.message}`, 'error');
            return false;
        }
    }
    
    handleStorageError(error, operation) {
        this.debugLog(`Storage error during ${operation}: ${error.message}`, 'error');
        this.recordError(operation, error, { type: 'storage' });
        
        const response = {
            recovery: 'none',
            message: error.message,
            retryable: false,
            action: null
        };
        
        // Quota exceeded - storage is full
        if (error.name === 'QuotaExceededError') {
            this.debugLog('Storage quota exceeded. Consider clearing old data.', 'warning');
            response.recovery = 'clearOldData';
            response.message = 'Storage is full - please free up space';
            response.retryable = true;
            response.action = () => this.suggestStorageCleanup();
        }
        // Key not found - usually not critical
        else if (error.name === 'NotFoundError') {
            this.debugLog('Storage key not found. This is usually not critical.', 'info');
            response.recovery = 'ignore';
            response.message = 'Data not found in storage';
            response.retryable = false;
        }
        // Security or permission error
        else if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
            this.debugLog('Storage access denied. Check browser permissions.', 'error');
            response.recovery = 'checkPermissions';
            response.message = 'Storage access denied - check browser settings';
            response.retryable = false;
        }
        // Data corrupted
        else if (error.name === 'DataError' || error.message.includes('corrupt')) {
            this.debugLog('Storage data appears corrupted', 'error');
            response.recovery = 'clearCorruptData';
            response.message = 'Storage data is corrupted';
            response.retryable = true;
            response.action = () => this.attemptStorageRecovery(operation);
        }
        // Network or timeout related
        else if (error.name === 'TimeoutError' || this.isTransientError(error)) {
            this.debugLog('Transient storage error detected', 'warning');
            response.recovery = 'retry';
            response.message = 'Temporary storage issue';
            response.retryable = true;
        }
        
        return response;
    }
    
    suggestStorageCleanup() {
        this.debugLog('Storage cleanup recommended:', 'info');
        this.debugLog('1. Clear browser cache', 'info');
        this.debugLog('2. Remove old/unused data', 'info');
        this.debugLog('3. Check available disk space', 'info');
        
        // Could trigger a UI event here if needed
        window.dispatchEvent(new CustomEvent('storageCleanupNeeded', {
            detail: { errorHistory: this.errorHistory }
        }));
    }
    
    attemptStorageRecovery(operation) {
        this.debugLog(`Attempting to recover from storage error in ${operation}`, 'info');
        
        // Could implement more sophisticated recovery here
        // For now, just log and suggest manual intervention
        window.dispatchEvent(new CustomEvent('storageRecoveryNeeded', {
            detail: { operation, timestamp: Date.now() }
        }));
    }
    
    async handleNetworkError(error, resource, options = {}) {
        this.debugLog(`Network error loading ${resource}: ${error.message}`, 'error');
        this.recordError('networkLoad', error, { resource });
        
        const {
            maxWaitTime = 30000,
            checkInterval = 5000,
            retryOnReconnect = true
        } = options;
        
        // If we're offline, wait for connection
        if (!this.isOnline || !navigator.onLine) {
            this.debugLog('Device is offline. Waiting for connection...', 'warning');
            
            const reconnected = await this.waitForConnection(maxWaitTime, checkInterval);
            
            if (reconnected && retryOnReconnect) {
                this.debugLog(`Connection restored, retrying ${resource}`, 'info');
                return { reconnected: true, shouldRetry: true };
            }
            
            return { reconnected, shouldRetry: false };
        }
        
        // Check if it's a server error (5xx) that might be temporary
        if (error.message.includes('50') || error.message.includes('503') || error.message.includes('502')) {
            this.debugLog('Server error detected, may be temporary', 'warning');
            return { serverError: true, shouldRetry: true };
        }
        
        // Check if it's a rate limiting error (429)
        if (error.message.includes('429') || error.message.includes('rate limit')) {
            this.debugLog('Rate limit error detected, backing off', 'warning');
            return { rateLimited: true, shouldRetry: true, backoffTime: 60000 };
        }
        
        // For other network errors while online, might be DNS or connection issue
        return { networkIssue: true, shouldRetry: this.isTransientError(error) };
    }
    
    async waitForConnection(maxWaitTime = 30000, checkInterval = 5000) {
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            // Handler for online event
            const onlineHandler = () => {
                cleanup();
                this.debugLog('Connection restored via online event', 'success');
                resolve(true);
            };
            
            // Periodic check in case online event doesn't fire
            const checkConnection = setInterval(() => {
                const elapsed = Date.now() - startTime;
                
                if (navigator.onLine && this.isOnline) {
                    cleanup();
                    this.debugLog('Connection restored via periodic check', 'success');
                    resolve(true);
                    return;
                }
                
                if (elapsed >= maxWaitTime) {
                    cleanup();
                    this.debugLog(`Connection wait timeout after ${maxWaitTime}ms`, 'error');
                    resolve(false);
                    return;
                }
                
                const remaining = Math.round((maxWaitTime - elapsed) / 1000);
                this.debugLog(`Still offline, waiting... (${remaining}s remaining)`, 'info');
            }, checkInterval);
            
            const cleanup = () => {
                window.removeEventListener('online', onlineHandler);
                clearInterval(checkConnection);
            };
            
            window.addEventListener('online', onlineHandler);
        });
    }
    
    // Get health status of the error recovery system
    getHealthStatus() {
        const stats = this.getErrorStats();
        const cb = this.circuitBreaker;
        
        return {
            circuitBreaker: {
                state: cb.state,
                failures: cb.failures,
                threshold: cb.threshold,
                healthy: cb.state === 'closed'
            },
            errors: {
                recentTotal: stats.total,
                transient: stats.transient,
                permanent: stats.permanent,
                byType: stats.byType
            },
            network: {
                online: this.isOnline,
                pendingOperations: this.pendingOperations.length
            },
            overall: cb.state === 'closed' && stats.permanent < 3 ? 'healthy' : 'degraded'
        };
    }
    
    // Reset error recovery state (useful for testing or after major issues)
    reset() {
        this.retryCount = 0;
        this.errorHistory = [];
        this.circuitBreaker = {
            failures: 0,
            threshold: 5,
            resetTimeout: 60000,
            state: 'closed',
            lastFailureTime: null
        };
        this.pendingOperations = [];
        this.debugLog('Error recovery system reset', 'info');
    }
    
    // Cleanup method for proper disposal
    destroy() {
        // Clear any pending operations
        this.pendingOperations = [];
        
        // Clear timeouts
        this.operationTimeouts.forEach(timeout => clearTimeout(timeout));
        this.operationTimeouts.clear();
        
        // Note: We don't remove the global event listeners as they're passive
        // and removing them could affect other parts of the system
        
        this.debugLog('Error recovery system destroyed', 'info');
    }
}

window.ErrorRecovery = ErrorRecovery;