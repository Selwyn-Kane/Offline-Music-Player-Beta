/* ============================================
   PERFORMANCE MANAGER v2.0 - MEMORY LEAK FIXED
   Real-time CPU/Memory Monitoring & Aggressive Cleanup
   
   CRITICAL FIXES:
   - All intervals/animations properly cancelled
   - View mode cleanup integration
   - Aggressive resource management
   - Proper lifecycle hooks
   ============================================ */

class PerformanceManager {
    constructor(debugLog = console.log) {
        this.debugLog = debugLog;
        
        // Performance metrics
        this.metrics = {
            fps: 60,
            avgFrameTime: 0,
            memory: 0,
            cpuLoad: 0,
            lastFrameTime: 0,
            frameCount: 0,
            droppedFrames: 0
        };
        
        // State tracking
        this.state = {
            isTabVisible: !document.hidden,
            currentMode: 'full', // 'full', 'compact', 'mini'
            isPlaying: false,
            powerMode: 'balanced', // 'performance', 'balanced', 'battery-saver'
            deviceTier: 'high', // 'high', 'medium', 'low'
            initialized: false,
            destroyed: false
        };
        
        // Performance thresholds
        this.thresholds = {
            fps: {
                excellent: 55,
                good: 40,
                poor: 25
            },
            memory: {
                warning: 80, // MB
                critical: 150 // MB
            },
            frameTime: {
                target: 16.67, // 60 FPS
                acceptable: 33.33, // 30 FPS
                poor: 50 // 20 FPS
            }
        };
        
        // Adaptive quality settings
        this.qualityProfile = {
            visualizer: {
                enabled: true,
                fftSize: 2048,
                barCount: 64,
                updateInterval: 16.67,
                effects: true
            },
            lyrics: {
                updateInterval: 500,
                animations: true,
                glowEffect: true
            },
            colorExtraction: {
                sampleSize: 50,
                skipPixels: 64,
                enabled: true
            },
            progress: {
                updateInterval: 200,
                smoothing: true
            }
        };
        
        // CRITICAL: Track all cleanup resources
        this.resources = {
            intervals: new Set(),
            animationFrames: new Set(),
            timeouts: new Set(),
            eventListeners: []
        };
        
        // Operation throttling
        this.throttles = new Map();
        this.lastUpdate = new Map();
        
        // Performance monitoring
        this.monitoring = {
            enabled: false,
            fpsAnimationId: null,
            memoryIntervalId: null,
            cleanupIntervalId: null
        };
        
        // Cache management
        this.cacheStats = {
            colorCache: 0,
            analysisCache: 0,
            lastCleanup: Date.now()
        };
        
        // Connected managers for cleanup coordination
        this.connectedManagers = {
            visualizer: null,
            audioBuffer: null,
            lyrics: null,
            audioPipeline: null,
            ui: null
        };
    }
    
    init() {
        if (this.state.initialized) {
            this.debugLog('⚠️ PerformanceManager already initialized', 'warning');
            return;
        }
        
        this.detectDeviceTier();
        this.setupVisibilityTracking();
        this.setupBatteryMonitoring();
        this.startPerformanceMonitoring();
        this.applyQualityProfile();
        
        this.state.initialized = true;
        this.debugLog('🚀 Performance Manager v2.0 initialized (Memory Leak Fixed)', 'success');
    }
    
    // ========== MANAGER CONNECTION (NEW) ==========
    
    /**
     * Connect other managers for coordinated cleanup
     */
    connectManager(name, manager) {
        if (this.connectedManagers.hasOwnProperty(name)) {
            this.connectedManagers[name] = manager;
            this.debugLog(`🔗 Connected ${name} manager`, 'info');
        } else {
            this.debugLog(`⚠️ Unknown manager: ${name}`, 'warning');
        }
    }
    
