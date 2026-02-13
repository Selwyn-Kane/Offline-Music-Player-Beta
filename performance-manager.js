/* ============================================
   Advanced Performance Manager
   Real-time CPU/Memory Monitoring & Optimization
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
            deviceTier: 'high' // 'high', 'medium', 'low'
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
        
        // Operation throttling
        this.throttles = new Map();
        this.lastUpdate = new Map();
        
        // Performance monitoring
        this.monitoring = {
            enabled: false,
            interval: null,
            history: []
        };
        
        // Cache management
        this.cacheStats = {
            colorCache: 0,
            analysisCache: 0,
            lastCleanup: Date.now()
        };
        
        this.init();
    }
    
    init() {
        this.detectDeviceTier();
        this.setupVisibilityTracking();
        this.setupBatteryMonitoring();
        this.startPerformanceMonitoring();
        this.applyQualityProfile();
        
        this.debugLog('🚀 Performance Manager initialized', 'success');
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
    
    // ========== PERFORMANCE MONITORING ==========
    
    startPerformanceMonitoring() {
        this.monitoring.enabled = true;
        
        // Monitor FPS
        this.monitorFPS();
        
        // Monitor memory usage
        if (performance.memory) {
            this.monitoring.interval = setInterval(() => {
                this.updateMemoryMetrics();
                this.checkPerformanceHealth();
            }, 2000);
        }
        
        // Periodic cleanup
        setInterval(() => this.performCleanup(), 60000); // Every minute
    }
    
    monitorFPS() {
        let lastTime = performance.now();
        let frames = 0;
        let lastReportTime = lastTime;
        
        const measureFrame = (currentTime) => {
            if (!this.monitoring.enabled) return;
            
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
            requestAnimationFrame(measureFrame);
        };
        
        requestAnimationFrame(measureFrame);
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
            this.debugLog('⚠️ High memory usage, clearing caches', 'warning');
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
        // This will be called by external systems to get current settings
        this.debugLog(`🎨 Quality profile applied: FFT=${this.qualityProfile.visualizer.fftSize}, Bars=${this.qualityProfile.visualizer.barCount}`, 'info');
    }
    
    // ========== STATE MANAGEMENT ==========
    
    setMode(mode) {
        this.state.currentMode = mode;
        this.updatePowerMode();
    }
    
    setPlayState(playing) {
        this.state.isPlaying = playing;
    }
    
    setupVisibilityTracking() {
        document.addEventListener('visibilitychange', () => {
            this.state.isTabVisible = !document.hidden;
            
            if (!this.state.isTabVisible) {
                this.debugLog('👁️ Tab hidden - reducing performance', 'info');
            } else {
                this.debugLog('👁️ Tab visible - restoring performance', 'info');
            }
            
            this.updatePowerMode();
        });
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
    
    // ========== THROTTLING & DEBOUNCING ==========
    
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
    
    throttle(fn, operationType, interval = 100) {
        const key = operationType + fn.name;
        
        if (this.throttles.has(key)) {
            clearTimeout(this.throttles.get(key));
        }
        
        const timeoutId = setTimeout(() => {
            fn();
            this.throttles.delete(key);
        }, interval);
        
        this.throttles.set(key, timeoutId);
    }
    
    debounce(fn, operationType, delay = 300) {
        return this.throttle(fn, operationType, delay);
    }
    
    // ========== CACHE MANAGEMENT ==========
    
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
        
        this.cacheStats.lastCleanup = now;
        
        if (cleaned > 0) {
            this.debugLog(`🧹 Cache cleanup: ${cleaned} entries removed`, 'success');
        }
    }
    
    performEmergencyCleanup() {
        // Aggressive cleanup when memory is critical
        if (window.colorCache) {
            window.colorCache.clear();
            this.debugLog('🚨 Emergency cleanup: color cache cleared', 'warning');
        }
        
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
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
            visualizerFFT: this.qualityProfile.visualizer.fftSize
        };
    }
    
    logStatus() {
        const stats = this.getStatsDisplay();
        this.debugLog('📊 Performance Status:', 'info');
        this.debugLog(`  FPS: ${stats.fps} | Memory: ${stats.memory} | CPU: ${stats.cpuLoad}`, 'info');
        this.debugLog(`  Health: ${stats.health} | Device: ${stats.deviceTier}`, 'info');
        this.debugLog(`  Dropped Frames: ${stats.droppedFrames} | FFT: ${stats.visualizerFFT}`, 'info');
    }
    
    destroy() {
        this.monitoring.enabled = false;
        if (this.monitoring.interval) {
            clearInterval(this.monitoring.interval);
        }
        this.throttles.forEach(timeout => clearTimeout(timeout));
        this.throttles.clear();
    }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceManager;
}