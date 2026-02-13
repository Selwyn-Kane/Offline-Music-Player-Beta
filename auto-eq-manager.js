/* ============================================
   Auto-EQ Manager - ULTRA-REFINED EDITION
   Multi-Dimensional Analysis-Driven Decision System
   ============================================ */

class AutoEQManager {
    constructor(audioPresetsManager, debugLog) {
        this.presetsManager = audioPresetsManager;
        this.debugLog = debugLog;
        
        this.enabled = false;
        this.lastAppliedPreset = null;
        this.confidenceThreshold = 30; // Lowered - more aggressive matching
        
        // Decision weights (fine-tuned for optimal results)
        this.weights = {
            genre: 0.30,              // Genre is strong indicator
            spectral: 0.20,           // Spectral characteristics matter
            energy: 0.15,             // Energy level important
            frequencyBalance: 0.15,   // Actual frequency content critical
            dynamics: 0.10,           // Dynamic range matters
            context: 0.10             // Other contextual factors
        };
    }
    
    /**
     * MAIN DECISION ENGINE - Multi-dimensional analysis
     */
    selectPresetForTrack(track) {
        if (!track.analysis) {
            this.debugLog('⚠️ No analysis data - using flat EQ', 'warn');
            return 'flat';
        }
        
        const { analysis, metadata } = track;
        const genre = metadata?.genre?.toLowerCase() || '';
        
        // Log key metrics
        this.debugLog(`📊 Track: E=${(analysis.energy * 100).toFixed(0)}% | BPM=${analysis.bpm} | SC=${analysis.spectralCentroid?.toFixed(0)}Hz | DR=${analysis.dynamicRange?.crestFactor?.toFixed(1)}dB | Vintage=${analysis.isVintage}`, 'info');
        
        // === PHASE 1: HARD RULES (Override everything) ===
        const hardRuleResult = this.applyHardRules(analysis, genre);
        if (hardRuleResult) {
            this.debugLog(`🎯 Hard rule match: ${hardRuleResult.preset} (${hardRuleResult.reason})`, 'success');
            return hardRuleResult.preset;
        }
        
        // === PHASE 2: COMBO DETECTION (Specific multi-factor patterns) ===
        const comboResult = this.detectComboPatterns(analysis, genre);
        if (comboResult.confidence >= this.confidenceThreshold) {
            this.debugLog(`🎸 Combo pattern: ${comboResult.preset} (${comboResult.confidence.toFixed(1)}/100 - ${comboResult.reason})`, 'success');
            return comboResult.preset;
        }
        
        // === PHASE 3: MULTI-DIMENSIONAL SCORING ===
        const decision = this.multiDimensionalScoring(analysis, genre);
        
        if (decision.confidence >= this.confidenceThreshold) {
            this.debugLog(`✅ Auto-EQ: ${decision.preset} (${decision.confidence.toFixed(1)}/100 - ${decision.reason})`, 'success');
            return decision.preset;
        } else {
            this.debugLog(`🎚️ Auto-EQ: flat (best: ${decision.preset}@${decision.confidence.toFixed(1)}, below ${this.confidenceThreshold} threshold)`, 'info');
            return 'flat';
        }
    }
    