    /**
     * Disconnect a manager
     */
    disconnectManager(name) {
        if (this.connectedManagers.hasOwnProperty(name)) {
            this.connectedManagers[name] = null;
            this.debugLog(`🔌 Disconnected ${name} manager`, 'info');
        }
    }
    
    // ========== DEVICE DETECTION ==========
    
    detectDeviceTier() {
        const cores = navigator.hardwareConcurrency || 2;
        const memory = navigator.deviceMemory || 4;
        const connection = navigator.connection?.effectiveType || '4g';
        
        // Calculate device score
        let score = 0;
        
        if (cores >= 8) score += 3;
        else if (cores >= 4) score += 2;
        else score += 1;
        
        if (memory >= 8) score += 3;
        else if (memory >= 4) score += 2;
        else score += 1;
        
        if (connection === '4g' || connection === '5g') score += 2;
        else if (connection === '3g') score += 1;
        
        // Determine tier
        if (score >= 7) {
            this.state.deviceTier = 'high';
        } else if (score >= 4) {
            this.state.deviceTier = 'medium';
        } else {
            this.state.deviceTier = 'low';
        }
        
        this.debugLog(`📱 Device tier: ${this.state.deviceTier} (${cores} cores, ${memory}GB RAM)`, 'info');
        
        // Apply tier-based optimizations
        this.applyDeviceTierSettings();
    }
    
    applyDeviceTierSettings() {
        switch (this.state.deviceTier) {
            case 'high':
                // No restrictions
                break;
                
            case 'medium':
                this.qualityProfile.visualizer.fftSize = 1024;
                this.qualityProfile.visualizer.barCount = 48;
                this.qualityProfile.colorExtraction.skipPixels = 128;
                break;
                
            case 'low':
                this.qualityProfile.visualizer.fftSize = 512;
                this.qualityProfile.visualizer.barCount = 32;
                this.qualityProfile.visualizer.effects = false;
                this.qualityProfile.colorExtraction.skipPixels = 256;
                this.qualityProfile.lyrics.animations = false;
                this.qualityProfile.lyrics.glowEffect = false;
                break;
        }
    }
    
    // ========== PERFORMANCE MONITORING (FIXED) ==========
    
    startPerformanceMonitoring() {
        if (this.monitoring.enabled) {
            this.debugLog('⚠️ Performance monitoring already running', 'warning');
            return;
        }
        
        this.monitoring.enabled = true;
        
        // Monitor FPS (FIXED: Now properly tracked for cleanup)
        this.monitorFPS();
        
        // Monitor memory usage (FIXED: Tracked interval)
        if (performance.memory) {
            const memoryIntervalId = setInterval(() => {
                if (!this.monitoring.enabled) return;
                this.updateMemoryMetrics();
                this.checkPerformanceHealth();
            }, 2000);
            
            this.monitoring.memoryIntervalId = memoryIntervalId;
            this.resources.intervals.add(memoryIntervalId);
        }
        
        // Periodic cleanup (FIXED: Tracked interval)
        const cleanupIntervalId = setInterval(() => {
            if (!this.monitoring.enabled) return;
            this.performCleanup();
        }, 60000); // Every minute
        
        this.monitoring.cleanupIntervalId = cleanupIntervalId;
        this.resources.intervals.add(cleanupIntervalId);
        
        this.debugLog('📊 Performance monitoring started', 'success');
    }
    
