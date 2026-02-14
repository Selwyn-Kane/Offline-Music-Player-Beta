/* ============================================
   VISUALIZER MANAGER v5.0 - MEMORY LEAK FIXED
   Ultra-responsive, music-intelligent visualizations

   CRITICAL FIXES FROM v4.0:
   - destroy() method added (script.js called it; it didn't exist)
   - rAF IDs tracked in a Set; stale-ID restart bug fixed
   - Dead loop exit left mainAnimationId truthy, blocking restart → FIXED
   - No initialized/destroyed guards → stray callbacks wrote to null refs → FIXED
   - analysis.cache was a never-populated dead Map → removed
   - particlePool.maxSize hardcoded at 1200 regardless of device tier → FIXED
   - Canvas contexts never nulled on destroy → FIXED
   - performance.qualityLevel tracked but never used → wired to rendering → FIXED
   - No setQualityProfile() hook for PerformanceManager → ADDED
   ============================================ */

class VisualizerManager {
    constructor() {
        // ── State guards ───────────────────────────────────────────────────────
        this.state = {
            initialized: false,
            destroyed:   false
        };

        // ── Canvas references ──────────────────────────────────────────────────
        this.canvas          = null;
        this.canvasCtx       = null;
        this.fullscreenCanvas = null;
        this.fullscreenCtx   = null;

        // ── Audio analysis ─────────────────────────────────────────────────────
        this.analyser    = null;
        this.dataArray   = null;
        this.bufferLength = null;

        // ── Animation control ──────────────────────────────────────────────────
        // FIXED: Single IDs replaced with a Set so double-start can't lose an ID
        this.resources = {
            animationFrames: new Set()
        };
        this.mainAnimationId       = null;
        this.fullscreenAnimationId = null;

        this.enabled      = true;
        this.isFullscreen = false;
        this.vizMode      = this._loadVizMode();

        // ── Device tier (detected once, used to size the particle pool) ────────
        this._deviceTier = this._detectDeviceTier();

        // ── Performance / quality ──────────────────────────────────────────────
        // FIXED: qualityLevel is now actually read in drawing code
        this.performance = {
            fps:              60,
            targetFPS:        60,
            lastFrame:        performance.now(),
            frameCount:       0,
            adaptiveQuality:  true,
            qualityLevel:     1.0   // 0.25 | 0.5 | 0.75 | 1.0  (set by PerformanceManager)
        };

        // ── Quality profile pushed by PerformanceManager ───────────────────────
        // FIXED: now has a real setter so the manager can actually change quality
        this._qualityProfile = {
            fftSize:      2048,
            barCount:     64,
            effects:      true,
            updateInterval: 16.67   // ms — target 60 FPS
        };

        // ── Track analysis ─────────────────────────────────────────────────────
        // FIXED: removed the dead `cache: new Map()` that was never populated
        this.analysis = {
            current:             null,
            previous:            null,
            intensityMultiplier: 1.0,
            tempoMultiplier:     1.0
        };

        // ── Beat detection ─────────────────────────────────────────────────────
        this.beatDetection = {
            energyHistory: new Float32Array(50),
            historyIndex:  0,
            bass:    { lastBeat: 0, threshold: 0, cooldown: 180, confidence: 0 },
            mid:     { lastBeat: 0, threshold: 0, cooldown: 150, confidence: 0 },
            treble:  { lastBeat: 0, threshold: 0, cooldown: 120, confidence: 0 },
            lastBeat:        0,
            sensitivity:     1.3,
            minCooldown:     100,
            energyVariance:  0,
            avgEnergy:       0
        };

        // ── 7-band frequency analysis ──────────────────────────────────────────
        this.frequencies = {
            subBass:   0, bass: 0, lowMid: 0, mid: 0,
            highMid:   0, treble: 0, brilliance: 0
        };

        this.smooth = {
            subBass: 0, bass: 0, lowMid: 0, mid: 0,
            highMid: 0, treble: 0, brilliance: 0,
            energy:  0, volume: 0, rotation: 0, hue: 0,
            peakBass: 0, peakMid: 0, peakTreble: 0
        };

        // ── Particle system ────────────────────────────────────────────────────
        // FIXED: pool size is now device-tier aware, not hardcoded at 1200
        const poolSize = { high: 1200, medium: 600, low: 200 }[this._deviceTier];
        this.particlePool = {
            active:    [],
            inactive:  [],
            maxSize:   poolSize,
            spawnRate: 0
        };
        this._initParticlePool();

        // ── Color system ───────────────────────────────────────────────────────
        this.colors = {
            palette: { h: 340, s: 80, l: 50, range: 60 },
            albumArt:   null,
            lastUpdate: 0,
            moodPalettes: {
                energetic: { h: 0,   s: 90, l: 55, range: 60 },
                happy:     { h: 50,  s: 85, l: 60, range: 50 },
                calm:      { h: 200, s: 70, l: 55, range: 40 },
                sad:       { h: 240, s: 60, l: 45, range: 30 },
                dark:      { h: 280, s: 50, l: 35, range: 40 },
                neutral:   { h: 180, s: 60, l: 50, range: 60 }
            }
        };

        // ── Visual effects ─────────────────────────────────────────────────────
        this.effects = {
            pulseScale:     1.0,
            rotation:       0,
            waveOffset:     0,
            glowIntensity:  0,
            shimmer:        0,
            bassGlow:       0,
            trebleSparkle:  0,
            midFlow:        0
        };

        // ── Frequency band indices (calculated after audio init) ───────────────
        this.bandIndices = {
            subBass:   { start: 0, end: 0 },
            bass:      { start: 0, end: 0 },
            lowMid:    { start: 0, end: 0 },
            mid:       { start: 0, end: 0 },
            highMid:   { start: 0, end: 0 },
            treble:    { start: 0, end: 0 },
            brilliance:{ start: 0, end: 0 }
        };

        this.state.initialized = true;
        console.log(`🎨 VisualizerManager v5.0 initialized (${this._deviceTier} tier, pool=${poolSize})`);
    }

