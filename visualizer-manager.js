/* ============================================
   Enhanced Visualizer Manager v4.0
   Ultra-responsive, music-intelligent visualizations
   ============================================ */

class VisualizerManager {
    constructor() {
        // Canvas references
        this.canvas = null;
        this.canvasCtx = null;
        this.fullscreenCanvas = null;
        this.fullscreenCtx = null;
        
        // Audio analysis
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = null;
        
        // Animation control
        this.mainAnimationId = null;
        this.fullscreenAnimationId = null;
        this.enabled = true;
        this.isFullscreen = false;
        this.vizMode = this.loadVizMode();
        
        // Performance optimization
        this.performance = {
            fps: 60,
            targetFPS: 60,
            lastFrame: performance.now(),
            frameCount: 0,
            adaptiveQuality: true,
            qualityLevel: 1.0,
            offscreenSupported: typeof OffscreenCanvas !== 'undefined'
        };
        
        // Enhanced analysis integration
        this.analysis = {
            current: null,
            previous: null,
            cache: new Map(),
            intensityMultiplier: 1.0,
            tempoMultiplier: 1.0
        };
        
        // Advanced beat detection with multi-band analysis
        this.beatDetection = {
            // Energy history for adaptive thresholding
            energyHistory: new Float32Array(50),
            historyIndex: 0,
            
            // Multi-band beat detection
            bass: { lastBeat: 0, threshold: 0, cooldown: 180, confidence: 0 },
            mid: { lastBeat: 0, threshold: 0, cooldown: 150, confidence: 0 },
            treble: { lastBeat: 0, threshold: 0, cooldown: 120, confidence: 0 },
            
            // Global beat state
            lastBeat: 0,
            sensitivity: 1.3,
            minCooldown: 100,
            
            // Energy variance for adaptive detection
            energyVariance: 0,
            avgEnergy: 0
        };
        
        // Advanced frequency analysis (7-band logarithmic)
        this.frequencies = {
            subBass: 0,      // 20-60 Hz - Deep bass, kick drums
            bass: 0,         // 60-250 Hz - Bass guitar, low toms
            lowMid: 0,       // 250-500 Hz - Low vocals, snare body
            mid: 0,          // 500-2000 Hz - Vocals, guitars
            highMid: 0,      // 2000-4000 Hz - Cymbals, vocal clarity
            treble: 0,       // 4000-8000 Hz - Hi-hats, brightness
            brilliance: 0    // 8000+ Hz - Air, sparkle
        };
        
        // Smooth interpolation system (enhanced)
        this.smooth = {
            // Frequency bands
            subBass: 0,
            bass: 0,
            lowMid: 0,
            mid: 0,
            highMid: 0,
            treble: 0,
            brilliance: 0,
            
            // Composite values
            energy: 0,
            volume: 0,
            
            // Visual effects
            rotation: 0,
            hue: 0,
            
            // Peak tracking
            peakBass: 0,
            peakMid: 0,
            peakTreble: 0
        };
        
        // Particle system (enhanced)
        this.particlePool = {
            active: [],
            inactive: [],
            maxSize: 1200,
            spawnRate: 0
        };
        this.initParticlePool();
        
        // Color system (enhanced)
        this.colors = {
            palette: { h: 340, s: 80, l: 50, range: 60 },
            albumArt: null,
            lastUpdate: 0,
            moodPalettes: {
                energetic: { h: 0, s: 90, l: 55, range: 60 },      // Red-orange
                happy: { h: 50, s: 85, l: 60, range: 50 },         // Yellow-green
                calm: { h: 200, s: 70, l: 55, range: 40 },         // Blue
                sad: { h: 240, s: 60, l: 45, range: 30 },          // Deep blue
                dark: { h: 280, s: 50, l: 35, range: 40 },         // Purple-dark
                neutral: { h: 180, s: 60, l: 50, range: 60 }       // Cyan
            }
        };
        
        // Visual effects (enhanced)
        this.effects = {
            pulseScale: 1.0,
            rotation: 0,
            waveOffset: 0,
            glowIntensity: 0,
            shimmer: 0,
            
            // Frequency-specific effects
            bassGlow: 0,
            trebleSparkle: 0,
            midFlow: 0
        };
        
        // Frequency band indices (calculated on init)
        this.bandIndices = {
            subBass: { start: 0, end: 0 },
            bass: { start: 0, end: 0 },
            lowMid: { start: 0, end: 0 },
            mid: { start: 0, end: 0 },
            highMid: { start: 0, end: 0 },
            treble: { start: 0, end: 0 },
            brilliance: { start: 0, end: 0 }
        };

        console.log('🎨 Ultra-Responsive VisualizerManager v4.0 initialized');
    }

    initParticlePool() {
        for (let i = 0; i < this.particlePool.maxSize; i++) {
            this.particlePool.inactive.push(this.createParticle());
        }
    }