    /**
 * PHASE 1: Hard Rules - Non-negotiable patterns
 */
applyHardRules(analysis, genre) {
    const {
        energy, danceability, speechiness,
        instrumentalness, frequencyBands,
        dynamicRange, spectralCentroid,
        vocalProminence, bpm
    } = analysis;
    
    // RULE 1: Podcast/Speech Detection (STRICT - must be actual speech)
    if (speechiness > 0.66 && instrumentalness < 0.1) {
        // Additional checks to avoid false positives with rap/singing
        const isActualSpeech = 
            energy < 0.35 && 
            danceability < 0.30 && 
            vocalProminence > 2.0 &&
            dynamicRange?.crestFactor > 8; // Speech has high dynamic range
        
        if (isActualSpeech) {
            return {
                preset: 'podcast',
                reason: 'Speech-dominant content detected',
                confidence: 95
            };
        }
    }
        
        // RULE 2: Pure Instrumental Classical (unmistakable signature)
        if (dynamicRange?.crestFactor > 14 && 
            energy < 0.4 && 
            instrumentalness > 0.85 &&
            spectralCentroid < 2200) {
            return {
                preset: 'classical',
                reason: 'Orchestral/classical signature: high DR + low energy + instrumental',
                confidence: 90
            };
        }
        
        // RULE 3: Extreme Sub-Bass Deficiency in Dance Music
        if (frequencyBands && 
            frequencyBands.subBass < 0.08 && 
            danceability > 0.75 && 
            energy > 0.65 &&
            bpm > 110) {
            return {
                preset: 'bassBoost',
                reason: 'Dance track with severe sub-bass deficiency',
                confidence: 85
            };
        }
        
        // RULE 4: Extreme Treble Deficiency (dull vintage/lossy file)
        if (spectralCentroid < 1200 && 
            frequencyBands?.brilliance < 0.05) {
            return {
                preset: 'trebleBoost',
                reason: 'Extremely dull recording needs brightening',
                confidence: 85
            };
        }
        
        // RULE 5: Over-Compressed Loudness War Victim
        if (dynamicRange?.crestFactor < 5 && 
            energy > 0.7 &&
            !genre.includes('podcast')) {
            return {
                preset: 'loudnessWar',
                reason: 'Severely over-compressed modern track',
                confidence: 80
            };
        }
        
        return null;
    }
    
    /**
     * PHASE 2: Combo Pattern Detection - Specific multi-factor signatures
     */
    detectComboPatterns(analysis, genre) {
        const {
            energy, danceability, bpm, spectralCentroid,
            frequencyBands, dynamicRange, isVintage,
            acousticness, mood, vocalProminence
        } = analysis;
        
        const patterns = [];
        
        // === VINTAGE GENRE COMBOS ===
        
        // Vintage Rock (60s-80s rock with tape characteristics)
        if (isVintage && energy > 0.5 && energy < 0.8 && 
            frequencyBands?.midrange > 0.25 &&
            spectralCentroid < 2000) {
            patterns.push({
                preset: 'vintageTape',
                confidence: 75,
                reason: 'Vintage rock recording'
            });
        }
        
        // Vintage Jazz (tape warmth + dynamics)
        if (isVintage && dynamicRange?.crestFactor > 10 &&
            energy < 0.6 && spectralCentroid < 1800) {
            patterns.push({
                preset: 'jazz',
                confidence: 70,
                reason: 'Vintage jazz recording'
            });
        }
        
        // === MODERN GENRE COMBOS ===
        
        // Modern Electronic (sub-bass + brightness + energy)
        if (frequencyBands?.subBass > 0.15 && 
            spectralCentroid > 2000 &&
            energy > 0.65 && danceability > 0.6 &&
            bpm > 110) {
            patterns.push({
                preset: 'electronic',
                confidence: 80,
                reason: 'Modern electronic dance music'
            });
        }
        
        // Modern Hip-Hop (808 bass + vocal + mid-tempo)
        if (frequencyBands?.subBass > 0.18 &&
            vocalProminence > 1.3 &&
            bpm >= 70 && bpm <= 110 &&
            energy > 0.5) {
            patterns.push({
                preset: 'hiphop',
                confidence: 75,
                reason: 'Modern hip-hop production'
            });
        }
        
        // Modern Metal (tight + bright + aggressive)
        if (energy > 0.75 && 
            spectralCentroid > 2500 &&
            dynamicRange?.crestFactor < 10 &&
            frequencyBands?.bass < 0.25 &&
            bpm > 130) {
            patterns.push({
                preset: 'metal',
                confidence: 75,
                reason: 'Modern metal production'
            });
        }
        
        // === ACOUSTIC COMBOS ===
        
        // Acoustic Singer-Songwriter (intimate + vocal + natural)
        if (acousticness > 0.7 &&
            vocalProminence > 1.5 &&
            energy < 0.6 &&
            frequencyBands?.midrange > 0.28) {
            patterns.push({
                preset: 'acoustic',
                confidence: 75,
                reason: 'Acoustic vocal-focused recording'
            });
        }
        
        // Live Recording (crowd noise + dynamics + space)
        if (dynamicRange?.crestFactor > 11 &&
            frequencyBands?.brilliance > 0.12 &&
            energy > 0.6) {
            patterns.push({
                preset: 'liveRecording',
                confidence: 65,
                reason: 'Live concert recording'
            });
        }
        
        // === MOOD-BASED COMBOS ===
        
        // Lo-Fi Chill (warm + dull + low energy)
        if (mood === 'calm' && 
            spectralCentroid < 1500 &&
            energy < 0.45 &&
            danceability < 0.5) {
            patterns.push({
                preset: 'lofi',
                confidence: 70,
                reason: 'Lo-fi chill characteristics'
            });
        }
        
        // Energetic Rock (not metal, but punchy)
        if (mood === 'energetic' &&
            energy > 0.6 && energy < 0.85 &&
            frequencyBands?.midrange > 0.25 &&
            bpm > 100 && bpm < 150) {
            patterns.push({
                preset: 'rock',
                confidence: 70,
                reason: 'Energetic rock signature'
            });
        }
        
        // Return best match
        if (patterns.length > 0) {
            patterns.sort((a, b) => b.confidence - a.confidence);
            return patterns[0];
        }
        
        return { confidence: 0 };
    }
    
