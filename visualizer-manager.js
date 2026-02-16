/* ============================================
   VISUALIZER MANAGER v6.0 - BARS ONLY
   Optimized single-mode visualizer focused on performance
   
   Features:
   - Bars visualization only
   - Deep analysis integration (BPM, energy, mood)
   - Aggressive memory management
   - CPU-friendly rendering
   - Quality scaling for performance
   ============================================ */

class VisualizerManager {
    constructor() {
        // Lifecycle guards
        this._state = {
            initialized: false,
            destroyed: false
        };

        // Canvas references
        this._canvas = null;
        this._ctx = null;
        this._fullscreenCanvas = null;
        this._fullscreenCtx = null;

        // Audio analysis
        this._analyser = null;
        this._dataArray = null;
        this._bufferLength = null;

        // Animation control
        this._resources = {
            animationFrames: new Set()
        };
        this._mainAnimationId = null;
        this._fullscreenAnimationId = null;

        this._enabled = true;
        this._isFullscreen = false;

        // Device tier detection
        this._deviceTier = this._detectDeviceTier();

        // Performance configuration
        this._performance = {
            targetFPS: 60,
            lastFrame: performance.now(),
            frameCount: 0,
            qualityLevel: 1.0,  // Set by PerformanceManager: 0.25 | 0.5 | 0.75 | 1.0
            skipFrames: 0,      // Skip rendering frames when under load
            updateInterval: 16.67
        };

        // Quality profile (set by PerformanceManager)
        this._qualityProfile = {
            barCount: 64,
            effects: true,
            shadowBlur: 20
        };

        // Track analysis
        this._analysis = {
            current: null,
            bpmMultiplier: 1.0,
            energyMultiplier: 1.0
        };

        // Beat detection
        this._beatDetection = {
            energyHistory: new Float32Array(50),
            historyIndex: 0,
            lastBeat: 0,
            threshold: 0,
            cooldown: 200,
            avgEnergy: 0
        };

        // Frequency bands (7-band analysis)
        this._frequencies = {
            subBass: 0,
            bass: 0,
            lowMid: 0,
            mid: 0,
            highMid: 0,
            treble: 0,
            brilliance: 0
        };

        // Smoothed values for visual stability
        this._smooth = {
            subBass: 0,
            bass: 0,
            lowMid: 0,
            mid: 0,
            highMid: 0,
            treble: 0,
            brilliance: 0,
            energy: 0
        };

        // Band indices (calculated after audio init)
        this._bandIndices = {
            subBass: { start: 0, end: 0 },
            bass: { start: 0, end: 0 },
            lowMid: { start: 0, end: 0 },
            mid: { start: 0, end: 0 },
            highMid: { start: 0, end: 0 },
            treble: { start: 0, end: 0 },
            brilliance: { start: 0, end: 0 }
        };

        // Color system
        this._colors = {
            baseHue: 340,
            saturation: 80,
            lightness: 50,
            range: 60
        };

        // Visual effects
        this._effects = {
            pulseScale: 1.0,
            glowIntensity: 0,
            bassGlow: 0
        };

        this._state.initialized = true;
        console.log(`🎨 VisualizerManager v6.0 (Bars Only) - ${this._deviceTier} tier`);
    }

    // ========== DEVICE TIER ==========

    _detectDeviceTier() {
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 2;
        
        if (memory >= 8 && cores >= 4) return 'high';
        if (memory >= 4 && cores >= 2) return 'medium';
        return 'low';
    }

    // ========== PERFORMANCE INTEGRATION ==========

    setQualityProfile(profile) {
        if (!profile) return;
        
        Object.assign(this._qualityProfile, profile);
        
        // Convert profile to quality level
        this._performance.qualityLevel = Math.min(
            1.0,
            (this._qualityProfile.barCount / 64)
        );

        console.log(`🎨 Visualizer quality: Bars=${profile.barCount}, Effects=${profile.effects}`);
    }

    // ========== CANVAS INITIALIZATION ==========