    createParticle() {
        return {
            x: 0, y: 0, vx: 0, vy: 0,
            size: 0, life: 0, maxLife: 1, decay: 0,
            color: { h: 0, s: 0, l: 0 },
            rotation: 0, rotationSpeed: 0,
            type: 'circle',
            frequency: 'mid',
            energy: 1.0
        };
    }

    spawnParticle(config) {
        let p = this.particlePool.inactive.pop() || this.createParticle();
        Object.assign(p, config);
        this.particlePool.active.push(p);
        return p;
    }

    recycleParticle(p, index) {
        this.particlePool.active.splice(index, 1);
        if (this.particlePool.inactive.length < this.particlePool.maxSize) {
            this.particlePool.inactive.push(p);
        }
    }

    loadVizMode() {
        return localStorage.getItem('visualizerMode') || 'nebula';
    }

    saveVizMode() {
        localStorage.setItem('visualizerMode', this.vizMode);
    }

    setVizMode(mode) {
        const validModes = ['bars', 'circular', 'waveform', 'particles', 'nebula', '3dwave', 'spectrum', 'radial', 'energyflow'];
        if (validModes.includes(mode)) {
            this.vizMode = mode;
            this.saveVizMode();
            this.particlePool.active = [];
        }
    }

    initMainVisualizer(canvas, analyser, dataArray, bufferLength) {
        this.canvas = canvas;
        this.canvasCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.analyser = analyser;
        this.dataArray = dataArray;
        this.bufferLength = bufferLength;
        this.calculateFrequencyBands();
        this.resizeCanvas();
    }

    initFullscreenVisualizer(canvas, analyser, dataArray, bufferLength) {
        this.fullscreenCanvas = canvas;
        this.fullscreenCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.analyser = analyser;
        this.dataArray = dataArray;
        this.bufferLength = bufferLength;
        this.isFullscreen = true;
        this.calculateFrequencyBands();
        this.resizeFullscreenCanvas();
    }