    /**
     * PHASE 3: Multi-Dimensional Scoring System
     */
    multiDimensionalScoring(analysis, genre) {
        const scores = {};
        
        // Get all preset candidates
        const presets = [
            'electronic', 'rock', 'metal', 'jazz', 'classical',
            'acoustic', 'hiphop', 'vocal', 'bassBoost', 'trebleBoost',
            'vintageTape', 'loudnessWar', 'liveRecording', 'lofi'
        ];
        
        for (const preset of presets) {
            const score = this.calculatePresetScore(preset, analysis, genre);
            scores[preset] = score;
        }
        
        // Find best match
        const sorted = Object.entries(scores)
            .sort((a, b) => b[1].total - a[1].total);
        
        const best = sorted[0];
        
        return {
            preset: best[0],
            confidence: best[1].total,
            reason: best[1].reason,
            breakdown: best[1].breakdown
        };
    }
    
    /**
     * Calculate weighted score for a specific preset
     */
    calculatePresetScore(preset, analysis, genre) {
        const breakdown = {
            genre: 0,
            spectral: 0,
            energy: 0,
            frequency: 0,
            dynamics: 0,
            context: 0
        };
        
        const {
            energy, bpm, danceability, spectralCentroid,
            frequencyBands, dynamicRange, vocalProminence,
            acousticness, mood, isVintage, instrumentalness
        } = analysis;
        
        // === GENRE SCORE ===
        breakdown.genre = this.scoreGenreMatch(preset, genre) * this.weights.genre * 100;
        
        // === SPECTRAL SCORE ===
        breakdown.spectral = this.scoreSpectralMatch(preset, spectralCentroid, frequencyBands) * this.weights.spectral * 100;
        
        // === ENERGY SCORE ===
        breakdown.energy = this.scoreEnergyMatch(preset, energy, danceability, bpm) * this.weights.energy * 100;
        
        // === FREQUENCY BALANCE SCORE ===
        breakdown.frequency = this.scoreFrequencyMatch(preset, frequencyBands) * this.weights.frequencyBalance * 100;
        
        // === DYNAMICS SCORE ===
        breakdown.dynamics = this.scoreDynamicsMatch(preset, dynamicRange) * this.weights.dynamics * 100;
        
        // === CONTEXT SCORE ===
        breakdown.context = this.scoreContextMatch(preset, {
            vocalProminence, acousticness, mood, isVintage, instrumentalness
        }) * this.weights.context * 100;
        
        const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
        
        // Generate reason from highest scoring factors
        const topFactors = Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .filter(([_, score]) => score > 5)
            .map(([factor, _]) => factor);
        
        const reason = topFactors.length > 0 
            ? `Strong ${topFactors.join(' + ')} match`
            : 'General characteristics match';
        
        return {
            total,
            breakdown,
            reason
        };
    }
    