    initMainVisualizer(canvas, analyser, dataArray, bufferLength) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this._analyser = analyser;
        this._dataArray = dataArray;
        this._bufferLength = bufferLength;
        this._calculateFrequencyBands();
        this._resizeCanvas();
    }

    initFullscreenVisualizer(canvas, analyser, dataArray, bufferLength) {
        this._fullscreenCanvas = canvas;
        this._fullscreenCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this._analyser = analyser;
        this._dataArray = dataArray;
        this._bufferLength = bufferLength;
        this._isFullscreen = true;
        this._calculateFrequencyBands();
        this._resizeFullscreenCanvas();
    }

    _calculateFrequencyBands() {
        if (!this._analyser) return;
        
        const sampleRate = this._analyser.context.sampleRate || 48000;
        const binWidth = (sampleRate / 2) / this._bufferLength;
        const freqToBin = (f) => Math.floor(f / binWidth);

        this._bandIndices.subBass = { start: freqToBin(20), end: freqToBin(60) };
        this._bandIndices.bass = { start: freqToBin(60), end: freqToBin(250) };
        this._bandIndices.lowMid = { start: freqToBin(250), end: freqToBin(500) };
        this._bandIndices.mid = { start: freqToBin(500), end: freqToBin(2000) };
        this._bandIndices.highMid = { start: freqToBin(2000), end: freqToBin(4000) };
        this._bandIndices.treble = { start: freqToBin(4000), end: freqToBin(8000) };
        this._bandIndices.brilliance = { start: freqToBin(8000), end: Math.min(freqToBin(20000), this._bufferLength) };

        console.log('📊 Frequency bands calculated');
    }

    _resizeCanvas() {
        if (!this._canvas) return;
        const rect = this._canvas.parentElement.getBoundingClientRect();
        this._canvas.width = rect.width;
        this._canvas.height = rect.height;
    }

    _resizeFullscreenCanvas() {
        if (!this._fullscreenCanvas) return;
        this._fullscreenCanvas.width = window.innerWidth;
        this._fullscreenCanvas.height = window.innerHeight;
    }

    // ========== ANIMATION CONTROL ==========

    start() {
        if (this._state.destroyed) return;

        this._cancelMainLoop();

        const animate = (time) => {
            if (this._state.destroyed || !this._enabled || !this._canvas) {
                this._cancelMainLoop();
                return;
            }

            const id = requestAnimationFrame(animate);
            this._mainAnimationId = id;
            this._resources.animationFrames.add(id);

            // Frame skipping for performance
            if (this._performance.skipFrames > 0) {
                this._performance.skipFrames--;
                return;
            }

            this._render(this._ctx, this._canvas, time);
        };

        const id = requestAnimationFrame(animate);
        this._mainAnimationId = id;
        this._resources.animationFrames.add(id);
    }

    stop() {
        this._cancelMainLoop();
    }

    startFullscreen() {
        if (this._state.destroyed) return;

        this._cancelFullscreenLoop();

        const animate = (time) => {
            if (this._state.destroyed || !this._isFullscreen || !this._fullscreenCanvas) {
                this._cancelFullscreenLoop();
                return;
            }

            const id = requestAnimationFrame(animate);
            this._fullscreenAnimationId = id;
            this._resources.animationFrames.add(id);

            if (this._performance.skipFrames > 0) {
                this._performance.skipFrames--;
                return;
            }

            this._render(this._fullscreenCtx, this._fullscreenCanvas, time);
        };

        const id = requestAnimationFrame(animate);
        this._fullscreenAnimationId = id;
        this._resources.animationFrames.add(id);
    }

    stopFullscreen() {
        this._cancelFullscreenLoop();
        this._isFullscreen = false;
    }

    _cancelMainLoop() {
        if (this._mainAnimationId) {
            cancelAnimationFrame(this._mainAnimationId);
            this._resources.animationFrames.delete(this._mainAnimationId);
            this._mainAnimationId = null;
        }
    }

    _cancelFullscreenLoop() {
        if (this._fullscreenAnimationId) {
            cancelAnimationFrame(this._fullscreenAnimationId);
            this._resources.animationFrames.delete(this._fullscreenAnimationId);
            this._fullscreenAnimationId = null;
        }
    }

    // ========== TRACK ANALYSIS ==========

    setTrackAnalysis(analysis) {
        if (!analysis) return;
        
        this._analysis.current = analysis;

        // Adjust beat detection based on BPM
        if (analysis.bpm && analysis.bpm > 0) {
            const beatInterval = 60000 / analysis.bpm;
            this._beatDetection.cooldown = beatInterval * 0.3;
            this._analysis.bpmMultiplier = Math.max(0.6, Math.min(1.8, analysis.bpm / 120));
        }

        // Adjust intensity based on energy
        if (analysis.energy !== undefined) {
            this._analysis.energyMultiplier = 0.7 + analysis.energy * 0.8;
        }

        // Set color based on mood
        if (analysis.mood) {
            const moodColors = {
                energetic: { h: 0, s: 90, l: 55 },
                bright: { h: 50, s: 85, l: 60 },
                calm: { h: 200, s: 70, l: 55 },
                dark: { h: 280, s: 50, l: 35 },
                neutral: { h: 180, s: 60, l: 50 }
            };
            
            const mood = analysis.mood.toLowerCase();
            if (moodColors[mood]) {
                this._colors.baseHue = moodColors[mood].h;
                this._colors.saturation = moodColors[mood].s;
                this._colors.lightness = moodColors[mood].l;
            }
        }

        console.log(`🎵 Analysis applied: BPM=${analysis.bpm}, Energy=${(analysis.energy * 100).toFixed(0)}%, Mood=${analysis.mood}`);
    }

    clearTrackAnalysis() {
        this._analysis.current = null;
        this._analysis.bpmMultiplier = 1.0;
        this._analysis.energyMultiplier = 1.0;
        this._beatDetection.cooldown = 200;
        this._colors = { baseHue: 340, saturation: 80, lightness: 50, range: 60 };
    }

    // ========== FREQUENCY ANALYSIS ==========

    _getBandAvg(data, start, end) {
        if (start >= end || start < 0 || end > data.length) return 0;
        
        let sum = 0;
        const s = Math.floor(start);
        const e = Math.floor(end);
        
        for (let i = s; i < e; i++) {
            sum += data[i];
        }
        
        return (sum / (e - s)) / 255;
    }

    _analyzeFrequencies(data) {
        this._frequencies.subBass = this._getBandAvg(data, this._bandIndices.subBass.start, this._bandIndices.subBass.end);
        this._frequencies.bass = this._getBandAvg(data, this._bandIndices.bass.start, this._bandIndices.bass.end);
        this._frequencies.lowMid = this._getBandAvg(data, this._bandIndices.lowMid.start, this._bandIndices.lowMid.end);
        this._frequencies.mid = this._getBandAvg(data, this._bandIndices.mid.start, this._bandIndices.mid.end);
        this._frequencies.highMid = this._getBandAvg(data, this._bandIndices.highMid.start, this._bandIndices.highMid.end);
        this._frequencies.treble = this._getBandAvg(data, this._bandIndices.treble.start, this._bandIndices.treble.end);
        this._frequencies.brilliance = this._getBandAvg(data, this._bandIndices.brilliance.start, this._bandIndices.brilliance.end);
    }

    _updateSmoothing(data, dt) {
        const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
        const factor = Math.min(1, dt / 100);

        this._analyzeFrequencies(data);

        // Smooth frequency values for stable visualization
        this._smooth.subBass = lerp(this._smooth.subBass, this._frequencies.subBass, factor * 2.5);
        this._smooth.bass = lerp(this._smooth.bass, this._frequencies.bass, factor * 2.5);
        this._smooth.lowMid = lerp(this._smooth.lowMid, this._frequencies.lowMid, factor * 3.0);
        this._smooth.mid = lerp(this._smooth.mid, this._frequencies.mid, factor * 3.0);
        this._smooth.highMid = lerp(this._smooth.highMid, this._frequencies.highMid, factor * 3.5);
        this._smooth.treble = lerp(this._smooth.treble, this._frequencies.treble, factor * 4.0);
        this._smooth.brilliance = lerp(this._smooth.brilliance, this._frequencies.brilliance, factor * 4.5);

        // Calculate overall energy
        this._smooth.energy = (
            this._smooth.subBass * 1.5 +
            this._smooth.bass * 1.3 +
            this._smooth.lowMid * 0.9 +
            this._smooth.mid * 0.8 +
            this._smooth.highMid * 0.7 +
            this._smooth.treble * 0.9 +
            this._smooth.brilliance * 0.6
        ) / 6.7;

        this._updateEffects();
    }

    _updateEffects() {
        const intensity = this._analysis.energyMultiplier;
        
        // Pulse effect from bass
        this._effects.pulseScale = 1.0 + (this._smooth.bass + this._smooth.subBass) * 0.15 * intensity;
        
        // Glow effects
        this._effects.bassGlow = (this._smooth.bass + this._smooth.subBass * 1.2) * intensity;
        this._effects.glowIntensity = this._effects.bassGlow * 0.7;
    }

    // ========== BEAT DETECTION ==========

    _detectBeat(data) {
        const now = performance.now();

        // Update energy history
        this._beatDetection.energyHistory[this._beatDetection.historyIndex] = this._smooth.energy;
        this._beatDetection.historyIndex = (this._beatDetection.historyIndex + 1) % 50;

        // Calculate average energy
        let sum = 0;
        for (let i = 0; i < 50; i++) {
            sum += this._beatDetection.energyHistory[i];
        }
        this._beatDetection.avgEnergy = sum / 50;

        // Beat threshold with energy variance
        const threshold = this._beatDetection.avgEnergy * 1.4;

        // Check for beat
        const isBeat = this._smooth.energy > threshold &&
                       now - this._beatDetection.lastBeat > this._beatDetection.cooldown;

        if (isBeat) {
            this._beatDetection.lastBeat = now;
        }

        return isBeat;
    }

    // ========== COLOR SYSTEM ==========

    _updateColors() {
        // Use album art colors if available
        if (window.currentDominantColor) {
            const { r, g, b } = window.currentDominantColor;
            const [h, s, l] = this._rgbToHsl(r, g, b);
            
            // Blend with mood-based color
            this._colors.baseHue = (h + this._colors.baseHue) / 2;
            this._colors.saturation = Math.max(s, this._colors.saturation);
            this._colors.lightness = (l + this._colors.lightness) / 2;
        }
    }

    _rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            
            h /= 6;
        }

        return [h * 360, s * 100, l * 100];
    }

    // ========== MAIN RENDER ==========

    _render(ctx, canvas, time) {
        if (this._state.destroyed || !this._analyser || !this._dataArray) return;

        const dt = time - this._performance.lastFrame;
        this._performance.lastFrame = time;

        // Get frequency data
        this._analyser.getByteFrequencyData(this._dataArray);
        
        // Update analysis
        this._updateSmoothing(this._dataArray, dt);
        this._updateColors();
        const isBeat = this._detectBeat(this._dataArray);

        // Clear with trail effect
        const trailAlpha = 0.15 + (1 - this._performance.qualityLevel) * 0.1;
        ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw bars
        this._drawBars(ctx, canvas, isBeat);

        // Update FPS counter
        this._performance.frameCount++;
    }

    // ========== BARS VISUALIZATION ==========

    _drawBars(ctx, canvas, isBeat) {
        const w = canvas.width;
        const h = canvas.height;
        
        // Scale bar count based on quality
        const barCount = Math.min(
            Math.round(this._qualityProfile.barCount * this._performance.qualityLevel),
            this._bufferLength
        );
        
        const barWidth = (w / barCount) * 0.9;
        const barSpacing = w / barCount;
        
        const baseHue = this._colors.baseHue;
        const baseSat = this._colors.saturation;
        const baseLight = this._colors.lightness;
        const hueRange = this._colors.range;
        
        const effectsOn = this._qualityProfile.effects;
        const pulseScale = this._effects.pulseScale;
        const glowIntensity = this._effects.glowIntensity;
        const energyMultiplier = this._analysis.energyMultiplier;

        for (let i = 0; i < barCount; i++) {
            // Get frequency data for this bar
            const dataIndex = Math.floor((i / barCount) * this._bufferLength);
            const value = this._dataArray[dataIndex] / 255;
            
            // Calculate bar height with energy and pulse
            const barHeight = value * h * 0.85 * pulseScale * energyMultiplier;
            
            // Color based on frequency position
            let hue = baseHue;
            const position = i / barCount;
            
            if (position < 0.15) {
                // Sub-bass/Bass (red)
                hue += hueRange * 0.8;
            } else if (position < 0.5) {
                // Low-mid/Mid (yellow-green)
                hue += hueRange * 0.4;
            } else {
                // High-mid/Treble/Brilliance (blue-purple)
                hue -= hueRange * 0.2;
            }
            
            // Brightness based on amplitude
            const brightness = baseLight + value * 25 + glowIntensity * 10;
            const saturation = Math.min(100, baseSat + value * 15);
            
            // Glow effect on beats and high amplitude
            if (effectsOn && (isBeat || value > 0.5)) {
                const blurAmount = Math.min(
                    this._qualityProfile.shadowBlur,
                    15 + value * 10
                );
                ctx.shadowBlur = blurAmount;
                ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            } else {
                ctx.shadowBlur = 0;
            }
            
            // Draw bar
            ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            ctx.fillRect(
                i * barSpacing,
                h - barHeight,
                barWidth,
                barHeight
            );
        }
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }

    // ========== PUBLIC API ==========

    get vizMode() {
        return 'bars';
    }

    setVizMode(mode) {
        // Only bars mode supported
        console.log('🎨 Visualizer is bars-only mode');
    }

    // ========== DESTROY ==========

    destroy() {
        if (this._state.destroyed) {
            console.warn('⚠️ VisualizerManager already destroyed');
            return;
        }

        console.log('🧹 Destroying VisualizerManager...');

        // Stop all animations
        this._state.destroyed = true;
        this._enabled = false;

        // Cancel all animation frames
        this._resources.animationFrames.forEach(id => cancelAnimationFrame(id));
        this._resources.animationFrames.clear();
        this._mainAnimationId = null;
        this._fullscreenAnimationId = null;

        // Null canvas contexts
        this._ctx = null;
        this._fullscreenCtx = null;
        this._canvas = null;
        this._fullscreenCanvas = null;

        // Null audio references
        this._analyser = null;
        this._dataArray = null;
        this._bufferLength = null;

        // Null analysis data
        this._analysis.current = null;

        this._state.initialized = false;
        console.log('✅ VisualizerManager destroyed');
    }
}

window.VisualizerManager = VisualizerManager;
console.log('✅ VisualizerManager v6.0 loaded - Bars Only, Performance Optimized');