    // ─── DEVICE TIER ───────────────────────────────────────────────────────────

    _detectDeviceTier() {
        const memory = navigator.deviceMemory || 4;
        const cores  = navigator.hardwareConcurrency || 2;
        if (memory >= 8 && cores >= 4) return 'high';
        if (memory >= 4 && cores >= 2) return 'medium';
        return 'low';
    }

    // ─── PERFORMANCE MANAGER INTEGRATION ──────────────────────────────────────

    /**
     * Called by PerformanceManager when quality needs to change.
     * FIXED: This hook now actually exists and modifies rendering behavior.
     *
     * @param {object} profile - { fftSize, barCount, effects, updateInterval }
     */
    setQualityProfile(profile) {
        if (!profile) return;
        Object.assign(this._qualityProfile, profile);

        // Translate to a 0–1 quality level for drawing shortcuts
        this.performance.qualityLevel = Math.min(
            1.0,
            (this._qualityProfile.fftSize / 2048) *
            (this._qualityProfile.barCount / 64)
        );

        console.log(`🎨 Visualizer quality updated: FFT=${profile.fftSize}, Bars=${profile.barCount}, Effects=${profile.effects}`);
    }

    // ─── PARTICLE POOL ─────────────────────────────────────────────────────────

    _initParticlePool() {
        for (let i = 0; i < this.particlePool.maxSize; i++) {
            this.particlePool.inactive.push(this._createParticle());
        }
    }

    _createParticle() {
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

    _spawnParticle(config) {
        // FIXED: Guard against pool exhaustion on low-end devices
        if (this.particlePool.active.length >= this.particlePool.maxSize) return null;
        const p = this.particlePool.inactive.pop() || this._createParticle();
        Object.assign(p, config);
        this.particlePool.active.push(p);
        return p;
    }

    _recycleParticle(p, index) {
        this.particlePool.active.splice(index, 1);
        if (this.particlePool.inactive.length < this.particlePool.maxSize) {
            this.particlePool.inactive.push(p);
        }
    }

    _clearParticlePool() {
        this.particlePool.active   = [];
        this.particlePool.inactive = [];
    }

    // ─── VIZ MODE PERSISTENCE ─────────────────────────────────────────────────

    _loadVizMode() {
        try { return localStorage.getItem('visualizerMode') || 'nebula'; }
        catch (e) { return 'nebula'; }
    }

    _saveVizMode() {
        try { localStorage.setItem('visualizerMode', this.vizMode); }
        catch (e) { /* storage unavailable — ignore */ }
    }

    setVizMode(mode) {
        const validModes = ['bars', 'circular', 'waveform', 'particles', 'nebula', '3dwave', 'spectrum', 'radial', 'energyflow'];
        if (!validModes.includes(mode)) return;
        this.vizMode = mode;
        this._saveVizMode();
        // Clear particles so old-mode ones don't bleed into new mode
        this.particlePool.active = [];
    }

    // ─── CANVAS INIT ───────────────────────────────────────────────────────────

    initMainVisualizer(canvas, analyser, dataArray, bufferLength) {
        this.canvas       = canvas;
        this.canvasCtx    = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.analyser     = analyser;
        this.dataArray    = dataArray;
        this.bufferLength = bufferLength;
        this._calculateFrequencyBands();
        this._resizeCanvas();
    }

    initFullscreenVisualizer(canvas, analyser, dataArray, bufferLength) {
        this.fullscreenCanvas = canvas;
        this.fullscreenCtx    = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.analyser         = analyser;
        this.dataArray        = dataArray;
        this.bufferLength     = bufferLength;
        this.isFullscreen     = true;
        this._calculateFrequencyBands();
        this._resizeFullscreenCanvas();
    }

    _calculateFrequencyBands() {
        if (!this.analyser) return;
        const sampleRate = this.analyser.context.sampleRate || 48000;
        const binWidth   = (sampleRate / 2) / this.bufferLength;
        const freqToBin  = (f) => Math.floor(f / binWidth);

        this.bandIndices.subBass   = { start: freqToBin(20),   end: freqToBin(60)    };
        this.bandIndices.bass      = { start: freqToBin(60),   end: freqToBin(250)   };
        this.bandIndices.lowMid    = { start: freqToBin(250),  end: freqToBin(500)   };
        this.bandIndices.mid       = { start: freqToBin(500),  end: freqToBin(2000)  };
        this.bandIndices.highMid   = { start: freqToBin(2000), end: freqToBin(4000)  };
        this.bandIndices.treble    = { start: freqToBin(4000), end: freqToBin(8000)  };
        this.bandIndices.brilliance= { start: freqToBin(8000), end: Math.min(freqToBin(20000), this.bufferLength) };

        console.log('📊 Frequency bands calculated');
    }

    _resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
    }

    _resizeFullscreenCanvas() {
        if (!this.fullscreenCanvas) return;
        this.fullscreenCanvas.width  = window.innerWidth;
        this.fullscreenCanvas.height = window.innerHeight;
    }

    // ─── ANIMATION LOOP MANAGEMENT ─────────────────────────────────────────────