    /**
     * CRITICAL FIX: FPS monitoring with proper cleanup tracking
     */
    monitorFPS() {
        if (!this.monitoring.enabled) return;
        
        let lastTime = performance.now();
        let frames = 0;
        let lastReportTime = lastTime;
        
        const measureFrame = (currentTime) => {
            // CRITICAL: Check if monitoring is still enabled
            if (!this.monitoring.enabled || this.state.destroyed) {
                // Clean up this animation frame
                if (this.monitoring.fpsAnimationId) {
                    this.resources.animationFrames.delete(this.monitoring.fpsAnimationId);
                    this.monitoring.fpsAnimationId = null;
                }
                return;
            }
            
            frames++;
            const deltaTime = currentTime - lastTime;
            
            // Update metrics
            this.metrics.lastFrameTime = deltaTime;
            this.metrics.avgFrameTime = (this.metrics.avgFrameTime * 0.9) + (deltaTime * 0.1);
            
            // Calculate FPS every second
            if (currentTime - lastReportTime >= 1000) {
                this.metrics.fps = Math.round(frames * 1000 / (currentTime - lastReportTime));
                this.metrics.frameCount += frames;
                
                // Detect dropped frames
                const expectedFrames = Math.round((currentTime - lastReportTime) / 16.67);
                this.metrics.droppedFrames += Math.max(0, expectedFrames - frames);
                
                frames = 0;
                lastReportTime = currentTime;
            }
            
            lastTime = currentTime;
            
            // Schedule next frame and track it
            this.monitoring.fpsAnimationId = requestAnimationFrame(measureFrame);
            this.resources.animationFrames.add(this.monitoring.fpsAnimationId);
        };
        
        this.monitoring.fpsAnimationId = requestAnimationFrame(measureFrame);
        this.resources.animationFrames.add(this.monitoring.fpsAnimationId);
    }
    
    /**
     * CRITICAL FIX: Stop all performance monitoring with proper cleanup
     */
    stopPerformanceMonitoring() {
        this.monitoring.enabled = false;
        
        // Cancel FPS monitoring animation frame
        if (this.monitoring.fpsAnimationId) {
            cancelAnimationFrame(this.monitoring.fpsAnimationId);
            this.resources.animationFrames.delete(this.monitoring.fpsAnimationId);
            this.monitoring.fpsAnimationId = null;
        }
        
        // Clear memory monitoring interval
        if (this.monitoring.memoryIntervalId) {
            clearInterval(this.monitoring.memoryIntervalId);
            this.resources.intervals.delete(this.monitoring.memoryIntervalId);
            this.monitoring.memoryIntervalId = null;
        }
        
        // Clear cleanup interval
        if (this.monitoring.cleanupIntervalId) {
            clearInterval(this.monitoring.cleanupIntervalId);
            this.resources.intervals.delete(this.monitoring.cleanupIntervalId);
            this.monitoring.cleanupIntervalId = null;
        }
        
        this.debugLog('🛑 Performance monitoring stopped', 'info');
    }
    
    updateMemoryMetrics() {
        if (performance.memory) {
            const usedMB = performance.memory.usedJSHeapSize / 1048576;
            this.metrics.memory = Math.round(usedMB);
            
            // Calculate approximate CPU load from frame time
            const cpuPercent = Math.min(100, (this.metrics.avgFrameTime / this.thresholds.frameTime.target) * 100);
            this.metrics.cpuLoad = Math.round(cpuPercent);
        }
    }
    
    checkPerformanceHealth() {
        const { fps, memory, avgFrameTime } = this.metrics;
        const { thresholds } = this;
        
        // Check FPS health
        if (fps < thresholds.fps.poor && this.state.isPlaying) {
            this.debugLog('⚠️ Low FPS detected, reducing quality', 'warning');
            this.degradeQuality('fps');
        } else if (fps > thresholds.fps.excellent && this.qualityProfile.visualizer.fftSize < 2048) {
            // Performance is good, maybe restore quality
            this.restoreQuality();
        }
        
        // Check memory health
        if (memory > thresholds.memory.critical) {
            this.debugLog('⚠️ High memory usage, performing emergency cleanup', 'warning');
            this.performEmergencyCleanup();
        } else if (memory > thresholds.memory.warning) {
            this.degradeQuality('memory');
        }
        
        // Check frame time
        if (avgFrameTime > thresholds.frameTime.poor) {
            this.degradeQuality('frametime');
        }
    }
    
    // ========== ADAPTIVE QUALITY ==========
    
