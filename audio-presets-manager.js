/* ============================================
   Audio Presets Manager - ULTRA-REFINED EDITION
   Dynamic, Context-Aware, Analysis-Driven EQ System
   ============================================ */

class AudioPresetsManager {
    constructor(bassFilter, midFilter, trebleFilter, debugLog) {
        this.bassFilter = bassFilter;
        this.midFilter = midFilter;
        this.trebleFilter = trebleFilter;
        this.debugLog = debugLog;
        
        // Core static presets (baseline reference curves)
        this.staticPresets = {
            flat: {
                name: 'Flat (Reference)',
                bass: 0, mid: 0, treble: 0,
                description: 'No coloration - pure source',
                philosophy: 'Neutral reference for well-mastered tracks'
            },
            
            // GENRE-SPECIFIC PRESETS (refined based on typical production characteristics)
            electronic: {
                name: 'Electronic/EDM',
                bass: 4,        // Strong sub-bass for synth bass and kicks
                mid: -2,        // Clear mid scoop for clean separation
                treble: 4,      // Bright highs for synths and hi-hats
                description: 'Deep sub-bass with crystalline highs',
                philosophy: 'V-curve emphasizing synthetic frequency extremes'
            },
            
            rock: {
                name: 'Rock',
                bass: 4,        // Upper bass punch for bass guitar and kick
                mid: 1,         // Slight mid boost for guitar presence (not scooped!)
                treble: 4,      // Bright for cymbals and guitar attack
                description: 'Aggressive and punchy rock sound',
                philosophy: 'Enhanced attack and presence without losing guitar body'
            },
            
            metal: {
                name: 'Metal',
                bass: 3,        // Controlled low-end for tight palm mutes
                mid: -1,        // Slight scoop for modern metal clarity
                treble: 4,      // Very bright for double bass and cymbals
                description: 'Tight bass with extreme clarity',
                philosophy: 'Precision and aggression, no muddiness'
            },
            
            jazz: {
                name: 'Jazz',
                bass: 3,        // Natural upright bass warmth
                mid: 2,         // Piano and horn presence
                treble: 4,      // Cymbal shimmer and ride bell clarity
                description: 'Natural warmth with detailed highs',
                philosophy: 'Preserves acoustic instrument timbre and space'
            },
            
            classical: {
                name: 'Classical',
                bass: 1,        // Very subtle low-end warmth
                mid: 0,         // Completely natural midrange
                treble: 3,      // Gentle air for string section and halls
                description: 'Minimal processing, maximum naturalness',
                philosophy: 'Respects original recording and hall acoustics'
            },
            
            acoustic: {
                name: 'Acoustic',
                bass: 2,        // Body resonance (80-120Hz)
                mid: 4,         // String and vocal clarity
                treble: 2,      // Natural air without harshness
                description: 'Intimate, warm acoustic character',
                philosophy: 'Midrange-focused for natural instrument tone'
            },
            
            hiphop: {
                name: 'Hip-Hop',
                bass: 4,        // Massive sub-bass for 808s
                mid: -2,        // Scooped for vocal clarity
                treble: 3,      // Hi-hat and snare presence
                description: 'Deep bass with crisp vocal presence',
                philosophy: 'Sub-bass emphasis with clear vocal intelligibility'
            },
            
            // CONTEXT-SPECIFIC PRESETS
            vocal: {
                name: 'Vocal Clarity',
                bass: -3,       // High-pass to remove muddiness
                mid: 6,         // Strong presence boost (vowel clarity)
                treble: 3,      // Air for sibilance and breath
                description: 'Maximized vocal intelligibility',
                philosophy: 'Aggressive presence boost with controlled low-end'
            },
            
            podcast: {
                name: 'Podcast/Speech',
                bass: -6,       // Aggressive high-pass (rumble removal)
                mid: 7,         // Very strong presence for clarity
                treble: 1,      // Minimal high-end (avoid sibilance)
                description: 'Optimized for spoken word',
                philosophy: 'Maximum intelligibility, minimal listener fatigue'
            },
            
            bassBoost: {
                name: 'Bass Boost',
                bass: 5,        // Strong sub-bass shelf
                mid: -1,        // Prevent mud buildup
                treble: 0,      // Keep highs neutral
                description: 'Enhanced deep bass for deficient tracks',
                philosophy: 'Adds missing low-end without muddying'
            },
            
            trebleBoost: {
                name: 'Treble Boost',
                bass: 0,        // Leave bass alone
                mid: 1,         // Slight upper-mid lift for clarity
                treble: 4,      // Strong high-shelf for dull recordings
                description: 'Brightens dark/vintage recordings',
                philosophy: 'Restores lost high-frequency detail'
            },
            
            // MASTERING/QUALITY PRESETS
            vintageTape: {
                name: 'Vintage Tape',
                bass: 2,        // Restore some low-end roll-off
                mid: 1,         // Slight warmth
                treble: 4,      // Restore tape high-frequency loss
                description: 'Compensates for analog tape aging',
                philosophy: 'Gentle restoration of frequency extremes'
            },
            
            loudnessWar: {
                name: 'Loudness War Victim',
                bass: 3,        // Restore perceived low-end
                mid: 0,         // Don't add more compression artifacts
                treble: 4,      // Brightness to counteract dullness
                description: 'Helps over-compressed modern tracks',
                philosophy: 'Attempts to restore dynamic perception'
            },
            
            liveRecording: {
                name: 'Live Recording',
                bass: 2,        // Stage/room warmth
                mid: 3,         // Instrument separation
                treble: 4,      // Crowd and cymbal detail
                description: 'Enhances live energy and space',
                philosophy: 'Emphasizes ambience and crowd energy'
            },
            
            lofi: {
                name: 'Lo-Fi',
                bass: 4,        // Warm, rounded low-end
                mid: 2,         // Slight haze
                treble: -2,     // Reduce brightness for vintage vibe
                description: 'Warm, nostalgic character',
                philosophy: 'Embraces imperfection and warmth'
            }
        };
        
        this.currentPreset = 'flat';
        this.lastAppliedAnalysis = null;
        this.dynamicAdjustmentEnabled = true;
    }
    