    /**
     * Start the main visualizer loop.
     *
     * FIXED: Old guard was `if (this.mainAnimationId) return` — if the loop
     * exited early (enabled=false / no canvas) without calling cancelAnimationFrame,
     * mainAnimationId was left truthy and start() could never restart.
     * Now we always cancel any stale ID before starting a fresh loop.
     */
    start() {
        if (this.state.destroyed) return;

        // Cancel any stale rAF that might have exited the loop silently
        this._cancelMainLoop();

        const animate = (time) => {
            // FIXED: Check destroyed first, before anything else
            if (this.state.destroyed || !this.enabled || !this.canvas) {
                this._cancelMainLoop();
                return;
            }

            const id = requestAnimationFrame(animate);
            this.mainAnimationId = id;
            this.resources.animationFrames.add(id);

            this.render(this.canvasCtx, this.canvas, time);
        };

        const id = requestAnimationFrame(animate);
        this.mainAnimationId = id;
        this.resources.animationFrames.add(id);
    }

    stop() {
        this._cancelMainLoop();
    }

    startFullscreen() {
        if (this.state.destroyed) return;

        this._cancelFullscreenLoop();

        const animate = (time) => {
            if (this.state.destroyed || !this.isFullscreen || !this.fullscreenCanvas) {
                this._cancelFullscreenLoop();
                return;
            }

            const id = requestAnimationFrame(animate);
            this.fullscreenAnimationId = id;
            this.resources.animationFrames.add(id);

            this.render(this.fullscreenCtx, this.fullscreenCanvas, time);
        };

        const id = requestAnimationFrame(animate);
        this.fullscreenAnimationId = id;
        this.resources.animationFrames.add(id);
    }

    stopFullscreen() {
        this._cancelFullscreenLoop();
        this.isFullscreen = false;
    }

    _cancelMainLoop() {
        if (this.mainAnimationId) {
            cancelAnimationFrame(this.mainAnimationId);
            this.resources.animationFrames.delete(this.mainAnimationId);
            this.mainAnimationId = null;
        }
    }

    _cancelFullscreenLoop() {
        if (this.fullscreenAnimationId) {
            cancelAnimationFrame(this.fullscreenAnimationId);
            this.resources.animationFrames.delete(this.fullscreenAnimationId);
            this.fullscreenAnimationId = null;
        }
    }

    // ─── TRACK ANALYSIS ────────────────────────────────────────────────────────

    setTrackAnalysis(analysis) {
        if (!analysis) return;
        this.analysis.previous = this.analysis.current;
        this.analysis.current  = analysis;

        if (analysis.bpm && analysis.bpm > 0) {
            const beatInterval = 60000 / analysis.bpm;
            this.beatDetection.bass.cooldown   = beatInterval * 0.35;
            this.beatDetection.mid.cooldown    = beatInterval * 0.25;
            this.beatDetection.treble.cooldown = beatInterval * 0.15;
            this.analysis.tempoMultiplier = Math.max(0.5, Math.min(2.0, analysis.bpm / 120));
        }

        if (analysis.energy !== undefined) {
            this.analysis.intensityMultiplier = 0.5 + analysis.energy * 1.5;
        }

        if (analysis.mood && this.colors.moodPalettes[analysis.mood]) {
            this.colors.palette = { ...this.colors.moodPalettes[analysis.mood] };
        }

        console.log(`🎵 Track analysis applied: BPM=${analysis.bpm}, Energy=${(analysis.energy * 100).toFixed(0)}%, Mood=${analysis.mood}`);
    }

    clearTrackAnalysis() {
        this.analysis.current  = null;
        this.analysis.previous = null;
        this.analysis.intensityMultiplier = 1.0;
        this.analysis.tempoMultiplier     = 1.0;
        this.beatDetection.bass.cooldown   = 180;
        this.beatDetection.mid.cooldown    = 150;
        this.beatDetection.treble.cooldown = 120;
    }

    // ─── FREQUENCY ANALYSIS ────────────────────────────────────────────────────

    _getBandAvg(data, start, end) {
        if (start >= end || start < 0 || end > data.length) return 0;
        let sum = 0;
        const s = Math.floor(start), e = Math.floor(end);
        for (let i = s; i < e; i++) sum += data[i];
        return (sum / (e - s)) / 255;
    }

    _analyzeFrequencies(data) {
        this.frequencies.subBass   = this._getBandAvg(data, this.bandIndices.subBass.start,    this.bandIndices.subBass.end);
        this.frequencies.bass      = this._getBandAvg(data, this.bandIndices.bass.start,       this.bandIndices.bass.end);
        this.frequencies.lowMid    = this._getBandAvg(data, this.bandIndices.lowMid.start,     this.bandIndices.lowMid.end);
        this.frequencies.mid       = this._getBandAvg(data, this.bandIndices.mid.start,        this.bandIndices.mid.end);
        this.frequencies.highMid   = this._getBandAvg(data, this.bandIndices.highMid.start,    this.bandIndices.highMid.end);
        this.frequencies.treble    = this._getBandAvg(data, this.bandIndices.treble.start,     this.bandIndices.treble.end);
        this.frequencies.brilliance= this._getBandAvg(data, this.bandIndices.brilliance.start, this.bandIndices.brilliance.end);
    }