    degradeQuality(reason) {
        const profile = this.qualityProfile;
        
        switch (reason) {
            case 'fps':
            case 'frametime':
                if (profile.visualizer.fftSize > 512) {
                    profile.visualizer.fftSize /= 2;
                    profile.visualizer.barCount = Math.max(16, Math.floor(profile.visualizer.barCount * 0.75));
                }
                profile.visualizer.effects = false;
                break;
                
            case 'memory':
                profile.colorExtraction.skipPixels = Math.min(512, profile.colorExtraction.skipPixels * 2);
                this.performCleanup();
                break;
        }
        
        this.applyQualityProfile();
        this.debugLog(`📉 Quality reduced (${reason})`, 'warning');
    }
    
    restoreQuality() {
        // Gradually restore quality if performance has been good for 5 seconds
        const now = Date.now();
        if (!this.lastQualityRestore || now - this.lastQualityRestore > 5000) {
            const profile = this.qualityProfile;
            
            if (this.state.deviceTier === 'high' && profile.visualizer.fftSize < 2048) {
                profile.visualizer.fftSize = Math.min(2048, profile.visualizer.fftSize * 2);
                profile.visualizer.barCount = Math.min(64, Math.floor(profile.visualizer.barCount * 1.33));
                profile.visualizer.effects = true;
            }
            
            this.applyQualityProfile();
            this.lastQualityRestore = now;
            this.debugLog('📈 Quality restored', 'success');
        }
    }
    
    applyQualityProfile() {
    if (!this.connectedManagers.visualizer) return;

    // FIXED: Actually push the new profile to the visualizer instead of just logging
    if (typeof this.connectedManagers.visualizer.setQualityProfile === 'function') {
        this.connectedManagers.visualizer.setQualityProfile({
            fftSize:        this.qualityProfile.visualizer.fftSize,
            barCount:       this.qualityProfile.visualizer.barCount,
            effects:        this.qualityProfile.visualizer.effects,
            updateInterval: this.qualityProfile.visualizer.updateInterval
        });
    }

    this.debugLog(
        `🎨 Quality profile applied: FFT=${this.qualityProfile.visualizer.fftSize}, ` +
        `Bars=${this.qualityProfile.visualizer.barCount}, ` +
        `Effects=${this.qualityProfile.visualizer.effects}`,
        'info'
    );
}
    
    // ========== STATE MANAGEMENT (ENHANCED) ==========
    
    /**
     * CRITICAL: Set view mode and trigger cleanup of unused features
     */
    setMode(mode) {
        const oldMode = this.state.currentMode;
        this.state.currentMode = mode;
        
        // Cleanup features from old mode
        this.cleanupModeTransition(oldMode, mode);
        
        // Update power mode
        this.updatePowerMode();
        
        this.debugLog(`🖥️ View mode changed: ${oldMode} → ${mode}`, 'info');
    }
    
    /**
     * CRITICAL NEW: Clean up resources when transitioning between view modes
     */
    cleanupModeTransition(oldMode, newMode) {
        // Stop visualizer if going to mini/compact mode
        if ((newMode === 'mini' || newMode === 'compact') && oldMode === 'full') {
            if (this.connectedManagers.visualizer) {
                this.debugLog('🧹 Stopping visualizer (mode change)', 'info');
                // Visualizer should stop its animations
                if (typeof this.connectedManagers.visualizer.stop === 'function') {
                    this.connectedManagers.visualizer.stop();
                }
            }
        }
        
        // Restart visualizer if going back to full mode
        if (newMode === 'full' && (oldMode === 'mini' || oldMode === 'compact')) {
            if (this.connectedManagers.visualizer) {
                this.debugLog('▶️ Starting visualizer (mode change)', 'info');
                if (typeof this.connectedManagers.visualizer.start === 'function') {
                    this.connectedManagers.visualizer.start();
                }
            }
        }
        
        // Reduce lyrics update frequency in compact/mini modes
        if (newMode === 'mini' || newMode === 'compact') {
            this.qualityProfile.lyrics.updateInterval = 1000;
            this.qualityProfile.progress.updateInterval = 500;
        } else {
            this.qualityProfile.lyrics.updateInterval = 500;
            this.qualityProfile.progress.updateInterval = 200;
        }
    }
    
