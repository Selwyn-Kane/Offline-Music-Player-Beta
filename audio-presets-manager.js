/* ============================================
   Audio Presets Manager — v1.1
   Dynamic, Context-Aware, Analysis-Driven EQ System
   ============================================ */

class AudioPresetsManager {

    // ─── Static preset definitions ────────────────────────────────────────────

    static PRESETS = {
        flat: {
            name: 'Flat (Reference)',
            bass: 0, mid: 0, treble: 0,
            description: 'No coloration — pure source',
            philosophy: 'Neutral reference for well-mastered tracks',
        },

        // Genre-specific
        electronic: {
            name: 'Electronic / EDM',
            bass: 4, mid: -2, treble: 4,
            description: 'Deep sub-bass with crystalline highs',
            philosophy: 'V-curve emphasising synthetic frequency extremes',
        },
        rock: {
            name: 'Rock',
            bass: 4, mid: 1, treble: 4,
            description: 'Aggressive and punchy rock sound',
            philosophy: 'Enhanced attack and presence without losing guitar body',
        },
        metal: {
            name: 'Metal',
            bass: 3, mid: -1, treble: 4,
            description: 'Tight bass with extreme clarity',
            philosophy: 'Precision and aggression, no muddiness',
        },
        jazz: {
            name: 'Jazz',
            bass: 3, mid: 2, treble: 4,
            description: 'Natural warmth with detailed highs',
            philosophy: 'Preserves acoustic instrument timbre and space',
        },
        classical: {
            name: 'Classical',
            bass: 1, mid: 0, treble: 3,
            description: 'Minimal processing, maximum naturalness',
            philosophy: 'Respects original recording and hall acoustics',
        },
        acoustic: {
            name: 'Acoustic',
            bass: 2, mid: 4, treble: 2,
            description: 'Intimate, warm acoustic character',
            philosophy: 'Midrange-focused for natural instrument tone',
        },
        hiphop: {
            name: 'Hip-Hop',
            bass: 4, mid: -2, treble: 3,
            description: 'Deep bass with crisp vocal presence',
            philosophy: 'Sub-bass emphasis with clear vocal intelligibility',
        },

        // Context-specific
        vocal: {
            name: 'Vocal Clarity',
            bass: -3, mid: 6, treble: 3,
            description: 'Maximised vocal intelligibility',
            philosophy: 'Aggressive presence boost with controlled low-end',
        },
        podcast: {
            name: 'Podcast / Speech',
            bass: -6, mid: 7, treble: 1,
            description: 'Optimised for spoken word',
            philosophy: 'Maximum intelligibility, minimal listener fatigue',
        },
        bassBoost: {
            name: 'Bass Boost',
            bass: 5, mid: -1, treble: 0,
            description: 'Enhanced deep bass for deficient tracks',
            philosophy: 'Adds missing low-end without muddying',
        },
        trebleBoost: {
            name: 'Treble Boost',
            bass: 0, mid: 1, treble: 4,
            description: 'Brightens dark / vintage recordings',
            philosophy: 'Restores lost high-frequency detail',
        },

        // Mastering / quality
        vintageTape: {
            name: 'Vintage Tape',
            bass: 2, mid: 1, treble: 4,
            description: 'Compensates for analog tape aging',
            philosophy: 'Gentle restoration of frequency extremes',
        },
        loudnessWar: {
            name: 'Loudness War Victim',
            bass: 3, mid: 0, treble: 4,
            description: 'Helps over-compressed modern tracks',
            philosophy: 'Attempts to restore dynamic perception',
        },
        liveRecording: {
            name: 'Live Recording',
            bass: 2, mid: 3, treble: 4,
            description: 'Enhances live energy and space',
            philosophy: 'Emphasises ambience and crowd energy',
        },
        lofi: {
            name: 'Lo-Fi',
            bass: 4, mid: 2, treble: -2,
            description: 'Warm, nostalgic character',
            philosophy: 'Embraces imperfection and warmth',
        },
    };

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(bassFilter, midFilter, trebleFilter, debugLog = console.log) {
        this.bassFilter   = bassFilter;
        this.midFilter    = midFilter;
        this.trebleFilter = trebleFilter;
        this._log         = debugLog;

        this.currentPreset            = 'flat';
        this.lastAppliedAnalysis      = null;
        this.dynamicAdjustmentEnabled = true;

        // Keep a reference to the static presets on the instance so callers can
        // reach them via either AudioPresetsManager.PRESETS or instance.staticPresets.
        this.staticPresets = AudioPresetsManager.PRESETS;
    }