    _updateSmoothing(data, dt) {
        const lerp   = (a, b, t) => a + (b - a) * Math.min(1, t);
        const factor = Math.min(1, dt / 100);

        this._analyzeFrequencies(data);

        this.smooth.subBass    = lerp(this.smooth.subBass,    this.frequencies.subBass,    factor * 2.5);
        this.smooth.bass       = lerp(this.smooth.bass,       this.frequencies.bass,       factor * 2.5);
        this.smooth.lowMid     = lerp(this.smooth.lowMid,     this.frequencies.lowMid,     factor * 3.0);
        this.smooth.mid        = lerp(this.smooth.mid,        this.frequencies.mid,        factor * 3.0);
        this.smooth.highMid    = lerp(this.smooth.highMid,    this.frequencies.highMid,    factor * 3.5);
        this.smooth.treble     = lerp(this.smooth.treble,     this.frequencies.treble,     factor * 4.0);
        this.smooth.brilliance = lerp(this.smooth.brilliance, this.frequencies.brilliance, factor * 4.5);

        this.smooth.energy = (
            this.smooth.subBass    * 1.5 +
            this.smooth.bass       * 1.3 +
            this.smooth.lowMid     * 0.9 +
            this.smooth.mid        * 0.8 +
            this.smooth.highMid    * 0.7 +
            this.smooth.treble     * 0.9 +
            this.smooth.brilliance * 0.6
        ) / 6.7;

        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = (sum / data.length) / 255;
        this.smooth.volume = lerp(this.smooth.volume, avg, factor * 2);

        this.smooth.peakBass   = Math.max(this.smooth.peakBass   * 0.99, this.smooth.bass);
        this.smooth.peakMid    = Math.max(this.smooth.peakMid    * 0.99, this.smooth.mid);
        this.smooth.peakTreble = Math.max(this.smooth.peakTreble * 0.99, this.smooth.treble);

        this._updateFrequencyEffects(dt);
    }

    _updateFrequencyEffects(dt) {
        const intensity = this.analysis.intensityMultiplier;
        const tempo     = this.analysis.tempoMultiplier;

        this.effects.pulseScale    = 1.0 + (this.smooth.bass + this.smooth.subBass) * 0.2 * intensity;
        this.effects.bassGlow      = (this.smooth.bass + this.smooth.subBass * 1.2) * intensity;

        const midEnergy = (this.smooth.lowMid + this.smooth.mid + this.smooth.highMid) / 3;
        this.effects.rotation     += (0.001 + midEnergy * 0.015 * tempo) * dt;
        this.effects.midFlow       = midEnergy * intensity;

        this.effects.trebleSparkle = (this.smooth.treble + this.smooth.brilliance) * 0.8 * intensity;
        this.effects.shimmer       = Math.sin(performance.now() * 0.005) * this.smooth.brilliance * 0.5;
        this.effects.waveOffset   += (0.003 + this.smooth.energy * 0.008 * tempo) * dt;
        this.effects.glowIntensity = this.effects.bassGlow * 0.6 + this.effects.trebleSparkle * 0.4;
    }

    // ─── BEAT DETECTION ────────────────────────────────────────────────────────

    _detectBeats(data) {
        const now   = performance.now();
        const beats = { bass: false, mid: false, treble: false, any: false };

        this.beatDetection.energyHistory[this.beatDetection.historyIndex] = this.smooth.energy;
        this.beatDetection.historyIndex = (this.beatDetection.historyIndex + 1) % 50;

        let sum = 0, sumSq = 0;
        for (let i = 0; i < 50; i++) {
            const e = this.beatDetection.energyHistory[i];
            sum   += e;
            sumSq += e * e;
        }
        this.beatDetection.avgEnergy     = sum / 50;
        this.beatDetection.energyVariance= (sumSq / 50) - (this.beatDetection.avgEnergy ** 2);

        const baseThreshold  = this.beatDetection.avgEnergy * this.beatDetection.sensitivity;
        const varianceBoost  = Math.sqrt(this.beatDetection.energyVariance) * 0.5;

        const bassEnergy = (this.smooth.subBass + this.smooth.bass) / 2;
        if (bassEnergy > baseThreshold + varianceBoost * 0.8 &&
            now - this.beatDetection.bass.lastBeat > this.beatDetection.bass.cooldown) {
            beats.bass = true;
            this.beatDetection.bass.lastBeat   = now;
            this.beatDetection.bass.confidence = Math.min(1, (bassEnergy - baseThreshold) / baseThreshold);
        }

        const midEnergy = (this.smooth.lowMid + this.smooth.mid) / 2;
        if (midEnergy > baseThreshold * 0.9 &&
            now - this.beatDetection.mid.lastBeat > this.beatDetection.mid.cooldown) {
            beats.mid = true;
            this.beatDetection.mid.lastBeat = now;
        }

        const trebleEnergy = (this.smooth.treble + this.smooth.brilliance) / 2;
        if (trebleEnergy > baseThreshold * 0.7 &&
            now - this.beatDetection.treble.lastBeat > this.beatDetection.treble.cooldown) {
            beats.treble = true;
            this.beatDetection.treble.lastBeat = now;
        }

        beats.any = beats.bass || beats.mid || beats.treble;
        if (beats.any) this.beatDetection.lastBeat = now;

        return beats;
    }

    // ─── COLOR SYSTEM ──────────────────────────────────────────────────────────

    _updateColors() {
        if (window.currentDominantColor) {
            const { r, g, b } = window.currentDominantColor;
            const [h, s, l]   = this._rgbToHsl(r, g, b);
            const mood = this.analysis.current?.mood;
            if (mood && this.colors.moodPalettes[mood]) {
                const mp = this.colors.moodPalettes[mood];
                this.colors.palette = {
                    h: (h + mp.h) / 2,
                    s: Math.max(s, mp.s),
                    l: (l + mp.l) / 2,
                    range: mp.range
                };
            } else {
                this.colors.palette = { h, s, l, range: 60 };
            }
        }
    }