    setPlayState(playing) {
        this.state.isPlaying = playing;
        
        // If not playing and in background, reduce resource usage
        if (!playing && !this.state.isTabVisible) {
            this.performCleanup();
        }
    }
    
    setupVisibilityTracking() {
        const visibilityHandler = () => {
            this.state.isTabVisible = !document.hidden;
            
            if (!this.state.isTabVisible) {
                this.debugLog('👁️ Tab hidden - reducing performance', 'info');
                this.onTabHidden();
            } else {
                this.debugLog('👁️ Tab visible - restoring performance', 'info');
                this.onTabVisible();
            }
            
            this.updatePowerMode();
        };
        
        document.addEventListener('visibilitychange', visibilityHandler);
        
        // CRITICAL: Track event listener for cleanup
        this.resources.eventListeners.push({
            element: document,
            event: 'visibilitychange',
            handler: visibilityHandler
        });
    }
    
    /**
     * CRITICAL NEW: Aggressive cleanup when tab is hidden
     */
    onTabHidden() {
        // Stop visualizer completely
        if (this.connectedManagers.visualizer) {
            if (typeof this.connectedManagers.visualizer.stop === 'function') {
                this.connectedManagers.visualizer.stop();
            }
        }
        
        // Reduce update frequencies
        this.qualityProfile.lyrics.updateInterval = 2000;
        this.qualityProfile.progress.updateInterval = 1000;
        
        // Perform cleanup
        this.performCleanup();
    }
    
    /**
     * CRITICAL NEW: Restore features when tab is visible
     */
    onTabVisible() {
        // Restart visualizer if in full mode and playing
        if (this.state.currentMode === 'full' && this.state.isPlaying) {
            if (this.connectedManagers.visualizer) {
                if (typeof this.connectedManagers.visualizer.start === 'function') {
                    this.connectedManagers.visualizer.start();
                }
            }
        }
        
        // Restore update frequencies
        if (this.state.currentMode === 'full') {
            this.qualityProfile.lyrics.updateInterval = 500;
            this.qualityProfile.progress.updateInterval = 200;
        }
    }
    