    /**
     * SMART PRESET APPLICATION - Analyzes track and applies dynamic adjustments
     */
    applyPreset(presetName, trackAnalysis = null) {
        if (!this.staticPresets[presetName]) {
            this.debugLog(`⚠️ Unknown preset: ${presetName}, using flat`, 'warn');
            presetName = 'flat';
        }
        
        const basePreset = this.staticPresets[presetName];
        let finalValues = { ...basePreset };
        
        // DYNAMIC ADJUSTMENT: Modify preset based on track analysis
        if (this.dynamicAdjustmentEnabled && trackAnalysis) {
            finalValues = this.applyDynamicAdjustments(finalValues, trackAnalysis, presetName);
            this.lastAppliedAnalysis = trackAnalysis;
        }
        
        try {
            const bassGain = this.clampGain(finalValues.bass);
            const midGain = this.clampGain(finalValues.mid);
            const trebleGain = this.clampGain(finalValues.treble);
            
            this.bassFilter.gain.value = bassGain;
            this.midFilter.gain.value = midGain;
            this.trebleFilter.gain.value = trebleGain;
            
            this.updateUISliders(bassGain, midGain, trebleGain);
            this.currentPreset = presetName;
            
            const adjustmentNote = trackAnalysis ? ' (dynamically adjusted)' : '';
            this.debugLog(`🎛️ Applied: ${basePreset.name} [${bassGain}/${midGain}/${trebleGain} dB]${adjustmentNote}`, 'success');
            
            return true;
        } catch (err) {
            this.debugLog(`❌ Failed to apply preset: ${err.message}`, 'error');
            return false;
        }
    }
    