    _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else                h = (r - g) / d + 4;
            h /= 6;
        }
        return [h * 360, s * 100, l * 100];
    }

    // ─── MAIN RENDER ───────────────────────────────────────────────────────────

    render(ctx, canvas, time) {
        // FIXED: Guard against destroyed state — stray rAF callbacks can still fire
        if (this.state.destroyed || !this.analyser || !this.dataArray) return;

        const dt = time - this.performance.lastFrame;
        this.performance.lastFrame = time;

        this.analyser.getByteFrequencyData(this.dataArray);
        this._updateSmoothing(this.dataArray, dt);
        this._updateColors();
        const beats = this._detectBeats(this.dataArray);

        // FIXED: qualityLevel now actually controls the trail opacity and glow budget
        const trailAlpha = 0.1 + (1 - this.performance.qualityLevel) * 0.1;
        ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        switch (this.vizMode) {
            case 'nebula':     this._drawNebula(ctx, canvas, beats);         break;
            case '3dwave':     this._draw3DWave(ctx, canvas, beats);         break;
            case 'circular':   this._drawCircular(ctx, canvas, beats);       break;
            case 'particles':  this._drawParticles(ctx, canvas, beats);      break;
            case 'waveform':   this._drawWaveform(ctx, canvas, beats);       break;
            case 'spectrum':   this._drawSpectrum(ctx, canvas, beats);       break;
            case 'radial':     this._drawRadialSpectrum(ctx, canvas, beats); break;
            case 'energyflow': this._drawEnergyFlow(ctx, canvas, beats);     break;
            default:           this._drawBars(ctx, canvas, beats);
        }
    }

    // ─── DRAW: BARS ────────────────────────────────────────────────────────────

    _drawBars(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        // FIXED: qualityLevel controls bar count — low-quality = fewer bars
        const barCount = Math.min(
            Math.round(this._qualityProfile.barCount * this.performance.qualityLevel),
            this.bufferLength
        );
        const barWidth = (w / barCount) * 0.9;
        const pal = this.colors.palette;
        const effectsOn = this._qualityProfile.effects;

        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor((i / barCount) * this.bufferLength);
            const val   = this.dataArray[dataIndex] / 255;
            const barH  = val * h * 0.85 * this.effects.pulseScale;
            let hue     = pal.h;
            if      (i < barCount * 0.15) hue += pal.range * 0.8;
            else if (i < barCount * 0.5)  hue += pal.range * 0.4;
            else                           hue -= pal.range * 0.2;

            const brightness = pal.l + val * 25 + this.effects.glowIntensity * 10;
            const saturation = Math.min(100, pal.s + val * 15);

            if (effectsOn && beats.any && val > 0.5) {
                ctx.shadowBlur  = 20 * this.effects.glowIntensity;
                ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            } else {
                ctx.shadowBlur = 0;
            }

            ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
            ctx.fillRect((i / barCount) * w, h - barH, barWidth, barH);
        }
        ctx.shadowBlur = 0;
    }

    // ─── DRAW: CIRCULAR ────────────────────────────────────────────────────────

    _drawCircular(ctx, canvas, beats) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.4;
        const pal = this.colors.palette;
        const effectsOn = this._qualityProfile.effects;

        const rings = [
            { radius: baseRadius * 0.5, colorOffset: 0,   width: 4 },
            { radius: baseRadius * 0.8, colorOffset: 0.3, width: 3 },
            { radius: baseRadius * 1.1, colorOffset: 0.6, width: 2 }
        ];

        rings.forEach(ring => {
            const radius   = ring.radius * this.effects.pulseScale;
            const segments = Math.round(180 * this.performance.qualityLevel);
            ctx.lineWidth  = ring.width;

            for (let i = 0; i < segments; i++) {
                const dataIndex = Math.floor((i / segments) * this.bufferLength);
                const val   = this.dataArray[dataIndex] / 255;
                const angle = (i / segments) * Math.PI * 2 + this.effects.rotation;
                const len   = val * radius * 0.6 * this.analysis.intensityMultiplier;
                const hue   = pal.h + (i / segments) * pal.range + ring.colorOffset * pal.range;
                const brightness = pal.l + val * 30;

                if (effectsOn && beats.any && val > 0.6) {
                    ctx.shadowBlur  = 15;
                    ctx.shadowColor = `hsl(${hue}, ${pal.s}%, ${brightness}%)`;
                }

                ctx.strokeStyle = `hsl(${hue}, ${pal.s}%, ${brightness}%)`;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * radius,       cy + Math.sin(angle) * radius);
                ctx.lineTo(cx + Math.cos(angle) * (radius+len), cy + Math.sin(angle) * (radius+len));
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        });

        if (beats.bass) {
            const r    = baseRadius * 0.3 * this.effects.pulseScale;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, `hsla(${pal.h}, ${pal.s}%, ${pal.l+30}%, 0.6)`);
            grad.addColorStop(1, `hsla(${pal.h}, ${pal.s}%, ${pal.l}%, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ─── DRAW: NEBULA ──────────────────────────────────────────────────────────

    _drawNebula(ctx, canvas, beats) {
        const cx  = canvas.width / 2, cy = canvas.height / 2;
        const pal = this.colors.palette;
        const spawnChance = 0.05 + this.smooth.energy * 0.15;

        if (beats.bass && Math.random() < 0.8) {
            for (let i = 0; i < 3; i++) {
                this._spawnParticle({
                    x: cx+(Math.random()-0.5)*150, y: cy+(Math.random()-0.5)*150,
                    vx:(Math.random()-0.5)*1.5, vy:(Math.random()-0.5)*1.5,
                    size:  40+Math.random()*60*this.analysis.intensityMultiplier,
                    life:  1, decay: 0.003+Math.random()*0.005,
                    color: { h:pal.h+Math.random()*30, s:pal.s, l:pal.l+10 },
                    type:  'nebula', frequency:'bass', energy:this.smooth.bass
                });
            }
        }
        if (beats.mid && Math.random() < 0.6) {
            for (let i = 0; i < 2; i++) {
                this._spawnParticle({
                    x: cx+(Math.random()-0.5)*200, y: cy+(Math.random()-0.5)*200,
                    vx:(Math.random()-0.5)*2.5, vy:(Math.random()-0.5)*2.5,
                    size:  25+Math.random()*40, life:1, decay:0.005+Math.random()*0.008,
                    color: { h:pal.h+pal.range*0.4+Math.random()*20, s:pal.s+10, l:pal.l },
                    type:  'nebula', frequency:'mid', energy:this.smooth.mid
                });
            }
        }
        if (beats.treble && Math.random() < 0.4) {
            for (let i = 0; i < 4; i++) {
                this._spawnParticle({
                    x: cx+(Math.random()-0.5)*250, y: cy+(Math.random()-0.5)*250,
                    vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4,
                    size:  10+Math.random()*20, life:1, decay:0.008+Math.random()*0.015,
                    color: { h:pal.h-pal.range*0.3+Math.random()*30, s:pal.s+20, l:pal.l+20 },
                    type:  'sparkle', frequency:'treble', energy:this.smooth.treble
                });
            }
        }
        if (Math.random() < spawnChance) {
            this._spawnParticle({
                x:cx+(Math.random()-0.5)*180, y:cy+(Math.random()-0.5)*180,
                vx:(Math.random()-0.5)*1.8, vy:(Math.random()-0.5)*1.8,
                size:  20+Math.random()*40, life:1, decay:0.004+Math.random()*0.008,
                color: { h:pal.h+Math.random()*pal.range, s:pal.s, l:pal.l },
                type:  'nebula'
            });
        }

        ctx.globalCompositeOperation = 'screen';
        for (let i = this.particlePool.active.length-1; i >= 0; i--) {
            const p = this.particlePool.active[i];
            p.x  += p.vx * this.analysis.tempoMultiplier;
            p.y  += p.vy * this.analysis.tempoMultiplier;
            p.life -= p.decay;
            if (p.life <= 0) { this._recycleParticle(p, i); continue; }
            const alpha = p.type==='sparkle' ? p.life*0.5 : p.life*0.35;
            const size  = p.size * (p.type==='sparkle' ? 1+this.effects.trebleSparkle*0.3 : 1);
            const grad  = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,size);
            grad.addColorStop(0,   `hsla(${p.color.h},${p.color.s}%,${p.color.l}%,${alpha})`);
            grad.addColorStop(0.5, `hsla(${p.color.h},${p.color.s}%,${p.color.l}%,${alpha*0.5})`);
            grad.addColorStop(1,   `hsla(${p.color.h},${p.color.s}%,${p.color.l}%,0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // ─── DRAW: 3D WAVE ─────────────────────────────────────────────────────────

    _draw3DWave(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const pal = this.colors.palette;
        // FIXED: layer count respects qualityLevel
        const layers     = Math.round(7 * this.performance.qualityLevel);
        const effectsOn  = this._qualityProfile.effects;
        const sampleStep = Math.max(1, Math.floor(this.bufferLength / (200 * this.performance.qualityLevel)));

        for (let j = 0; j < layers; j++) {
            ctx.beginPath();
            const depth = j / layers;
            const alpha = 1 - depth * 0.7;
            ctx.strokeStyle = `hsla(${pal.h + j*15}, ${pal.s}%, ${pal.l + depth*20}%, ${alpha})`;
            ctx.lineWidth   = 2 + (1-depth)*2;
            if (effectsOn && beats.any && j < 3) {
                ctx.shadowBlur  = 10*(1-depth);
                ctx.shadowColor = ctx.strokeStyle;
            }
            const yOffset = depth * 60;
            for (let i = 0; i < this.bufferLength; i += sampleStep) {
                const val  = this.dataArray[i] / 255;
                const x    = (i / this.bufferLength) * w;
                const waveY= Math.sin(i*0.08 + this.effects.waveOffset + j*0.5) * 25*(1-depth);
                const y    = h/2 + (val-0.5)*h*0.6*alpha*this.effects.pulseScale + waveY + yOffset;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    // ─── DRAW: PARTICLES ──────────────────────────────────────────────────────

    _drawParticles(ctx, canvas, beats) {
        const cx = canvas.width/2, cy = canvas.height/2;
        const pal = this.colors.palette;

        if (beats.bass) {
            for (let i = 0; i < 30; i++) {
                const ang = Math.random()*Math.PI*2;
                const spd = 3+Math.random()*6*this.analysis.intensityMultiplier;
                this._spawnParticle({
                    x:cx, y:cy, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
                    size:3+Math.random()*6, life:1, decay:0.008+Math.random()*0.015,
                    color:{h:pal.h+Math.random()*pal.range, s:100, l:60+Math.random()*20},
                    frequency:'bass'
                });
            }
        }
        if (beats.mid) {
            for (let i = 0; i < 20; i++) {
                const ang = Math.random()*Math.PI*2;
                const spd = 2+Math.random()*5;
                this._spawnParticle({
                    x:cx, y:cy, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
                    size:2+Math.random()*4, life:1, decay:0.01+Math.random()*0.02,
                    color:{h:pal.h+pal.range*0.5+Math.random()*30, s:90, l:65},
                    frequency:'mid'
                });
            }
        }
        if (beats.treble) {
            for (let i = 0; i < 15; i++) {
                const ang = Math.random()*Math.PI*2;
                const spd = 4+Math.random()*7;
                this._spawnParticle({
                    x:cx, y:cy, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
                    size:1+Math.random()*3, life:1, decay:0.015+Math.random()*0.025,
                    color:{h:pal.h-pal.range*0.3+Math.random()*40, s:100, l:75},
                    frequency:'treble'
                });
            }
        }

        for (let i = this.particlePool.active.length-1; i >= 0; i--) {
            const p = this.particlePool.active[i];
            p.x += p.vx * this.analysis.tempoMultiplier;
            p.y += p.vy * this.analysis.tempoMultiplier;
            p.vy += 0.15;
            p.life -= p.decay;
            if (p.life <= 0 || p.y > canvas.height+50) { this._recycleParticle(p,i); continue; }
            ctx.fillStyle = `hsla(${p.color.h},${p.color.s}%,${p.color.l}%,${p.life})`;
            if (this._qualityProfile.effects && p.life > 0.7) {
                ctx.shadowBlur  = 8;
                ctx.shadowColor = ctx.fillStyle;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // ─── DRAW: WAVEFORM ────────────────────────────────────────────────────────

    _drawWaveform(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const pal = this.colors.palette;
        ctx.strokeStyle = `hsl(${pal.h}, ${pal.s}%, ${pal.l+10}%)`;
        ctx.lineWidth   = 3 + this.effects.glowIntensity*2;
        if (this._qualityProfile.effects && beats.any) {
            ctx.shadowBlur  = 20;
            ctx.shadowColor = `hsl(${pal.h}, ${pal.s}%, ${pal.l}%)`;
        }
        ctx.beginPath();
        const sampleStep = Math.max(1, Math.floor(this.bufferLength / (300 * this.performance.qualityLevel)));
        for (let i = 0; i < this.bufferLength; i += sampleStep) {
            const val = this.dataArray[i]/255;
            const x   = (i/this.bufferLength)*w;
            const y   = h/2 + (val-0.5)*h*0.8*this.effects.pulseScale;
            i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle   = `hsl(${pal.h}, ${pal.s}%, ${pal.l}%)`;
        ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // ─── DRAW: SPECTRUM ────────────────────────────────────────────────────────

    _drawSpectrum(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const barCount = Math.round(64 * this.performance.qualityLevel);
        const barWidth = (w / barCount) * 0.85;
        const pal = this.colors.palette;

        for (let i = 0; i < barCount; i++) {
            const logIndex = Math.pow(i/barCount, 1.5)*this.bufferLength;
            const val      = this.dataArray[Math.floor(logIndex)] / 255;
            const barH     = val*h*0.9*this.effects.pulseScale*this.analysis.intensityMultiplier;
            let hue        = pal.h;
            if      (i < barCount*0.10) hue += pal.range;
            else if (i < barCount*0.25) hue += pal.range*0.7;
            else if (i < barCount*0.50) hue += pal.range*0.3;
            else if (i < barCount*0.75) hue -= pal.range*0.2;
            else                         hue -= pal.range*0.5;
            const brightness = pal.l + val*30 + this.effects.glowIntensity*8;
            const saturation = Math.min(100, pal.s+val*20);
            if (this._qualityProfile.effects && val > 0.7) {
                ctx.shadowBlur = 15*val;
                ctx.shadowColor= `hsl(${hue},${saturation}%,${brightness}%)`;
            }
            const grad = ctx.createLinearGradient((i/barCount)*w, h, (i/barCount)*w, h-barH);
            grad.addColorStop(0, `hsl(${hue},${saturation}%,${brightness}%)`);
            grad.addColorStop(1, `hsl(${hue},${saturation}%,${Math.min(90,brightness+20)}%)`);
            ctx.fillStyle = grad;
            ctx.fillRect((i/barCount)*w, h-barH, barWidth, barH);
            ctx.shadowBlur = 0;
        }
    }

    // ─── DRAW: RADIAL SPECTRUM ─────────────────────────────────────────────────

    _drawRadialSpectrum(ctx, canvas, beats) {
        const cx = canvas.width/2, cy = canvas.height/2;
        const maxRadius = Math.min(cx,cy)*0.9;
        const minRadius = maxRadius*0.2;
        const pal       = this.colors.palette;
        const segments  = Math.round(128 * this.performance.qualityLevel);
        ctx.lineWidth   = 2;

        for (let i = 0; i < segments; i++) {
            const angle = (i/segments)*Math.PI*2 - Math.PI/2;
            const val   = this.dataArray[Math.floor((i/segments)*this.bufferLength)] / 255;
            const radius= minRadius + val*(maxRadius-minRadius)*this.effects.pulseScale;
            const hue   = pal.h + (i/segments)*pal.range;
            const bright= pal.l + val*35;
            if (this._qualityProfile.effects && val > 0.6) {
                ctx.shadowBlur  = 10;
                ctx.shadowColor = `hsl(${hue},${pal.s}%,${bright}%)`;
            }
            ctx.strokeStyle = `hsl(${hue},${pal.s}%,${bright}%)`;
            ctx.beginPath();
            ctx.moveTo(cx+Math.cos(angle)*minRadius, cy+Math.sin(angle)*minRadius);
            ctx.lineTo(cx+Math.cos(angle)*radius,    cy+Math.sin(angle)*radius);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        const pr   = minRadius*this.effects.pulseScale*(0.8+this.smooth.bass*0.4);
        const grad = ctx.createRadialGradient(cx,cy,0, cx,cy,pr);
        grad.addColorStop(0,   `hsla(${pal.h},${pal.s}%,${pal.l+40}%,0.8)`);
        grad.addColorStop(0.7, `hsla(${pal.h},${pal.s}%,${pal.l+20}%,0.4)`);
        grad.addColorStop(1,   `hsla(${pal.h},${pal.s}%,${pal.l}%,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx,cy,pr,0,Math.PI*2);
        ctx.fill();
    }

    // ─── DRAW: ENERGY FLOW ─────────────────────────────────────────────────────

    _drawEnergyFlow(ctx, canvas, beats) {
        const w = canvas.width, h = canvas.height;
        const pal = this.colors.palette;
        const spawnRate = 0.1 + this.smooth.energy*0.3;

        if (Math.random() < spawnRate) {
            let peakIndex = 0, peakVal = 0;
            for (let i = 0; i < this.bufferLength; i++) {
                if (this.dataArray[i] > peakVal) { peakVal = this.dataArray[i]; peakIndex = i; }
            }
            const freqRatio = peakIndex/this.bufferLength;
            this._spawnParticle({
                x:0, y:h*(1-freqRatio),
                vx:2+this.smooth.energy*4*this.analysis.tempoMultiplier, vy:(Math.random()-0.5)*2,
                size:5+(peakVal/255)*15, life:1, decay:0.005,
                color:{ h:pal.h+freqRatio*pal.range, s:pal.s+20, l:pal.l+(peakVal/255)*30 },
                type:'flow', energy:peakVal/255
            });
        }

        ctx.globalCompositeOperation = 'lighter';
        for (let i = this.particlePool.active.length-1; i >= 0; i--) {
            const p = this.particlePool.active[i];
            p.x += p.vx; p.y += p.vy; p.life -= p.decay;
            if (p.life <= 0 || p.x > w+50) { this._recycleParticle(p,i); continue; }
            const alpha = p.life*0.7;
            const size  = p.size*(1+this.effects.glowIntensity*0.2);
            if (this._qualityProfile.effects) {
                ctx.shadowBlur  = 20*p.energy;
                ctx.shadowColor = `hsla(${p.color.h},${p.color.s}%,${p.color.l}%,${alpha})`;
            }
            const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,size);
            grad.addColorStop(0,   `hsla(${p.color.h},${p.color.s}%,${p.color.l+20}%,${alpha})`);
            grad.addColorStop(0.5, `hsla(${p.color.h},${p.color.s}%,${p.color.l}%,${alpha*0.6})`);
            grad.addColorStop(1,   `hsla(${p.color.h},${p.color.s}%,${p.color.l-10}%,0)`);
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(p.x,p.y,size,0,Math.PI*2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';

        if (this._qualityProfile.effects) {
            ctx.globalAlpha = 0.3;
            const barWidth  = w/this.bufferLength;
            for (let i = 0; i < this.bufferLength; i++) {
                const val  = this.dataArray[i]/255;
                const barH = val*50;
                const hue  = pal.h+(i/this.bufferLength)*pal.range;
                ctx.fillStyle = `hsl(${hue},${pal.s}%,${pal.l+val*20}%)`;
                ctx.fillRect((i/this.bufferLength)*w, h*(1-i/this.bufferLength)-barH/2, barWidth, barH);
            }
            ctx.globalAlpha = 1.0;
        }
    }

    // ─── DESTROY ───────────────────────────────────────────────────────────────

    /**
     * CRITICAL NEW: Complete teardown.
     * Called by MusicPlayerApp.destroy() and PerformanceManager on mode change.
     *
     * Sequence:
     *  1. Set destroyed flag immediately so any in-flight rAF callbacks abort
     *  2. Cancel every tracked animation frame
     *  3. Clear both particle pools (free 600–1200 objects)
     *  4. Null canvas context references
     *  5. Null audio analysis references
     *  6. Null analysis data
     */
    destroy() {
        if (this.state.destroyed) {
            console.warn('⚠️ VisualizerManager already destroyed');
            return;
        }

        console.log('🧹 Destroying VisualizerManager...');

        // 1. Flag first — stops all rAF callbacks on their next tick
        this.state.destroyed = true;
        this.enabled         = false;

        // 2. Cancel every tracked animation frame
        this.resources.animationFrames.forEach(id => cancelAnimationFrame(id));
        this.resources.animationFrames.clear();
        this.mainAnimationId       = null;
        this.fullscreenAnimationId = null;

        // 3. Clear particle pools
        this._clearParticlePool();

        // 4. Null canvas contexts so GC can collect them
        this.canvasCtx       = null;
        this.fullscreenCtx   = null;
        this.canvas          = null;
        this.fullscreenCanvas = null;

        // 5. Null audio analysis
        this.analyser    = null;
        this.dataArray   = null;
        this.bufferLength= null;

        // 6. Null analysis data
        this.analysis.current  = null;
        this.analysis.previous = null;

        this.state.initialized = false;
        console.log('✅ VisualizerManager destroyed successfully');
    }
}

window.VisualizerManager = VisualizerManager;
console.log('✅ VisualizerManager v5.0 loaded - Memory Leak Fixed');