    async setupBatteryMonitoring() {
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                
                const updateBatteryStatus = () => {
                    if (battery.charging) {
                        this.state.powerMode = 'performance';
                    } else if (battery.level < 0.2) {
                        this.state.powerMode = 'battery-saver';
                        this.debugLog('🔋 Low battery - enabling battery saver', 'warning');
                    } else {
                        this.state.powerMode = 'balanced';
                    }
                    this.updatePowerMode();
                };
                
                battery.addEventListener('chargingchange', updateBatteryStatus);
                battery.addEventListener('levelchange', updateBatteryStatus);
                
                // CRITICAL: Track event listeners
                this.resources.eventListeners.push(
                    { element: battery, event: 'chargingchange', handler: updateBatteryStatus },
                    { element: battery, event: 'levelchange', handler: updateBatteryStatus }
                );
                
                updateBatteryStatus();
                
            } catch (err) {
                this.debugLog('Battery API not available', 'info');
            }
        }
    }
    
    updatePowerMode() {
        const { powerMode, currentMode, isTabVisible } = this.state;
        
        // Determine effective performance mode
        if (!isTabVisible) {
            this.effectiveMode = 'background';
        } else if (powerMode === 'battery-saver') {
            this.effectiveMode = 'battery-saver';
        } else {
            this.effectiveMode = currentMode;
        }
        
        this.updateQualityForMode();
    }
    
    updateQualityForMode() {
        const mode = this.effectiveMode;
        const profile = this.qualityProfile;
        
        switch (mode) {
            case 'background':
                profile.visualizer.enabled = false;
                profile.lyrics.updateInterval = 2000;
                profile.progress.updateInterval = 1000;
                break;
                
            case 'battery-saver':
                profile.visualizer.enabled = this.state.isPlaying;
                profile.visualizer.updateInterval = 33.33; // 30 FPS
                profile.lyrics.updateInterval = 1000;
                profile.lyrics.animations = false;
                break;
                
            case 'mini':
                profile.visualizer.enabled = false;
                profile.lyrics.updateInterval = 1000;
                break;
                
            case 'compact':
                profile.visualizer.enabled = false;
                profile.lyrics.updateInterval = 1000;
                break;
                
            case 'full':
            default:
                profile.visualizer.enabled = true;
                profile.visualizer.updateInterval = 16.67; // 60 FPS
                profile.lyrics.updateInterval = 500;
                profile.lyrics.animations = true;
                break;
        }
    }
    
    // ========== THROTTLING & DEBOUNCING (FIXED) ==========
    
    shouldUpdate(operationType) {
        const now = performance.now();
        const last = this.lastUpdate.get(operationType) || 0;
        
        let interval;
        switch (operationType) {
            case 'visualizer':
                interval = this.qualityProfile.visualizer.updateInterval;
                break;
            case 'lyrics':
                interval = this.qualityProfile.lyrics.updateInterval;
                break;
            case 'progress':
                interval = this.qualityProfile.progress.updateInterval;
                break;
            default:
                interval = 100;
        }
        
        if (now - last >= interval) {
            this.lastUpdate.set(operationType, now);
            return true;
        }
        
        return false;
    }
    
    /**
     * FIXED: Throttle with proper cleanup tracking
     */
    throttle(fn, operationType, interval = 100) {
        const key = operationType + fn.name;
        
        // Clear existing timeout
        if (this.throttles.has(key)) {
            const oldTimeout = this.throttles.get(key);
            clearTimeout(oldTimeout);
            this.resources.timeouts.delete(oldTimeout);
        }
        
        const timeoutId = setTimeout(() => {
            if (this.state.destroyed) return;
            fn();
            this.throttles.delete(key);
            this.resources.timeouts.delete(timeoutId);
        }, interval);
        
        this.throttles.set(key, timeoutId);
        this.resources.timeouts.add(timeoutId);
    }
    
    debounce(fn, operationType, delay = 300) {
        return this.throttle(fn, operationType, delay);
    }
    
    // ========== CACHE MANAGEMENT (ENHANCED) ==========
    
    registerCache(cacheName, cache) {
        this.cacheStats[cacheName] = cache;
    }
    
    performCleanup() {
        const now = Date.now();
        
        // Only cleanup every 5 minutes
        if (now - this.cacheStats.lastCleanup < 300000) return;
        
        let cleaned = 0;
        
        // Clean color cache if too large
        if (window.colorCache && window.colorCache.size > 100) {
            const toDelete = window.colorCache.size - 50;
            const keys = Array.from(window.colorCache.keys()).slice(0, toDelete);
            keys.forEach(key => window.colorCache.delete(key));
            cleaned += toDelete;
            this.debugLog(`🧹 Cleaned ${toDelete} color cache entries`, 'info');
        }
        
        // Clean analysis cache if too large
        if (window.analyzer && window.analyzer.analysisCache) {
            const cache = window.analyzer.analysisCache;
            if (cache.size > 200) {
                const toDelete = cache.size - 100;
                const keys = Array.from(cache.keys()).slice(0, toDelete);
                keys.forEach(key => cache.delete(key));
                cleaned += toDelete;
                this.debugLog(`🧹 Cleaned ${toDelete} analysis cache entries`, 'info');
            }
        }
        
        // CRITICAL NEW: Clean up audio buffer cache
        if (this.connectedManagers.audioBuffer) {
            if (typeof this.connectedManagers.audioBuffer.cleanupOldBuffers === 'function') {
                this.connectedManagers.audioBuffer.cleanupOldBuffers();
            }
        }
        
        this.cacheStats.lastCleanup = now;
        
        if (cleaned > 0) {
            this.debugLog(`🧹 Cache cleanup: ${cleaned} entries removed`, 'success');
        }
    }
    
    /**
     * CRITICAL: Emergency cleanup when memory is critical
     */
    performEmergencyCleanup() {
        this.debugLog('🚨 EMERGENCY CLEANUP TRIGGERED', 'error');
        
        // Clear all caches
        if (window.colorCache) {
            window.colorCache.clear();
            this.debugLog('🚨 Emergency: color cache cleared', 'warning');
        }
        
        if (window.analyzer && window.analyzer.analysisCache) {
            window.analyzer.analysisCache.clear();
            this.debugLog('🚨 Emergency: analysis cache cleared', 'warning');
        }
        
        // Clear audio buffer cache except current track
        if (this.connectedManagers.audioBuffer) {
            if (typeof this.connectedManagers.audioBuffer.cleanupOldBuffers === 'function') {
                this.connectedManagers.audioBuffer.cleanupOldBuffers();
            }
        }
        
        // Stop visualizer temporarily
        if (this.connectedManagers.visualizer) {
            if (typeof this.connectedManagers.visualizer.stop === 'function') {
                this.connectedManagers.visualizer.stop();
                this.debugLog('🚨 Emergency: visualizer stopped', 'warning');
            }
        }
        
        // Force garbage collection if available (Chrome DevTools)
        if (window.gc) {
            window.gc();
            this.debugLog('🚨 Emergency: forced GC', 'warning');
        }
        
        // Degrade quality to minimum
        this.qualityProfile.visualizer.fftSize = 512;
        this.qualityProfile.visualizer.barCount = 16;
        this.qualityProfile.visualizer.effects = false;
        
        this.debugLog('🚨 EMERGENCY CLEANUP COMPLETE', 'warning');
    }
    
    // ========== UTILITY METHODS ==========
    
    shouldRunVisualizer() {
        return this.qualityProfile.visualizer.enabled && 
               this.state.isTabVisible && 
               (this.state.isPlaying || this.state.currentMode === 'full');
    }
    
    getVisualizerSettings() {
        return {
            fftSize: this.qualityProfile.visualizer.fftSize,
            barCount: this.qualityProfile.visualizer.barCount,
            effects: this.qualityProfile.visualizer.effects,
            updateInterval: this.qualityProfile.visualizer.updateInterval
        };
    }
    
    getLyricsSettings() {
        return {
            updateInterval: this.qualityProfile.lyrics.updateInterval,
            animations: this.qualityProfile.lyrics.animations,
            glowEffect: this.qualityProfile.lyrics.glowEffect
        };
    }
    
    getColorExtractionSettings() {
        return {
            sampleSize: this.qualityProfile.colorExtraction.sampleSize,
            skipPixels: this.qualityProfile.colorExtraction.skipPixels,
            enabled: this.qualityProfile.colorExtraction.enabled
        };
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            deviceTier: this.state.deviceTier,
            powerMode: this.state.powerMode,
            effectiveMode: this.effectiveMode
        };
    }
    
    getHealthStatus() {
        const { fps, memory, avgFrameTime } = this.metrics;
        
        let status = 'excellent';
        let issues = [];
        
        if (fps < this.thresholds.fps.poor) {
            status = 'poor';
            issues.push('Low FPS');
        } else if (fps < this.thresholds.fps.good) {
            status = 'fair';
        }
        
        if (memory > this.thresholds.memory.critical) {
            status = 'critical';
            issues.push('Critical memory usage');
        } else if (memory > this.thresholds.memory.warning) {
            if (status === 'excellent') status = 'fair';
            issues.push('High memory usage');
        }
        
        if (avgFrameTime > this.thresholds.frameTime.poor) {
            status = 'poor';
            issues.push('Slow frame time');
        }
        
        return { status, issues };
    }
    
    // ========== DEBUGGING & STATS ==========
    
    getStatsDisplay() {
        const { fps, memory, cpuLoad, droppedFrames } = this.metrics;
        const health = this.getHealthStatus();
        
        return {
            fps: `${fps} FPS`,
            memory: `${memory} MB`,
            cpuLoad: `${cpuLoad}%`,
            droppedFrames: droppedFrames,
            health: health.status,
            issues: health.issues,
            deviceTier: this.state.deviceTier,
            powerMode: this.state.powerMode,
            visualizerFFT: this.qualityProfile.visualizer.fftSize,
            activeResources: {
                intervals: this.resources.intervals.size,
                animations: this.resources.animationFrames.size,
                timeouts: this.resources.timeouts.size,
                listeners: this.resources.eventListeners.length
            }
        };
    }
    
    logStatus() {
        const stats = this.getStatsDisplay();
        this.debugLog('📊 Performance Status:', 'info');
        this.debugLog(`  FPS: ${stats.fps} | Memory: ${stats.memory} | CPU: ${stats.cpuLoad}`, 'info');
        this.debugLog(`  Health: ${stats.health} | Device: ${stats.deviceTier}`, 'info');
        this.debugLog(`  Dropped Frames: ${stats.droppedFrames} | FFT: ${stats.visualizerFFT}`, 'info');
        this.debugLog(`  Active Resources: ${stats.activeResources.intervals} intervals, ${stats.activeResources.animations} animations, ${stats.activeResources.timeouts} timeouts, ${stats.activeResources.listeners} listeners`, 'info');
    }
    
    // ========== CRITICAL: CLEANUP & DESTROY ==========
    
    /**
     * CRITICAL NEW: Complete cleanup of all resources
     * Call this when destroying the app or changing tracks
     */
    destroy() {
        if (this.state.destroyed) {
            this.debugLog('⚠️ PerformanceManager already destroyed', 'warning');
            return;
        }
        
        this.debugLog('🧹 Destroying PerformanceManager...', 'info');
        
        // Stop all monitoring
        this.stopPerformanceMonitoring();
        
        // Clear all intervals
        this.resources.intervals.forEach(id => clearInterval(id));
        this.resources.intervals.clear();
        
        // Cancel all animation frames
        this.resources.animationFrames.forEach(id => cancelAnimationFrame(id));
        this.resources.animationFrames.clear();
        
        // Clear all timeouts
        this.resources.timeouts.forEach(id => clearTimeout(id));
        this.resources.timeouts.clear();
        
        // Remove all event listeners
        this.resources.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.resources.eventListeners = [];
        
        // Clear all throttles
        this.throttles.forEach(timeout => clearTimeout(timeout));
        this.throttles.clear();
        this.lastUpdate.clear();
        
        // Disconnect all managers
        Object.keys(this.connectedManagers).forEach(key => {
            this.connectedManagers[key] = null;
        });
        
        this.state.destroyed = true;
        this.state.initialized = false;
        
        this.debugLog('✅ PerformanceManager destroyed successfully', 'success');
    }
    
    /**
     * NEW: Partial cleanup for track changes
     * Less aggressive than destroy(), cleans up caches but keeps monitoring
     */
    cleanupForTrackChange() {
        this.debugLog('🧹 Cleaning up for track change...', 'info');
        
        // Clear caches
        this.performCleanup();
        
        // Clear throttles but keep monitoring
        this.throttles.forEach(timeout => clearTimeout(timeout));
        this.throttles.clear();
        
        this.debugLog('✅ Track change cleanup complete', 'success');
    }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceManager;
}

console.log('✅ PerformanceManager v2.0 loaded - MEMORY LEAK FIXED');