    // ─── Public: preset application ───────────────────────────────────────────

    /**
     * Apply a named preset, optionally modified by dynamic track analysis.
     * Gain changes are applied via a 20 ms ramp (setTargetAtTime) to prevent
     * audible pops — identical behaviour to AudioPipeline.setGain().
     * @returns {boolean} true on success
     */
    applyPreset(presetName, trackAnalysis = null) {
        if (!AudioPresetsManager.PRESETS[presetName]) {
            this._log(`⚠️ Unknown preset: "${presetName}", falling back to flat`, 'warning');
            presetName = 'flat';
        }

        const base   = AudioPresetsManager.PRESETS[presetName];
        let   values = { bass: base.bass, mid: base.mid, treble: base.treble };

        if (this.dynamicAdjustmentEnabled && trackAnalysis) {
            values = this._applyDynamicAdjustments(values, trackAnalysis, presetName);
            this.lastAppliedAnalysis = trackAnalysis;
        }

        const bass   = this._clamp(values.bass);
        const mid    = this._clamp(values.mid);
        const treble = this._clamp(values.treble);

        try {
            this._setGain(this.bassFilter,   bass);
            this._setGain(this.midFilter,    mid);
            this._setGain(this.trebleFilter, treble);

            this._updateUISliders(bass, mid, treble);
            this.currentPreset = presetName;

            const note = trackAnalysis ? ' (dynamically adjusted)' : '';
            this._log(`🎛️ Preset: ${base.name} [${this._fmt(bass)} / ${this._fmt(mid)} / ${this._fmt(treble)} dB]${note}`, 'success');
            return true;
        } catch (err) {
            this._log(`❌ Failed to apply preset: ${err.message}`, 'error');
            return false;
        }
    }

    /**
     * Apply arbitrary bass/mid/treble values (manual slider control).
     * @returns {boolean} true on success
     */
    applyCustom(bass, mid, treble) {
        const b = this._clamp(bass);
        const m = this._clamp(mid);
        const t = this._clamp(treble);

        try {
            this._setGain(this.bassFilter,   b);
            this._setGain(this.midFilter,    m);
            this._setGain(this.trebleFilter, t);
            this.currentPreset = 'custom';
            return true;
        } catch (err) {
            this._log(`❌ Failed to apply custom EQ: ${err.message}`, 'error');
            return false;
        }
    }

    // ─── Public: state queries ────────────────────────────────────────────────

    getCurrentPreset() {
        return this.currentPreset;
    }

    getCurrentValues() {
        return {
            bass:   this.bassFilter.gain.value,
            mid:    this.midFilter.gain.value,
            treble: this.trebleFilter.gain.value,
            preset: this.currentPreset,
        };
    }

    getPresetList() {
        return Object.entries(AudioPresetsManager.PRESETS).map(([id, p]) => ({
            id,
            name:        p.name,
            description: p.description,
            philosophy:  p.philosophy,
            values:      `${this._fmt(p.bass)} / ${this._fmt(p.mid)} / ${this._fmt(p.treble)} dB`,
        }));
    }

    getPresetInfo(presetName) {
        const p = AudioPresetsManager.PRESETS[presetName];
        if (!p) return null;
        return { name: p.name, description: p.description, philosophy: p.philosophy, bass: p.bass, mid: p.mid, treble: p.treble };
    }

    // ─── Public: controls ─────────────────────────────────────────────────────

    reset() {
        this.applyPreset('flat');
        this._log('🔄 Reset to flat EQ', 'info');
    }