    /**
     * Calculate frequency band indices based on sample rate
     * Uses logarithmic distribution for better musical representation
     */
    calculateFrequencyBands() {
        if (!this.analyser) return;
        
        const sampleRate = this.analyser.context.sampleRate || 48000;
        const nyquist = sampleRate / 2;
        const binWidth = nyquist / this.bufferLength;
        
        // Helper to convert frequency to bin index
        const freqToBin = (freq) => Math.floor(freq / binWidth);
        
        // Define frequency ranges (in Hz)
        this.bandIndices.subBass = { start: freqToBin(20), end: freqToBin(60) };
        this.bandIndices.bass = { start: freqToBin(60), end: freqToBin(250) };
        this.bandIndices.lowMid = { start: freqToBin(250), end: freqToBin(500) };
        this.bandIndices.mid = { start: freqToBin(500), end: freqToBin(2000) };
        this.bandIndices.highMid = { start: freqToBin(2000), end: freqToBin(4000) };
        this.bandIndices.treble = { start: freqToBin(4000), end: freqToBin(8000) };
        this.bandIndices.brilliance = { start: freqToBin(8000), end: Math.min(freqToBin(20000), this.bufferLength) };
        
        console.log('📊 Frequency bands calculated:', this.bandIndices);
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    resizeFullscreenCanvas() {
        if (!this.fullscreenCanvas) return;
        this.fullscreenCanvas.width = window.innerWidth;
        this.fullscreenCanvas.height = window.innerHeight;
    }

    /**
     * Enhanced frequency analysis with 7-band logarithmic distribution
     */
    analyzeFrequencies(data) {
        // Extract each frequency band
        this.frequencies.subBass = this.getBandAvg(data, this.bandIndices.subBass.start, this.bandIndices.subBass.end);
        this.frequencies.bass = this.getBandAvg(data, this.bandIndices.bass.start, this.bandIndices.bass.end);
        this.frequencies.lowMid = this.getBandAvg(data, this.bandIndices.lowMid.start, this.bandIndices.lowMid.end);
        this.frequencies.mid = this.getBandAvg(data, this.bandIndices.mid.start, this.bandIndices.mid.end);
        this.frequencies.highMid = this.getBandAvg(data, this.bandIndices.highMid.start, this.bandIndices.highMid.end);
        this.frequencies.treble = this.getBandAvg(data, this.bandIndices.treble.start, this.bandIndices.treble.end);
        this.frequencies.brilliance = this.getBandAvg(data, this.bandIndices.brilliance.start, this.bandIndices.brilliance.end);
    }

    /**
     * Enhanced smoothing with frequency-specific interpolation rates
     */
    updateSmoothing(data, dt) {
        const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
        const factor = Math.min(1, dt / 100);
        
        // Analyze frequencies
        this.analyzeFrequencies(data);
        
        // Smooth each frequency band with different rates
        // Bass: slower (more weight, less jitter)
        this.smooth.subBass = lerp(this.smooth.subBass, this.frequencies.subBass, factor * 2.5);
        this.smooth.bass = lerp(this.smooth.bass, this.frequencies.bass, factor * 2.5);
        
        // Mids: medium speed
        this.smooth.lowMid = lerp(this.smooth.lowMid, this.frequencies.lowMid, factor * 3);
        this.smooth.mid = lerp(this.smooth.mid, this.frequencies.mid, factor * 3);
        this.smooth.highMid = lerp(this.smooth.highMid, this.frequencies.highMid, factor * 3.5);
        
        // Treble: faster (more responsive to transients)
        this.smooth.treble = lerp(this.smooth.treble, this.frequencies.treble, factor * 4);
        this.smooth.brilliance = lerp(this.smooth.brilliance, this.frequencies.brilliance, factor * 4.5);
        
        // Calculate composite energy (weighted by perceptual importance)
        this.smooth.energy = (
            this.smooth.subBass * 1.5 +
            this.smooth.bass * 1.3 +
            this.smooth.lowMid * 0.9 +
            this.smooth.mid * 0.8 +
            this.smooth.highMid * 0.7 +
            this.smooth.treble * 0.9 +
            this.smooth.brilliance * 0.6
        ) / 6.7;
        
        // Overall volume
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = (sum / data.length) / 255;
        this.smooth.volume = lerp(this.smooth.volume, avg, factor * 2);
        
        // Track peaks for dynamic range
        this.smooth.peakBass = Math.max(this.smooth.peakBass * 0.99, this.smooth.bass);
        this.smooth.peakMid = Math.max(this.smooth.peakMid * 0.99, this.smooth.mid);
        this.smooth.peakTreble = Math.max(this.smooth.peakTreble * 0.99, this.smooth.treble);
        
        // Update visual effects based on frequencies
        this.updateFrequencyEffects(dt);
    }

    /**
     * Frequency-specific visual effects
     */
    updateFrequencyEffects(dt) {
        const intensity = this.analysis.intensityMultiplier;
        const tempo = this.analysis.tempoMultiplier;
        
        // Bass affects pulse and glow
        this.effects.pulseScale = 1.0 + (this.smooth.bass + this.smooth.subBass) * 0.2 * intensity;
        this.effects.bassGlow = (this.smooth.bass + this.smooth.subBass * 1.2) * intensity;
        
        // Mids affect rotation and flow
        const midEnergy = (this.smooth.lowMid + this.smooth.mid + this.smooth.highMid) / 3;
        this.effects.rotation += (0.001 + midEnergy * 0.015 * tempo) * dt;
        this.effects.midFlow = midEnergy * intensity;
        
        // Treble affects sparkle and shimmer
        this.effects.trebleSparkle = (this.smooth.treble + this.smooth.brilliance) * 0.8 * intensity;
        this.effects.shimmer = Math.sin(performance.now() * 0.005) * this.smooth.brilliance * 0.5;
        
        // Wave offset for waveform modes
        this.effects.waveOffset += (0.003 + this.smooth.energy * 0.008 * tempo) * dt;
        
        // Glow intensity (composite)
        this.effects.glowIntensity = (this.effects.bassGlow * 0.6 + this.effects.trebleSparkle * 0.4);
    }

    getBandAvg(data, start, end) {
        if (start >= end || start < 0 || end > data.length) return 0;
        let sum = 0;
        const s = Math.floor(start), e = Math.floor(end);
        for (let i = s; i < e; i++) sum += data[i];
        return (sum / (e - s)) / 255;
    }

    /**
     * Advanced multi-band beat detection with adaptive thresholding
     */
    detectBeats(data) {
        const now = performance.now();
        const beats = { bass: false, mid: false, treble: false, any: false };
        
        // Update energy history for adaptive thresholding
        this.beatDetection.energyHistory[this.beatDetection.historyIndex] = this.smooth.energy;
        this.beatDetection.historyIndex = (this.beatDetection.historyIndex + 1) % 50;
        
        // Calculate average energy and variance
        let sum = 0, sumSq = 0;
        for (let i = 0; i < 50; i++) {
            const e = this.beatDetection.energyHistory[i];
            sum += e;
            sumSq += e * e;
        }
        this.beatDetection.avgEnergy = sum / 50;
        this.beatDetection.energyVariance = (sumSq / 50) - (this.beatDetection.avgEnergy ** 2);
        
        // Adaptive threshold based on variance
        const baseThreshold = this.beatDetection.avgEnergy * this.beatDetection.sensitivity;
        const varianceBoost = Math.sqrt(this.beatDetection.energyVariance) * 0.5;
        
        // Bass beat detection (kick drums)
        const bassEnergy = (this.smooth.subBass + this.smooth.bass) / 2;
        const bassCooldown = this.beatDetection.bass.cooldown;
        if (bassEnergy > baseThreshold + varianceBoost * 0.8 && 
            now - this.beatDetection.bass.lastBeat > bassCooldown) {
            beats.bass = true;
            this.beatDetection.bass.lastBeat = now;
            this.beatDetection.bass.confidence = Math.min(1, (bassEnergy - baseThreshold) / baseThreshold);
        }
        
        // Mid beat detection (snare, claps)
        const midEnergy = (this.smooth.lowMid + this.smooth.mid) / 2;
        const midCooldown = this.beatDetection.mid.cooldown;
        if (midEnergy > baseThreshold * 0.9 && 
            now - this.beatDetection.mid.lastBeat > midCooldown) {
            beats.mid = true;
            this.beatDetection.mid.lastBeat = now;
            this.beatDetection.mid.confidence = Math.min(1, (midEnergy - baseThreshold * 0.9) / (baseThreshold * 0.9));
        }
        
        // Treble beat detection (hi-hats, cymbals)
        const trebleEnergy = (this.smooth.treble + this.smooth.brilliance) / 2;
        const trebleCooldown = this.beatDetection.treble.cooldown;
        if (trebleEnergy > baseThreshold * 0.7 && 
            now - this.beatDetection.treble.lastBeat > trebleCooldown) {
            beats.treble = true;
            this.beatDetection.treble.lastBeat = now;
            this.beatDetection.treble.confidence = Math.min(1, (trebleEnergy - baseThreshold * 0.7) / (baseThreshold * 0.7));
        }
        
        // Any beat detected
        beats.any = beats.bass || beats.mid || beats.treble;
        if (beats.any) {
            this.beatDetection.lastBeat = now;
        }
        
        return beats;
    }

    /**
     * Set track analysis data for enhanced visualizations
     */
    setTrackAnalysis(analysis) {
        if (!analysis) return;
        
        this.analysis.current = analysis;
        
        // Adjust beat detection based on BPM
        if (analysis.bpm && analysis.bpm > 0) {
            const beatInterval = (60000 / analysis.bpm);
            this.beatDetection.bass.cooldown = beatInterval * 0.35;
            this.beatDetection.mid.cooldown = beatInterval * 0.25;
            this.beatDetection.treble.cooldown = beatInterval * 0.15;
            
            // Tempo multiplier for animation speed
            this.analysis.tempoMultiplier = Math.max(0.5, Math.min(2.0, analysis.bpm / 120));
        }
        
        // Intensity multiplier based on energy
        if (analysis.energy !== undefined) {
            this.analysis.intensityMultiplier = 0.5 + analysis.energy * 1.5;
        }
        
        // Mood-based color palette
        if (analysis.mood && this.colors.moodPalettes[analysis.mood]) {
            this.colors.palette = { ...this.colors.moodPalettes[analysis.mood] };
        }
        
        console.log(`🎵 Track analysis applied: BPM=${analysis.bpm}, Energy=${(analysis.energy * 100).toFixed(0)}%, Mood=${analysis.mood}`);
    }

    clearTrackAnalysis() {
        this.analysis.current = null;
        this.analysis.intensityMultiplier = 1.0;
        this.analysis.tempoMultiplier = 1.0;
        this.beatDetection.bass.cooldown = 180;
        this.beatDetection.mid.cooldown = 150;
        this.beatDetection.treble.cooldown = 120;
    }

    updateColors() {
        if (window.currentDominantColor) {
            const { r, g, b } = window.currentDominantColor;
            const [h, s, l] = this.rgbToHsl(r, g, b);
            // Blend with mood palette if available
            if (this.analysis.current && this.analysis.current.mood) {
                const moodPal = this.colors.moodPalettes[this.analysis.current.mood];
                if (moodPal) {
                    this.colors.palette = {
                        h: (h + moodPal.h) / 2,
                        s: Math.max(s, moodPal.s),
                        l: (l + moodPal.l) / 2,
                        range: moodPal.range
                    };
                    return;
                }
            }
            this.colors.palette = { h, s, l, range: 60 };
        }
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) h = s = 0;
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
        }
        return [h * 360, s * 100, l * 100];
    }

    start() {
        if (this.mainAnimationId) return;
        const animate = (time) => {
            if (!this.enabled || !this.canvas) return;
            this.mainAnimationId = requestAnimationFrame(animate);
            this.render(this.canvasCtx, this.canvas, time);
        };
        this.mainAnimationId = requestAnimationFrame(animate);
    }

    stop() {
        if (this.mainAnimationId) {
            cancelAnimationFrame(this.mainAnimationId);
            this.mainAnimationId = null;
        }
    }

    startFullscreen() {
        if (this.fullscreenAnimationId) return;
        const animate = (time) => {
            if (!this.isFullscreen || !this.fullscreenCanvas) return;
            this.fullscreenAnimationId = requestAnimationFrame(animate);
            this.render(this.fullscreenCtx, this.fullscreenCanvas, time);
        };
        this.fullscreenAnimationId = requestAnimationFrame(animate);
    }

    stopFullscreen() {
        if (this.fullscreenAnimationId) {
            cancelAnimationFrame(this.fullscreenAnimationId);
            this.fullscreenAnimationId = null;
        }
        this.isFullscreen = false;
    }

    render(ctx, canvas, time) {
        if (!this.analyser || !this.dataArray) return;
        
        const dt = time - this.performance.lastFrame;
        this.performance.lastFrame = time;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        this.updateSmoothing(this.dataArray, dt);
        this.updateColors();
        const beats = this.detectBeats(this.dataArray);
        
        // Background with trail effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        switch (this.vizMode) {
            case 'nebula': this.drawNebula(ctx, canvas, beats); break;
            case '3dwave': this.draw3DWave(ctx, canvas, beats); break;
            case 'circular': this.drawCircular(ctx, canvas, beats); break;
            case 'particles': this.drawParticles(ctx, canvas, beats); break;
            case 'waveform': this.drawWaveform(ctx, canvas, beats); break;
            case 'spectrum': this.drawSpectrum(ctx, canvas, beats); break;
            case 'radial': this.drawRadialSpectrum(ctx, canvas, beats); break;
            case 'energyflow': this.drawEnergyFlow(ctx, canvas, beats); break;
            default: this.drawBars(ctx, canvas, beats);
        }
    }

    /**
     * Enhanced bar visualization with frequency-specific colors
     */
    drawBars(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const barCount = Math.min(128, this.bufferLength);
        const barWidth = (w / barCount) * 0.9;
        const pal = this.colors.palette;
        
        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor((i / barCount) * this.bufferLength);
            const val = this.dataArray[dataIndex] / 255;
            const barH = val * h * 0.85 * this.effects.pulseScale;
            
            // Color based on frequency range
            let hue = pal.h;
            if (i < barCount * 0.15) hue += pal.range * 0.8; // Bass: warm
            else if (i < barCount * 0.5) hue += pal.range * 0.4; // Mid: neutral
            else hue -= pal.range * 0.2; // Treble: cool
            
            const brightness = pal.l + val * 25 + this.effects.glowIntensity * 10;
            const saturation = Math.min(100, pal.s + val * 15);
            
            // Glow effect on beats
            if (beats.any && val > 0.5) {
                ctx.shadowBlur = 20 * this.effects.glowIntensity;
                ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            } else {
                ctx.shadowBlur = 0;
            }
            
            ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            const x = (i / barCount) * w;
            ctx.fillRect(x, h - barH, barWidth, barH);
        }
        ctx.shadowBlur = 0;
    }

    /**
     * Enhanced circular visualization with multi-band rings
     */
    drawCircular(ctx, canvas, beats) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.4;
        const pal = this.colors.palette;
        
        // Draw multiple rings for different frequency bands
        const rings = [
            { band: 'bass', radius: baseRadius * 0.5, color: 0, width: 4 },
            { band: 'mid', radius: baseRadius * 0.8, color: 0.3, width: 3 },
            { band: 'treble', radius: baseRadius * 1.1, color: 0.6, width: 2 }
        ];
        
        rings.forEach(ring => {
            const radius = ring.radius * this.effects.pulseScale;
            const segments = 180;
            
            ctx.lineWidth = ring.width;
            
            for (let i = 0; i < segments; i++) {
                const dataIndex = Math.floor((i / segments) * this.bufferLength);
                const val = this.dataArray[dataIndex] / 255;
                const angle = (i / segments) * Math.PI * 2 + this.effects.rotation;
                const len = val * radius * 0.6 * this.analysis.intensityMultiplier;
                
                const hue = pal.h + (i / segments) * pal.range + ring.color * pal.range;
                const brightness = pal.l + val * 30;
                
                if (beats.any && val > 0.6) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = `hsl(${hue}, ${pal.s}%, ${brightness}%)`;
                }
                
                ctx.strokeStyle = `hsl(${hue}, ${pal.s}%, ${brightness}%)`;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
                ctx.lineTo(cx + Math.cos(angle) * (radius + len), cy + Math.sin(angle) * (radius + len));
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        });
        
        // Center pulse on bass beats
        if (beats.bass) {
            const pulseRadius = baseRadius * 0.3 * this.effects.pulseScale;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
            grad.addColorStop(0, `hsla(${pal.h}, ${pal.s}%, ${pal.l + 30}%, 0.6)`);
            grad.addColorStop(1, `hsla(${pal.h}, ${pal.s}%, ${pal.l}%, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Enhanced nebula with frequency-triggered particles
     */
    drawNebula(ctx, canvas, beats) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const pal = this.colors.palette;
        
        // Spawn particles based on frequency peaks
        const spawnChance = 0.05 + this.smooth.energy * 0.15;
        
        if (beats.bass && Math.random() < 0.8) {
            // Large bass particles
            for (let i = 0; i < 3; i++) {
                this.spawnParticle({
                    x: cx + (Math.random() - 0.5) * 150,
                    y: cy + (Math.random() - 0.5) * 150,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: (Math.random() - 0.5) * 1.5,
                    size: 40 + Math.random() * 60 * this.analysis.intensityMultiplier,
                    life: 1, decay: 0.003 + Math.random() * 0.005,
                    color: { h: pal.h + Math.random() * 30, s: pal.s, l: pal.l + 10 },
                    type: 'nebula',
                    frequency: 'bass',
                    energy: this.smooth.bass
                });
            }
        }
        
        if (beats.mid && Math.random() < 0.6) {
            // Medium mid particles
            for (let i = 0; i < 2; i++) {
                this.spawnParticle({
                    x: cx + (Math.random() - 0.5) * 200,
                    y: cy + (Math.random() - 0.5) * 200,
                    vx: (Math.random() - 0.5) * 2.5,
                    vy: (Math.random() - 0.5) * 2.5,
                    size: 25 + Math.random() * 40,
                    life: 1, decay: 0.005 + Math.random() * 0.008,
                    color: { h: pal.h + pal.range * 0.4 + Math.random() * 20, s: pal.s + 10, l: pal.l },
                    type: 'nebula',
                    frequency: 'mid',
                    energy: this.smooth.mid
                });
            }
        }
        
        if (beats.treble && Math.random() < 0.4) {
            // Small sparkle particles
            for (let i = 0; i < 4; i++) {
                this.spawnParticle({
                    x: cx + (Math.random() - 0.5) * 250,
                    y: cy + (Math.random() - 0.5) * 250,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4,
                    size: 10 + Math.random() * 20,
                    life: 1, decay: 0.008 + Math.random() * 0.015,
                    color: { h: pal.h - pal.range * 0.3 + Math.random() * 30, s: pal.s + 20, l: pal.l + 20 },
                    type: 'sparkle',
                    frequency: 'treble',
                    energy: this.smooth.treble
                });
            }
        }
        
        // Random ambient particles
        if (Math.random() < spawnChance) {
            this.spawnParticle({
                x: cx + (Math.random() - 0.5) * 180,
                y: cy + (Math.random() - 0.5) * 180,
                vx: (Math.random() - 0.5) * 1.8,
                vy: (Math.random() - 0.5) * 1.8,
                size: 20 + Math.random() * 40,
                life: 1, decay: 0.004 + Math.random() * 0.008,
                color: { h: pal.h + Math.random() * pal.range, s: pal.s, l: pal.l },
                type: 'nebula'
            });
        }
        
        // Render particles
        ctx.globalCompositeOperation = 'screen';
        for (let i = this.particlePool.active.length - 1; i >= 0; i--) {
            const p = this.particlePool.active[i];
            p.x += p.vx * this.analysis.tempoMultiplier;
            p.y += p.vy * this.analysis.tempoMultiplier;
            p.life -= p.decay;
            
            if (p.life <= 0) {
                this.recycleParticle(p, i);
                continue;
            }
            
            const alpha = p.type === 'sparkle' ? p.life * 0.5 : p.life * 0.35;
            const size = p.size * (p.type === 'sparkle' ? 1 + this.effects.trebleSparkle * 0.3 : 1);
            
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
            grad.addColorStop(0, `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${alpha})`);
            grad.addColorStop(0.5, `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${alpha * 0.5})`);
            grad.addColorStop(1, `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, 0)`);
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    /**
     * Enhanced 3D wave with frequency layers
     */
    draw3DWave(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const pal = this.colors.palette;
        const layers = 7;
        
        for (let j = 0; j < layers; j++) {
            ctx.beginPath();
            const depth = j / layers;
            const alpha = 1 - depth * 0.7;
            const hueShift = j * 15;
            const yOffset = depth * 60;
            
            ctx.strokeStyle = `hsla(${pal.h + hueShift}, ${pal.s}%, ${pal.l + depth * 20}%, ${alpha})`;
            ctx.lineWidth = 2 + (1 - depth) * 2;
            
            if (beats.any && j < 3) {
                ctx.shadowBlur = 10 * (1 - depth);
                ctx.shadowColor = ctx.strokeStyle;
            }
            
            const sampleStep = Math.max(1, Math.floor(this.bufferLength / 200));
            for (let i = 0; i < this.bufferLength; i += sampleStep) {
                const val = this.dataArray[i] / 255;
                const x = (i / this.bufferLength) * w;
                const waveY = Math.sin(i * 0.08 + this.effects.waveOffset + j * 0.5) * 25 * (1 - depth);
                const y = h / 2 + (val - 0.5) * h * 0.6 * alpha * this.effects.pulseScale + waveY + yOffset;
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    /**
     * Explosive particle burst visualization
     */
    drawParticles(ctx, canvas, beats) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const pal = this.colors.palette;
        
        // Spawn particles on beats
        if (beats.bass) {
            for (let i = 0; i < 30; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 3 + Math.random() * 6 * this.analysis.intensityMultiplier;
                this.spawnParticle({
                    x: cx, y: cy,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    size: 3 + Math.random() * 6,
                    life: 1, decay: 0.008 + Math.random() * 0.015,
                    color: { h: pal.h + Math.random() * pal.range, s: 100, l: 60 + Math.random() * 20 },
                    frequency: 'bass'
                });
            }
        }
        
        if (beats.mid) {
            for (let i = 0; i < 20; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 2 + Math.random() * 5;
                this.spawnParticle({
                    x: cx, y: cy,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    size: 2 + Math.random() * 4,
                    life: 1, decay: 0.01 + Math.random() * 0.02,
                    color: { h: pal.h + pal.range * 0.5 + Math.random() * 30, s: 90, l: 65 },
                    frequency: 'mid'
                });
            }
        }
        
        if (beats.treble) {
            for (let i = 0; i < 15; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 4 + Math.random() * 7;
                this.spawnParticle({
                    x: cx, y: cy,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    size: 1 + Math.random() * 3,
                    life: 1, decay: 0.015 + Math.random() * 0.025,
                    color: { h: pal.h - pal.range * 0.3 + Math.random() * 40, s: 100, l: 75 },
                    frequency: 'treble'
                });
            }
        }
        
        // Update and render particles
        for (let i = this.particlePool.active.length - 1; i >= 0; i--) {
            const p = this.particlePool.active[i];
            p.x += p.vx * this.analysis.tempoMultiplier;
            p.y += p.vy * this.analysis.tempoMultiplier;
            p.vy += 0.15; // Gravity
            p.life -= p.decay;
            
            if (p.life <= 0 || p.y > canvas.height + 50) {
                this.recycleParticle(p, i);
                continue;
            }
            
            const alpha = p.life;
            ctx.fillStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${alpha})`;
            
            if (p.life > 0.7) {
                ctx.shadowBlur = 8;
                ctx.shadowColor = ctx.fillStyle;
            }
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    /**
     * Smooth waveform visualization
     */
    drawWaveform(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const pal = this.colors.palette;
        
        // Main waveform
        ctx.strokeStyle = `hsl(${pal.h}, ${pal.s}%, ${pal.l + 10}%)`;
        ctx.lineWidth = 3 + this.effects.glowIntensity * 2;
        
        if (beats.any) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = `hsl(${pal.h}, ${pal.s}%, ${pal.l}%)`;
        }
        
        ctx.beginPath();
        const sampleStep = Math.max(1, Math.floor(this.bufferLength / 300));
        for (let i = 0; i < this.bufferLength; i += sampleStep) {
            const val = this.dataArray[i] / 255;
            const x = (i / this.bufferLength) * w;
            const y = h / 2 + (val - 0.5) * h * 0.8 * this.effects.pulseScale;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Filled area below
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = `hsl(${pal.h}, ${pal.s}%, ${pal.l}%)`;
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    /**
     * NEW: Detailed spectrum analyzer with logarithmic bars
     */
    drawSpectrum(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const barCount = 64;
        const barWidth = (w / barCount) * 0.85;
        const pal = this.colors.palette;
        
        for (let i = 0; i < barCount; i++) {
            // Logarithmic frequency mapping
            const logIndex = Math.pow(i / barCount, 1.5) * this.bufferLength;
            const dataIndex = Math.floor(logIndex);
            const val = this.dataArray[dataIndex] / 255;
            
            const barH = val * h * 0.9 * this.effects.pulseScale * this.analysis.intensityMultiplier;
            const x = (i / barCount) * w;
            
            // Frequency-based coloring
            let hue = pal.h;
            if (i < barCount * 0.1) hue += pal.range; // Sub-bass: red
            else if (i < barCount * 0.25) hue += pal.range * 0.7; // Bass: orange
            else if (i < barCount * 0.5) hue += pal.range * 0.3; // Mid: yellow
            else if (i < barCount * 0.75) hue -= pal.range * 0.2; // High-mid: green
            else hue -= pal.range * 0.5; // Treble: blue
            
            const brightness = pal.l + val * 30 + this.effects.glowIntensity * 8;
            const saturation = Math.min(100, pal.s + val * 20);
            
            // Glow on peaks
            if (val > 0.7) {
                ctx.shadowBlur = 15 * val;
                ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            }
            
            // Gradient fill
            const grad = ctx.createLinearGradient(x, h, x, h - barH);
            grad.addColorStop(0, `hsl(${hue}, ${saturation}%, ${brightness}%)`);
            grad.addColorStop(1, `hsl(${hue}, ${saturation}%, ${Math.min(90, brightness + 20)}%)`);
            
            ctx.fillStyle = grad;
            ctx.fillRect(x, h - barH, barWidth, barH);
            ctx.shadowBlur = 0;
        }
    }

    /**
     * NEW: Radial spectrum with center pulse
     */
    drawRadialSpectrum(ctx, canvas, beats) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const maxRadius = Math.min(cx, cy) * 0.9;
        const minRadius = maxRadius * 0.2;
        const pal = this.colors.palette;
        const segments = 128;
        
        ctx.lineWidth = 2;
        
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
            const dataIndex = Math.floor((i / segments) * this.bufferLength);
            const val = this.dataArray[dataIndex] / 255;
            
            const radius = minRadius + val * (maxRadius - minRadius) * this.effects.pulseScale;
            const x1 = cx + Math.cos(angle) * minRadius;
            const y1 = cy + Math.sin(angle) * minRadius;
            const x2 = cx + Math.cos(angle) * radius;
            const y2 = cy + Math.sin(angle) * radius;
            
            const hue = pal.h + (i / segments) * pal.range;
            const brightness = pal.l + val * 35;
            
            if (val > 0.6) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = `hsl(${hue}, ${pal.s}%, ${brightness}%)`;
            }
            
            ctx.strokeStyle = `hsl(${hue}, ${pal.s}%, ${brightness}%)`;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        // Center pulse
        const pulseRadius = minRadius * this.effects.pulseScale * (0.8 + this.smooth.bass * 0.4);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
        grad.addColorStop(0, `hsla(${pal.h}, ${pal.s}%, ${pal.l + 40}%, 0.8)`);
        grad.addColorStop(0.7, `hsla(${pal.h}, ${pal.s}%, ${pal.l + 20}%, 0.4)`);
        grad.addColorStop(1, `hsla(${pal.h}, ${pal.s}%, ${pal.l}%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * NEW: Energy flow visualization with flowing particles
     */
    drawEnergyFlow(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const pal = this.colors.palette;
        
        // Spawn flowing particles based on frequency peaks
        const spawnRate = 0.1 + this.smooth.energy * 0.3;
        
        if (Math.random() < spawnRate) {
            // Find peak frequency
            let peakIndex = 0, peakVal = 0;
            for (let i = 0; i < this.bufferLength; i++) {
                if (this.dataArray[i] > peakVal) {
                    peakVal = this.dataArray[i];
                    peakIndex = i;
                }
            }
            
            const freqRatio = peakIndex / this.bufferLength;
            const yPos = h * (1 - freqRatio);
            
            this.spawnParticle({
                x: 0,
                y: yPos,
                vx: 2 + this.smooth.energy * 4 * this.analysis.tempoMultiplier,
                vy: (Math.random() - 0.5) * 2,
                size: 5 + (peakVal / 255) * 15,
                life: 1,
                decay: 0.005,
                color: {
                    h: pal.h + freqRatio * pal.range,
                    s: pal.s + 20,
                    l: pal.l + (peakVal / 255) * 30
                },
                type: 'flow',
                energy: peakVal / 255
            });
        }
        
        // Update and render flowing particles
        ctx.globalCompositeOperation = 'lighter';
        for (let i = this.particlePool.active.length - 1; i >= 0; i--) {
            const p = this.particlePool.active[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            
            if (p.life <= 0 || p.x > w + 50) {
                this.recycleParticle(p, i);
                continue;
            }
            
            const alpha = p.life * 0.7;
            const size = p.size * (1 + this.effects.glowIntensity * 0.2);
            
            // Trail effect
            ctx.shadowBlur = 20 * p.energy;
            ctx.shadowColor = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${alpha})`;
            
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
            grad.addColorStop(0, `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l + 20}%, ${alpha})`);
            grad.addColorStop(0.5, `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${alpha * 0.6})`);
            grad.addColorStop(1, `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l - 10}%, 0)`);
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
        
        // Frequency spectrum overlay
        ctx.globalAlpha = 0.3;
        const barWidth = w / this.bufferLength;
        for (let i = 0; i < this.bufferLength; i++) {
            const val = this.dataArray[i] / 255;
            const x = (i / this.bufferLength) * w;
            const y = h * (1 - i / this.bufferLength);
            const barH = val * 50;
            
            const hue = pal.h + (i / this.bufferLength) * pal.range;
            ctx.fillStyle = `hsl(${hue}, ${pal.s}%, ${pal.l + val * 20}%)`;
            ctx.fillRect(x, y - barH / 2, barWidth, barH);
        }
        ctx.globalAlpha = 1.0;
    }
}

// Global instance for script.js to find
window.VisualizerManager = VisualizerManager;
console.log('✅ Ultra-Responsive VisualizerManager v4.0 loaded');