    /**
     * Individual scoring functions (0-1 range)
     */
    
    scoreGenreMatch(preset, genre) {
        const genreMap = {
            electronic: ['electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'dnb', 'synthwave'],
            rock: ['rock', 'alternative', 'indie rock', 'punk', 'grunge'],
            metal: ['metal', 'heavy metal', 'death metal', 'black metal', 'metalcore'],
            jazz: ['jazz', 'bebop', 'swing', 'blues', 'fusion'],
            classical: ['classical', 'orchestral', 'symphony', 'opera', 'baroque', 'chamber'],
            acoustic: ['acoustic', 'folk', 'singer-songwriter', 'country', 'bluegrass'],
            hiphop: ['hip hop', 'hip-hop', 'rap', 'trap'],
            vocal: ['pop', 'r&b', 'rnb', 'soul', 'gospel']
        };
        
        const matchingGenres = genreMap[preset] || [];
        
        for (const g of matchingGenres) {
            if (genre.includes(g)) return 1.0;
        }
        
        // Partial match
        for (const g of matchingGenres) {
            if (g.includes(genre) || genre.includes(g)) return 0.5;
        }
        
        return 0;
    }
    
    scoreSpectralMatch(preset, spectralCentroid, frequencyBands) {
        const profiles = {
            electronic: { centroidMin: 1800, centroidMax: 3500, brightness: 'high' },
            rock: { centroidMin: 1500, centroidMax: 2800, brightness: 'medium-high' },
            metal: { centroidMin: 2200, centroidMax: 3500, brightness: 'very-high' },
            jazz: { centroidMin: 1400, centroidMax: 2200, brightness: 'medium' },
            classical: { centroidMin: 1200, centroidMax: 2000, brightness: 'natural' },
            acoustic: { centroidMin: 1300, centroidMax: 2000, brightness: 'warm' },
            hiphop: { centroidMin: 1500, centroidMax: 2500, brightness: 'medium' },
            vocal: { centroidMin: 1800, centroidMax: 2800, brightness: 'present' },
            bassBoost: { centroidMin: 1200, centroidMax: 2500, brightness: 'any' },
            trebleBoost: { centroidMin: 800, centroidMax: 1600, brightness: 'dull' },
            vintageTape: { centroidMin: 1000, centroidMax: 1800, brightness: 'dull' },
            loudnessWar: { centroidMin: 1500, centroidMax: 2800, brightness: 'compressed' },
            liveRecording: { centroidMin: 1500, centroidMax: 2500, brightness: 'natural' },
            lofi: { centroidMin: 1000, centroidMax: 1600, brightness: 'warm-dull' }
        };
        
        const profile = profiles[preset];
        if (!profile) return 0;
        
        // Score based on centroid range
        const centroidScore = spectralCentroid >= profile.centroidMin && spectralCentroid <= profile.centroidMax ? 1.0 : 
                             Math.max(0, 1 - Math.abs(spectralCentroid - (profile.centroidMin + profile.centroidMax) / 2) / 1000);
        
        return centroidScore;
    }
    
    scoreEnergyMatch(preset, energy, danceability, bpm) {
        const profiles = {
            electronic: { energyMin: 0.6, energyMax: 1.0, danceMin: 0.6, bpmMin: 110, bpmMax: 150 },
            rock: { energyMin: 0.5, energyMax: 0.9, danceMin: 0.4, bpmMin: 100, bpmMax: 160 },
            metal: { energyMin: 0.7, energyMax: 1.0, danceMin: 0.3, bpmMin: 130, bpmMax: 200 },
            jazz: { energyMin: 0.3, energyMax: 0.7, danceMin: 0.2, bpmMin: 80, bpmMax: 140 },
            classical: { energyMin: 0.1, energyMax: 0.5, danceMin: 0.0, bpmMin: 40, bpmMax: 120 },
            acoustic: { energyMin: 0.2, energyMax: 0.6, danceMin: 0.2, bpmMin: 70, bpmMax: 130 },
            hiphop: { energyMin: 0.5, energyMax: 0.9, danceMin: 0.6, bpmMin: 70, bpmMax: 110 },
            vocal: { energyMin: 0.4, energyMax: 0.8, danceMin: 0.4, bpmMin: 90, bpmMax: 130 },
            lofi: { energyMin: 0.1, energyMax: 0.5, danceMin: 0.2, bpmMin: 60, bpmMax: 100 }
        };
        
        const profile = profiles[preset];
        if (!profile) return 0.5; // Neutral for presets without energy profile
        
        const energyScore = energy >= profile.energyMin && energy <= profile.energyMax ? 1.0 : 0.3;
        const danceScore = danceability >= profile.danceMin ? 1.0 : 0.5;
        const bpmScore = bpm >= profile.bpmMin && bpm <= profile.bpmMax ? 1.0 : 0.5;
        
        return (energyScore * 0.5 + danceScore * 0.25 + bpmScore * 0.25);
    }
    
    scoreFrequencyMatch(preset, frequencyBands) {
        if (!frequencyBands) return 0.5;
        
        const { subBass, bass, lowMid, midrange, presence, brilliance } = frequencyBands;
        
        const profiles = {
            electronic: { subBass: 'high', bass: 'high', mid: 'low', treble: 'high' },
            rock: { subBass: 'medium', bass: 'high', mid: 'high', treble: 'high' },
            metal: { subBass: 'low', bass: 'medium', mid: 'low', treble: 'very-high' },
            jazz: { subBass: 'low', bass: 'medium', mid: 'high', treble: 'medium' },
            classical: { subBass: 'low', bass: 'medium', mid: 'medium', treble: 'medium' },
            acoustic: { subBass: 'low', bass: 'medium', mid: 'very-high', treble: 'low' },
            hiphop: { subBass: 'very-high', bass: 'very-high', mid: 'low', treble: 'medium' },
            vocal: { subBass: 'low', bass: 'low', mid: 'very-high', treble: 'high' },
            bassBoost: { subBass: 'very-low', bass: 'low', mid: 'any', treble: 'any' },
            trebleBoost: { subBass: 'any', bass: 'any', mid: 'any', treble: 'very-low' }
        };
        
        const profile = profiles[preset];
        if (!profile) return 0.5;
        
        let score = 0;
        let checks = 0;
        
        // Sub-bass check
        if (profile.subBass === 'very-high' && subBass > 0.20) score += 1;
        else if (profile.subBass === 'high' && subBass > 0.15) score += 1;
        else if (profile.subBass === 'medium' && subBass >= 0.10 && subBass <= 0.18) score += 1;
        else if (profile.subBass === 'low' && subBass < 0.12) score += 1;
        else if (profile.subBass === 'very-low' && subBass < 0.08) score += 1;
        else if (profile.subBass === 'any') score += 0.5;
        checks++;
        
        // Treble check (brilliance)
        if (profile.treble === 'very-high' && brilliance > 0.15) score += 1;
        else if (profile.treble === 'high' && brilliance > 0.10) score += 1;
        else if (profile.treble === 'medium' && brilliance >= 0.05 && brilliance <= 0.12) score += 1;
        else if (profile.treble === 'low' && brilliance < 0.08) score += 1;
        else if (profile.treble === 'very-low' && brilliance < 0.05) score += 1;
        else if (profile.treble === 'any') score += 0.5;
        checks++;
        
        // Mid check
        if (profile.mid === 'very-high' && midrange > 0.30) score += 1;
        else if (profile.mid === 'high' && midrange > 0.25) score += 1;
        else if (profile.mid === 'medium' && midrange >= 0.20 && midrange <= 0.30) score += 1;
        else if (profile.mid === 'low' && midrange < 0.22) score += 1;
        else if (profile.mid === 'any') score += 0.5;
        checks++;
        
        return score / checks;
    }
    
    scoreDynamicsMatch(preset, dynamicRange) {
        if (!dynamicRange) return 0.5;
        
        const crest = dynamicRange.crestFactor;
        
        const profiles = {
            classical: { min: 12, max: 25, ideal: 'very-high' },
            jazz: { min: 10, max: 18, ideal: 'high' },
            liveRecording: { min: 11, max: 20, ideal: 'high' },
            acoustic: { min: 8, max: 15, ideal: 'medium-high' },
            rock: { min: 6, max: 12, ideal: 'medium' },
            electronic: { min: 5, max: 10, ideal: 'medium-low' },
            metal: { min: 4, max: 8, ideal: 'low' },
            hiphop: { min: 5, max: 10, ideal: 'medium-low' },
            loudnessWar: { min: 3, max: 6, ideal: 'very-low' }
        };
        
        const profile = profiles[preset];
        if (!profile) return 0.5;
        
        if (crest >= profile.min && crest <= profile.max) return 1.0;
        
        const distance = Math.min(
            Math.abs(crest - profile.min),
            Math.abs(crest - profile.max)
        );
        
        return Math.max(0, 1 - distance / 5);
    }
    
    scoreContextMatch(preset, context) {
        const { vocalProminence, acousticness, mood, isVintage, instrumentalness } = context;
        
        let score = 0;
        let factors = 0;
        
        // Vintage check
        if (preset === 'vintageTape' && isVintage) { score += 1; factors++; }
        else if (preset === 'classical' && isVintage) { score += 0.7; factors++; }
        else if (preset === 'jazz' && isVintage) { score += 0.7; factors++; }
        else if (!['vintageTape', 'classical', 'jazz'].includes(preset) && !isVintage) { score += 0.5; factors++; }
        
        // Vocal prominence
        if (preset === 'vocal' && vocalProminence > 1.5) { score += 1; factors++; }
        else if (preset === 'acoustic' && vocalProminence > 1.3) { score += 0.8; factors++; }
        else if (['electronic', 'rock'].includes(preset) && vocalProminence < 1.2) { score += 0.7; factors++; }
        
        // Acousticness
        if (preset === 'acoustic' && acousticness > 0.7) { score += 1; factors++; }
        else if (preset === 'classical' && acousticness > 0.6) { score += 0.9; factors++; }
        else if (preset === 'electronic' && acousticness < 0.3) { score += 0.9; factors++; }
        
        // Instrumentalness
        if (preset === 'classical' && instrumentalness > 0.8) { score += 1; factors++; }
        else if (preset === 'jazz' && instrumentalness > 0.7) { score += 0.8; factors++; }
        
        // Mood matching
        if (preset === 'lofi' && mood === 'calm') { score += 1; factors++; }
        else if (preset === 'metal' && mood === 'dark') { score += 0.7; factors++; }
        else if (preset === 'electronic' && ['energetic', 'bright'].includes(mood)) { score += 0.8; factors++; }
        
        return factors > 0 ? score / factors : 0.5;
    }
    
    /**
     * Apply auto-EQ for track
     */
    applyAutoEQ(track) {
        if (!this.enabled) {
             // Calculate total gain boost to apply makeup gain compensation
    const totalBoost = Math.abs(bassAdjust) + Math.abs(midAdjust) + Math.abs(trebleAdjust);
    
    if (totalBoost > 6 && window.volumeMakeupGain) {
        // Reduce makeup gain to prevent clipping on heavy EQ
        const compensationFactor = Math.max(0.6, 1 - (totalBoost / 36)); // Max 40% reduction
        window.volumeMakeupGain.gain.setValueAtTime(
            1.2 * compensationFactor, 
            window.audioContext.currentTime
        );
        
        this.debugLog(`ðŸŽšï¸ Applied gain compensation: ${(compensationFactor * 100).toFixed(0)}%`, 'info');
    } else if (window.volumeMakeupGain) {
        // Reset to normal
        window.volumeMakeupGain.gain.setValueAtTime(1.2, window.audioContext.currentTime);
    }
            return;
        }
        
        const preset = this.selectPresetForTrack(track);
        
        // Don't reapply if already using this preset
        if (preset === this.lastAppliedPreset) {
            this.debugLog('⏭️ Skipping EQ change (already applied)', 'info');
            return;
        }
        
        // Apply preset WITH track analysis for dynamic adjustments
        this.presetsManager.applyPreset(preset, track.analysis);
        this.lastAppliedPreset = preset;
        
        // Update UI
        const presetSelect = document.getElementById('eq-preset-select');
        if (presetSelect) {
            presetSelect.value = preset;
        }
    }
    
    /**
     * Enable/disable auto-EQ
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.debugLog(`Auto-EQ: ${enabled ? 'ON ✨' : 'OFF'}`, enabled ? 'success' : 'info');
        
        if (!enabled) {
            this.presetsManager.applyPreset('flat');
            this.lastAppliedPreset = null;
            
            const presetSelect = document.getElementById('eq-preset-select');
            if (presetSelect) {
                presetSelect.value = 'flat';
            }
        }
    }
    
    /**
     * Toggle auto-EQ
     */
    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }
    