    setDynamicAdjustments(enabled) {
        this.dynamicAdjustmentEnabled = enabled;
        this._log(`Dynamic EQ adjustments: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }

    loadSavedPreset() {
        try {
            const saved = localStorage.getItem('eqPreset');
            if (saved && AudioPresetsManager.PRESETS[saved]) {
                this.applyPreset(saved);
                this._log(`📂 Loaded saved preset: ${saved}`, 'success');
            }
        } catch (err) {
            this._log(`Failed to load saved preset: ${err.message}`, 'error');
        }
    }

    saveCurrentPreset() {
        try {
            if (this.currentPreset && this.currentPreset !== 'custom') {
                localStorage.setItem('eqPreset', this.currentPreset);
            }
        } catch (err) {
            this._log(`Failed to save preset: ${err.message}`, 'error');
        }
    }

    // ─── Internal: gain application ───────────────────────────────────────────

    /**
     * Smoothly ramp a filter's gain using the same 20 ms time-constant as
     * AudioPipeline.setGain(). Reads the AudioContext from the AudioNode's own
     * `.context` property so we don't need to store a separate reference.
     */
    _setGain(filter, value) {
        if (!filter) return;
        const ctx = filter.context;
        if (ctx) {
            filter.gain.setTargetAtTime(value, ctx.currentTime, 0.02);
        } else {
            // Fallback for test environments where AudioContext is mocked
            filter.gain.value = value;
        }
    }

    // ─── Internal: dynamic adjustments ───────────────────────────────────────

    _applyDynamicAdjustments(preset, analysis, presetName) {
        const adjusted = { ...preset };

        const {
            energy, loudness, loudnessLUFS,
            dynamicRange, frequencyBands,
            spectralCentroid, isVintage,
            vocalProminence, danceability,
            acousticness, instrumentalness,
            mood, bpm,
        } = analysis;

        // ── Derived flags ────────────────────────────────────────────────────

        const bassDeficiency  = frequencyBands?.subBass  < 0.12 && frequencyBands?.bass < 0.18;
        const trebleDeficiency = frequencyBands?.brilliance < 0.08 && spectralCentroid < 1600;
        const midExcess        = frequencyBands?.midrange > 0.35;
        const bassExcess       = (frequencyBands?.subBass + frequencyBands?.bass) > 0.45;

        const isCompressed = dynamicRange?.crestFactor < 6;
        const isHighDR     = dynamicRange?.crestFactor > 12;

        const isDull   = spectralCentroid < 1500;
        const isBright = spectralCentroid > 2500;

        const isQuiet  = loudnessLUFS < -30;

        // ── Adjustment rules (in priority order) ─────────────────────────────

        // RULE 1: Vintage recordings — restore frequency extremes
        if (isVintage) {
            adjusted.treble = Math.min(adjusted.treble + 2, 8);
            adjusted.bass   = Math.min(adjusted.bass   + 1, 4);
            this._log('📼 Vintage: +2 treble, +1 bass', 'info');
        }

        // RULE 2: Over-compressed — restore perceived dynamics
        if (isCompressed && !['flat', 'podcast'].includes(presetName)) {
            adjusted.bass   = Math.min(adjusted.bass   + 2, 4);
            adjusted.treble = Math.min(adjusted.treble + 2, 8);
            this._log('🗜️ Compression: +2 bass, +2 treble', 'info');
        }

        // RULE 3: High dynamic range — preserve with lighter processing
        if (isHighDR && presetName !== 'classical') {
            adjusted.bass   *= 0.7;
            adjusted.mid    *= 0.7;
            adjusted.treble *= 0.7;
            this._log('🎼 High DR: −30% EQ intensity', 'info');
        }

        // RULE 4: Frequency deficiency correction
        if (bassDeficiency && !['podcast', 'vocal'].includes(presetName)) {
            adjusted.bass = Math.min(adjusted.bass + 3, 4);
            this._log('📊 Bass deficiency: +3 bass', 'info');
        }
        if (trebleDeficiency && !['lofi', 'acoustic'].includes(presetName)) {
            adjusted.treble = Math.min(adjusted.treble + 3, 8);
            this._log('✨ Treble deficiency: +3 treble', 'info');
        }

        // RULE 5: Frequency excess correction
        if (bassExcess && energy > 0.7) {
            adjusted.bass = Math.max(adjusted.bass - 2, -2);
            this._log('🎚️ Bass excess: −2 bass', 'info');
        }
        if (midExcess) {
            adjusted.mid = Math.max(adjusted.mid - 2, -3);
            this._log('📦 Mid excess: −2 mid', 'info');
        }

        // RULE 6: Spectral character
        if (isDull && presetName !== 'lofi') {
            adjusted.treble = Math.min(adjusted.treble + 2, 8);
            this._log('🌑 Dull spectrum: +2 treble', 'info');
        }
        if (isBright && energy < 0.4) {
            adjusted.treble = Math.max(adjusted.treble - 2, 0);
            this._log('☀️ Overly bright: −2 treble', 'info');
        }

        // RULE 7: Vocal prominence
        if (vocalProminence > 2.0 && !['vocal', 'podcast'].includes(presetName)) {
            adjusted.mid = Math.min(adjusted.mid + 2, 7);
            this._log('🎤 High vocal prominence: +2 mid', 'info');
        }

        // RULE 8: Acousticness — preserve natural character
        if (acousticness > 0.7 && !['acoustic', 'classical', 'jazz'].includes(presetName)) {
            adjusted.bass   *= 0.8;
            adjusted.treble *= 0.8;
            this._log('🎸 Acoustic character: −20% EQ intensity', 'info');
        }

        // RULE 9: Danceability + bass deficiency
        if (danceability > 0.7 && bassDeficiency) {
            adjusted.bass = Math.min(adjusted.bass + 4, 4);
            this._log('💃 High danceability + low bass: +4 bass', 'info');
        }

        // RULE 10: Energy-based scaling
        if (energy > 0.8 && presetName !== 'flat') {
            adjusted.bass   *= 1.2;
            adjusted.treble *= 1.2;
            this._log('⚡ High energy: +20% EQ intensity', 'info');
        } else if (energy < 0.3 && presetName !== 'flat') {
            adjusted.bass   *= 0.7;
            adjusted.mid    *= 0.7;
            adjusted.treble *= 0.7;
            this._log('🌙 Low energy: −30% EQ intensity', 'info');
        }

        // RULE 11: Mood fine-tuning
        if (mood === 'dark' && !isDull) {
            adjusted.treble = Math.max(adjusted.treble - 1, 0);
            this._log('🌑 Dark mood: −1 treble', 'info');
        }
        if (mood === 'bright' && isDull) {
            adjusted.treble = Math.min(adjusted.treble + 3, 8);
            this._log('☀️ Bright mood: +3 treble', 'info');
        }

        // RULE 12: Fast tempo + danceability
        if (bpm > 150 && danceability > 0.6) {
            adjusted.bass   = Math.min(adjusted.bass   + 1, 4);
            adjusted.treble = Math.min(adjusted.treble + 1, 8);
            this._log('🏃 Fast tempo: +1 bass, +1 treble', 'info');
        }

        // RULE 13: Quiet recordings
        if (isQuiet && presetName !== 'classical') {
            adjusted.bass   = Math.min(adjusted.bass   + 2, 4);
            adjusted.treble = Math.min(adjusted.treble + 2, 8);
            this._log('🔇 Quiet recording: +2 bass, +2 treble', 'info');
        }

        // Absolute safety cap for bass
        adjusted.bass = Math.min(adjusted.bass, 4);

        return adjusted;
    }

    // ─── Internal: UI sync ────────────────────────────────────────────────────

    /**
     * Update the EQ slider elements and their value labels.
     * Values are rounded to 1 decimal place so dynamic float adjustments
     * (e.g. 4 * 1.2 = 4.800000000001) display cleanly.
     */
    _updateUISliders(bass, mid, treble) {
        const pairs = [
            ['eq-bass',   'bass-value',   bass  ],
            ['eq-mid',    'mid-value',    mid   ],
            ['eq-treble', 'treble-value', treble],
        ];
        for (const [sliderId, labelId, value] of pairs) {
            const slider = document.getElementById(sliderId);
            const label  = document.getElementById(labelId);
            const rounded = Math.round(value * 10) / 10; // 1 decimal place
            if (slider) slider.value = rounded;
            if (label)  label.textContent = `${this._fmt(rounded)} dB`;
        }
    }

    // ─── Internal: utilities ──────────────────────────────────────────────────

    /** Clamp a gain value to the safe ±12 dB range. */
    _clamp(value) {
        return Math.max(-12, Math.min(12, value));
    }

    /**
     * Format a gain number for display: rounds to 1 decimal, adds leading '+'.
     * e.g.  4.8 → '+4.8'   -2 → '-2'   0 → '0'
     */
    _fmt(value) {
        const v = Math.round(value * 10) / 10;
        return `${v > 0 ? '+' : ''}${v}`;
    }
}

window.AudioPresetsManager = AudioPresetsManager;
console.log('✅ AudioPresetsManager v1.1 loaded');