    /**
     * DYNAMIC ADJUSTMENTS - Context-aware EQ modifications
     */
    applyDynamicAdjustments(preset, analysis, presetName) {
    const adjusted = { ...preset };
    const {
        energy, loudness, loudnessLUFS,
        dynamicRange, frequencyBands,
        spectralCentroid, isVintage,
        vocalProminence, danceability,
        acousticness, instrumentalness,
        mood, bpm
    } = analysis;
    
    // === FREQUENCY BALANCE ANALYSIS ===
    const bassDeficiency = frequencyBands?.subBass < 0.12 && frequencyBands?.bass < 0.18;
    const trebleDeficiency = frequencyBands?.brilliance < 0.08 && spectralCentroid < 1600;
    const midExcess = frequencyBands?.midrange > 0.35;
    const bassExcess = (frequencyBands?.subBass + frequencyBands?.bass) > 0.45;
    
    // === DYNAMIC RANGE ANALYSIS ===
    const isCompressed = dynamicRange?.crestFactor < 6;
    const isHighDR = dynamicRange?.crestFactor > 12;
    const isModerate = dynamicRange?.crestFactor >= 6 && dynamicRange?.crestFactor <= 12;
    
    // === SPECTRAL CHARACTER ===
    const isDull = spectralCentroid < 1500;
    const isBright = spectralCentroid > 2500;
    const isNatural = spectralCentroid >= 1500 && spectralCentroid <= 2500;
    
    // === LOUDNESS ===
    const isQuiet = loudnessLUFS < -30;
    const isLoud = loudnessLUFS > -10;
    
    // ==========================================
    // ADJUSTMENT RULES (Priority Order)
    // ==========================================
    
    // RULE 1: Vintage Recordings - Handle with care
    if (isVintage) {
        adjusted.treble = Math.min(adjusted.treble + 2, 8);
        adjusted.bass = Math.min(adjusted.bass + 1, 4); // ✅ CAPPED AT 4
        
        this.debugLog('📼 Vintage adjustment: +2 treble, +1 bass', 'info');
    }
    
    // RULE 2: Over-Compressed Tracks - Restore perceived dynamics
    if (isCompressed && !['flat', 'podcast'].includes(presetName)) {
        adjusted.bass = Math.min(adjusted.bass + 2, 4); // ✅ CAPPED AT 4
        adjusted.treble = Math.min(adjusted.treble + 2, 8);
        
        this.debugLog('🗜️ Compression compensation: +2 bass, +2 treble', 'info');
    }
    
    // RULE 3: High Dynamic Range - Preserve with minimal processing
    if (isHighDR && presetName !== 'classical') {
        adjusted.bass *= 0.7;
        adjusted.mid *= 0.7;
        adjusted.treble *= 0.7;
        
        this.debugLog('🎼 High DR detected: -30% EQ intensity', 'info');
    }
    
    // RULE 4: Frequency Deficiency Correction
    if (bassDeficiency && presetName !== 'podcast' && presetName !== 'vocal') {
        adjusted.bass = Math.min(adjusted.bass + 3, 4); // ✅ CAPPED AT 4
        this.debugLog('📊 Bass deficiency: +3 bass', 'info');
    }
    
    if (trebleDeficiency && !['lofi', 'acoustic'].includes(presetName)) {
        adjusted.treble = Math.min(adjusted.treble + 3, 8);
        this.debugLog('✨ Treble deficiency: +3 treble', 'info');
    }
    
    // RULE 5: Frequency Excess Correction
    if (bassExcess && energy > 0.7) {
        adjusted.bass = Math.max(adjusted.bass - 2, -2);
        this.debugLog('🎚️ Bass excess: -2 bass', 'info');
    }
    
    if (midExcess) {
        adjusted.mid = Math.max(adjusted.mid - 2, -3);
        this.debugLog('📦 Mid excess: -2 mid', 'info');
    }
    
    // RULE 6: Spectral Character Adjustment
    if (isDull && presetName !== 'lofi') {
        adjusted.treble = Math.min(adjusted.treble + 2, 8);
        this.debugLog('🌑 Dull spectrum: +2 treble', 'info');
    }
    
    if (isBright && energy < 0.4) {
        adjusted.treble = Math.max(adjusted.treble - 2, 0);
        this.debugLog('☀️ Overly bright: -2 treble', 'info');
    }
    
    // RULE 7: Vocal Prominence Adjustment
    if (vocalProminence > 2.0 && presetName !== 'vocal' && presetName !== 'podcast') {
        adjusted.mid = Math.min(adjusted.mid + 2, 7);
        this.debugLog('🎤 High vocal prominence: +2 mid', 'info');
    }
    
    // RULE 8: Acousticness - Preserve natural character
    if (acousticness > 0.7 && !['acoustic', 'classical', 'jazz'].includes(presetName)) {
        adjusted.bass *= 0.8;
        adjusted.treble *= 0.8;
        this.debugLog('🎸 Acoustic character: -20% EQ intensity', 'info');
    }
    
    // RULE 9: Danceability + Low Bass = Need boost
    if (danceability > 0.7 && bassDeficiency) {
        adjusted.bass = Math.min(adjusted.bass + 4, 4); // ✅ CAPPED AT 4
        this.debugLog('💃 High danceability + low bass: +4 bass', 'info');
    }
    
    // RULE 10: Energy-Based Adjustment
    if (energy > 0.8 && presetName !== 'flat') {
        adjusted.bass *= 1.2;
        adjusted.treble *= 1.2;
        this.debugLog('⚡ High energy: +20% EQ intensity', 'info');
    } else if (energy < 0.3 && presetName !== 'flat') {
        adjusted.bass *= 0.7;
        adjusted.mid *= 0.7;
        adjusted.treble *= 0.7;
        this.debugLog('🌙 Low energy: -30% EQ intensity', 'info');
    }
    
    // RULE 11: Mood-Based Fine-Tuning
    if (mood === 'dark' && !isDull) {
        adjusted.treble = Math.max(adjusted.treble - 1, 0);
        this.debugLog('🌑 Dark mood preservation: -1 treble', 'info');
    }
    
    if (mood === 'bright' && isDull) {
        adjusted.treble = Math.min(adjusted.treble + 3, 8);
        this.debugLog('☀️ Bright mood enhancement: +3 treble', 'info');
    }
    
    // RULE 12: BPM-Based Adjustment
    if (bpm > 150 && danceability > 0.6) {
        adjusted.bass = Math.min(adjusted.bass + 1, 4); // ✅ CAPPED AT 4
        adjusted.treble = Math.min(adjusted.treble + 1, 8);
        this.debugLog('🏃 Fast tempo: +1 bass, +1 treble', 'info');
    }
    
    // RULE 13: Quiet Recordings - Boost perceived loudness
    if (isQuiet && presetName !== 'classical') {
        adjusted.bass = Math.min(adjusted.bass + 2, 4); // ✅ CAPPED AT 4
        adjusted.treble = Math.min(adjusted.treble + 2, 8);
        this.debugLog('🔇 Quiet recording: +2 bass, +2 treble', 'info');
    }
    
    // ✅ FINAL SAFETY CAP - ABSOLUTE MAXIMUM FOR BASS
    adjusted.bass = Math.min(adjusted.bass, 4);
    
    return adjusted;
}
    /**
     * Apply custom EQ values (manual slider control)
     */
    applyCustom(bass, mid, treble) {
        try {
            const bassGain = this.clampGain(bass);
            const midGain = this.clampGain(mid);
            const trebleGain = this.clampGain(treble);
            
            this.bassFilter.gain.value = bassGain;
            this.midFilter.gain.value = midGain;
            this.trebleFilter.gain.value = trebleGain;
            
            this.currentPreset = 'custom';
            return true;
        } catch (err) {
            this.debugLog(`❌ Failed to apply custom EQ: ${err.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Enable/disable dynamic adjustments
     */
    setDynamicAdjustments(enabled) {
        this.dynamicAdjustmentEnabled = enabled;
        this.debugLog(`Dynamic EQ adjustments: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }
    
    /**
     * Clamp gain values to safe range
     */
    clampGain(value) {
        return Math.max(-12, Math.min(12, value));
    }
    
    /**
     * Update UI sliders
     */
    updateUISliders(bass, mid, treble) {
        const eqBass = document.getElementById('eq-bass');
        const eqMid = document.getElementById('eq-mid');
        const eqTreble = document.getElementById('eq-treble');
        const bassValue = document.getElementById('bass-value');
        const midValue = document.getElementById('mid-value');
        const trebleValue = document.getElementById('treble-value');
        
        if (eqBass && bassValue) {
            eqBass.value = bass;
            bassValue.textContent = `${bass > 0 ? '+' : ''}${bass} dB`;
        }
        if (eqMid && midValue) {
            eqMid.value = mid;
            midValue.textContent = `${mid > 0 ? '+' : ''}${mid} dB`;
        }
        if (eqTreble && trebleValue) {
            eqTreble.value = treble;
            trebleValue.textContent = `${treble > 0 ? '+' : ''}${treble} dB`;
        }
    }
    
    /**
     * Get current preset name
     */
    getCurrentPreset() {
        return this.currentPreset;
    }
    
    /**
     * Get current EQ values
     */
    getCurrentValues() {
        return {
            bass: this.bassFilter.gain.value,
            mid: this.midFilter.gain.value,
            treble: this.trebleFilter.gain.value,
            preset: this.currentPreset
        };
    }
    
    /**
     * Get list of all presets
     */
    getPresetList() {
        return Object.entries(this.staticPresets).map(([key, preset]) => ({
            id: key,
            name: preset.name,
            description: preset.description,
            values: `${preset.bass > 0 ? '+' : ''}${preset.bass} / ${preset.mid > 0 ? '+' : ''}${preset.mid} / ${preset.treble > 0 ? '+' : ''}${preset.treble} dB`,
            philosophy: preset.philosophy
        }));
    }
    
    /**
     * Get detailed preset info
     */
    getPresetInfo(presetName) {
        const preset = this.staticPresets[presetName];
        if (!preset) return null;
        
        return {
            name: preset.name,
            description: preset.description,
            philosophy: preset.philosophy,
            bass: preset.bass,
            mid: preset.mid,
            treble: preset.treble
        };
    }
    
    /**
     * Reset to flat
     */
    reset() {
        this.applyPreset('flat');
        this.debugLog('🔄 Reset to flat EQ', 'info');
    }
    /**
     * Load saved preset from localStorage
     */
    loadSavedPreset() {
        try {
            const savedPreset = localStorage.getItem('eqPreset');
            if (savedPreset && this.staticPresets[savedPreset]) {
                this.applyPreset(savedPreset);
                this.debugLog(`📂 Loaded saved preset: ${savedPreset}`, 'success');
            }
        } catch (err) {
            this.debugLog(`Failed to load saved preset: ${err.message}`, 'error');
        }
    }
    
    /**
     * Save current preset to localStorage
     */
    saveCurrentPreset() {
        try {
            if (this.currentPreset && this.currentPreset !== 'custom') {
                localStorage.setItem('eqPreset', this.currentPreset);
            }
        } catch (err) {
            this.debugLog(`Failed to save preset: ${err.message}`, 'error');
        }
    }
}

window.AudioPresetsManager = AudioPresetsManager;