    /**
     * Check if enabled
     */
    isEnabled() {
        return this.enabled;
    }
    
    /**
     * Get state
     */
    getState() {
        return {
            enabled: this.enabled,
            lastPreset: this.lastAppliedPreset,
            threshold: this.confidenceThreshold
        };
    }
    
    /**
     * Set confidence threshold
     */
    setConfidenceThreshold(threshold) {
        this.confidenceThreshold = Math.max(0, Math.min(100, threshold));
        this.debugLog(`Confidence threshold set to ${this.confidenceThreshold}`, 'info');
    }
    
    /**
     * Get detailed scoring breakdown for debugging
     */
    getScoreBreakdown(track) {
        if (!track.analysis) {
            return { error: 'No analysis data available' };
        }
        
        const genre = track.metadata?.genre?.toLowerCase() || '';
        
        // Check hard rules
        const hardRule = this.applyHardRules(track.analysis, genre);
        if (hardRule) {
            return {
                method: 'Hard Rule',
                bestMatch: hardRule.preset,
                confidence: hardRule.confidence,
                reason: hardRule.reason,
                willApply: true
            };
        }
        
        // Check combo patterns
        const combo = this.detectComboPatterns(track.analysis, genre);
        if (combo.confidence >= this.confidenceThreshold) {
            return {
                method: 'Combo Pattern',
                bestMatch: combo.preset,
                confidence: combo.confidence,
                reason: combo.reason,
                willApply: true
            };
        }
        
        // Multi-dimensional scoring
        const decision = this.multiDimensionalScoring(track.analysis, genre);
        
        return {
            method: 'Multi-Dimensional Scoring',
            bestMatch: decision.preset,
            confidence: decision.confidence,
            reason: decision.reason,
            willApply: decision.confidence >= this.confidenceThreshold,
            threshold: this.confidenceThreshold,
            breakdown: decision.breakdown
        };
    }
}

window.AutoEQManager = AutoEQManager;