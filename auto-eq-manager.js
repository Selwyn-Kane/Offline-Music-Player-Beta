/* ============================================
   Auto-EQ Manager — v1.1
   Multi-Dimensional Analysis-Driven Decision System
   ============================================ */

class AutoEQManager {

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(audioPresetsManager, debugLog = console.log) {
        this.presetsManager = audioPresetsManager;
        this._log           = debugLog;

        this.enabled             = false;
        this.lastAppliedPreset   = null;
        this.confidenceThreshold = 30; // lower = more aggressive matching

        // Scoring weights — must sum to 1.0
        this.weights = {
            genre:            0.30,
            spectral:         0.20,
            energy:           0.15,
            frequencyBalance: 0.15,
            dynamics:         0.10,
            context:          0.10,
        };
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Apply the best-matching EQ preset for the given track.
     * No-op if disabled. After applying, compensates makeup gain to avoid
     * clipping when heavy EQ is dialled in.
     */
    applyAutoEQ(track) {
        if (!this.enabled) return;

        const preset = this.selectPresetForTrack(track);

        // Skip if the same preset is already applied (avoids unnecessary ramps)
        if (preset === this.lastAppliedPreset) {
            this._log('⏭️ Skipping EQ change (already applied)', 'info');
            return;
        }

        // Apply the preset WITH dynamic analysis adjustments
        this.presetsManager.applyPreset(preset, track.analysis);
        this.lastAppliedPreset = preset;

        // Sync the preset selector dropdown
        const dd = document.getElementById('eq-preset-select');
        if (dd) dd.value = preset;

        // Apply makeup-gain compensation to prevent clipping when EQ is heavy.
        // We read the actual gain values that were applied (after dynamic adjustments).
        this._applyGainCompensation();
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this._log(`Auto-EQ: ${enabled ? 'ON ✨' : 'OFF'}`, enabled ? 'success' : 'info');

        if (!enabled) {
            this.presetsManager.applyPreset('flat');
            this.lastAppliedPreset = null;
            const dd = document.getElementById('eq-preset-select');
            if (dd) dd.value = 'flat';
        }
    }

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    isEnabled() {
        return this.enabled;
    }

    getState() {
        return {
            enabled:      this.enabled,
            lastPreset:   this.lastAppliedPreset,
            threshold:    this.confidenceThreshold,
        };
    }

    setConfidenceThreshold(threshold) {
        this.confidenceThreshold = Math.max(0, Math.min(100, threshold));
        this._log(`Confidence threshold → ${this.confidenceThreshold}`, 'info');
    }

    // ─── Main decision engine ─────────────────────────────────────────────────

    /**
     * Select the best preset name for a track using a three-phase cascade:
     *   1. Hard rules  (non-negotiable signatures)
     *   2. Combo patterns (multi-factor fingerprints)
     *   3. Multi-dimensional weighted scoring
     * Returns 'flat' when nothing clears the confidence threshold.
     */
    selectPresetForTrack(track) {
        if (!track.analysis) {
            this._log('⚠️ No analysis data — using flat EQ', 'warning');
            return 'flat';
        }

        const { analysis, metadata } = track;
        const genre = metadata?.genre?.toLowerCase() ?? '';

        this._log(
            `📊 E=${(analysis.energy * 100).toFixed(0)}% ` +
            `BPM=${analysis.bpm} ` +
            `SC=${analysis.spectralCentroid?.toFixed(0)}Hz ` +
            `DR=${analysis.dynamicRange?.crestFactor?.toFixed(1)}dB ` +
            `Vintage=${analysis.isVintage}`,
            'info'
        );

        // Phase 1: hard rules
        const hardRule = this._applyHardRules(analysis, genre);
        if (hardRule) {
            this._log(`🎯 Hard rule: ${hardRule.preset} (${hardRule.reason})`, 'success');
            return hardRule.preset;
        }

        // Phase 2: combo patterns
        const combo = this._detectComboPatterns(analysis, genre);
        if (combo.confidence >= this.confidenceThreshold) {
            this._log(`🎸 Combo: ${combo.preset} (${combo.confidence.toFixed(1)} — ${combo.reason})`, 'success');
            return combo.preset;
        }

        // Phase 3: multi-dimensional scoring
        const decision = this._multiDimensionalScoring(analysis, genre);
        if (decision.confidence >= this.confidenceThreshold) {
            this._log(`✅ Auto-EQ: ${decision.preset} (${decision.confidence.toFixed(1)} — ${decision.reason})`, 'success');
            return decision.preset;
        }

        this._log(`🎚️ Auto-EQ: flat (best: ${decision.preset}@${decision.confidence.toFixed(1)}, below threshold ${this.confidenceThreshold})`, 'info');
        return 'flat';
    }

    // ─── Phase 1: Hard rules ──────────────────────────────────────────────────

    _applyHardRules(analysis, genre) {
        const {
            energy, danceability, speechiness,
            instrumentalness, frequencyBands,
            dynamicRange, spectralCentroid,
            vocalProminence, bpm,
        } = analysis;

        // RULE 1: Podcast / speech (strict — avoids false positives with rap/singing)
        if (speechiness > 0.66 && instrumentalness < 0.1) {
            const isActualSpeech =
                energy           < 0.35  &&
                danceability     < 0.30  &&
                vocalProminence  > 2.0   &&
                dynamicRange?.crestFactor > 8;

            if (isActualSpeech) {
                return { preset: 'podcast', reason: 'Speech-dominant content', confidence: 95 };
            }
        }

        // RULE 2: Pure orchestral / classical
        if (dynamicRange?.crestFactor > 14 &&
            energy            < 0.4  &&
            instrumentalness  > 0.85 &&
            spectralCentroid  < 2200) {
            return { preset: 'classical', reason: 'Orchestral signature: high DR + low energy + instrumental', confidence: 90 };
        }

        // RULE 3: Dance music with severe sub-bass deficiency
        if (frequencyBands?.subBass < 0.08 &&
            danceability > 0.75 &&
            energy       > 0.65 &&
            bpm          > 110) {
            return { preset: 'bassBoost', reason: 'Dance track with severe sub-bass deficiency', confidence: 85 };
        }

        // RULE 4: Extremely dull recording
        if (spectralCentroid < 1200 && frequencyBands?.brilliance < 0.05) {
            return { preset: 'trebleBoost', reason: 'Extremely dull recording needs brightening', confidence: 85 };
        }

        // RULE 5: Over-compressed loudness-war victim
        if (dynamicRange?.crestFactor < 5 &&
            energy > 0.7 &&
            genre !== 'podcast') {
            return { preset: 'loudnessWar', reason: 'Severely over-compressed modern track', confidence: 80 };
        }

        return null;
    }

    // ─── Phase 2: Combo pattern detection ────────────────────────────────────

    _detectComboPatterns(analysis, genre) {
        const {
            energy, danceability, bpm, spectralCentroid,
            frequencyBands, dynamicRange, isVintage,
            acousticness, mood, vocalProminence,
        } = analysis;

        const patterns = [];

        // Vintage rock
        if (isVintage && energy > 0.5 && energy < 0.8 &&
            frequencyBands?.midrange > 0.25 && spectralCentroid < 2000) {
            patterns.push({ preset: 'vintageTape', confidence: 75, reason: 'Vintage rock recording' });
        }

        // Vintage jazz
        if (isVintage && dynamicRange?.crestFactor > 10 &&
            energy < 0.6 && spectralCentroid < 1800) {
            patterns.push({ preset: 'jazz', confidence: 70, reason: 'Vintage jazz recording' });
        }

        // Modern electronic dance
        if (frequencyBands?.subBass > 0.15 &&
            spectralCentroid  > 2000 &&
            energy            > 0.65 &&
            danceability      > 0.6  &&
            bpm               > 110) {
            patterns.push({ preset: 'electronic', confidence: 80, reason: 'Modern electronic dance music' });
        }

        // Modern hip-hop (808 bass + vocal + mid-tempo)
        if (frequencyBands?.subBass > 0.18 &&
            vocalProminence > 1.3 &&
            bpm >= 70 && bpm <= 110 &&
            energy > 0.5) {
            patterns.push({ preset: 'hiphop', confidence: 75, reason: 'Modern hip-hop production' });
        }

        // Modern metal (tight + bright + aggressive)
        if (energy            > 0.75 &&
            spectralCentroid  > 2500 &&
            dynamicRange?.crestFactor < 10 &&
            frequencyBands?.bass      < 0.25 &&
            bpm               > 130) {
            patterns.push({ preset: 'metal', confidence: 75, reason: 'Modern metal production' });
        }

        // Acoustic singer-songwriter
        if (acousticness    > 0.7  &&
            vocalProminence > 1.5  &&
            energy          < 0.6  &&
            frequencyBands?.midrange > 0.28) {
            patterns.push({ preset: 'acoustic', confidence: 75, reason: 'Acoustic vocal-focused recording' });
        }

        // Live recording
        if (dynamicRange?.crestFactor   > 11 &&
            frequencyBands?.brilliance  > 0.12 &&
            energy > 0.6) {
            patterns.push({ preset: 'liveRecording', confidence: 65, reason: 'Live concert recording' });
        }

        // Lo-fi chill
        if (mood === 'calm' && spectralCentroid < 1500 && energy < 0.45 && danceability < 0.5) {
            patterns.push({ preset: 'lofi', confidence: 70, reason: 'Lo-fi chill characteristics' });
        }

        // Energetic rock
        if (mood === 'energetic' &&
            energy > 0.6 && energy < 0.85 &&
            frequencyBands?.midrange > 0.25 &&
            bpm > 100 && bpm < 150) {
            patterns.push({ preset: 'rock', confidence: 70, reason: 'Energetic rock signature' });
        }

        if (!patterns.length) return { confidence: 0 };

        patterns.sort((a, b) => b.confidence - a.confidence);
        return patterns[0];
    }

    // ─── Phase 3: Multi-dimensional scoring ───────────────────────────────────

    _multiDimensionalScoring(analysis, genre) {
        const PRESETS = [
            'electronic', 'rock', 'metal', 'jazz', 'classical',
            'acoustic', 'hiphop', 'vocal', 'bassBoost', 'trebleBoost',
            'vintageTape', 'loudnessWar', 'liveRecording', 'lofi',
        ];

        const scored = PRESETS.map(preset => ({
            preset,
            ...this._calculatePresetScore(preset, analysis, genre),
        }));

        scored.sort((a, b) => b.total - a.total);
        const best = scored[0];

        return { preset: best.preset, confidence: best.total, reason: best.reason };
    }

    _calculatePresetScore(preset, analysis, genre) {
        const {
            energy, bpm, danceability, spectralCentroid,
            frequencyBands, dynamicRange, vocalProminence,
            acousticness, mood, isVintage, instrumentalness,
        } = analysis;

        const breakdown = {
            genre:     this._scoreGenre    (preset, genre)                                                    * this.weights.genre            * 100,
            spectral:  this._scoreSpectral (preset, spectralCentroid, frequencyBands)                         * this.weights.spectral         * 100,
            energy:    this._scoreEnergy   (preset, energy, danceability, bpm)                                * this.weights.energy           * 100,
            frequency: this._scoreFrequency(preset, frequencyBands)                                           * this.weights.frequencyBalance * 100,
            dynamics:  this._scoreDynamics (preset, dynamicRange)                                             * this.weights.dynamics         * 100,
            context:   this._scoreContext  (preset, { vocalProminence, acousticness, mood, isVintage, instrumentalness }) * this.weights.context * 100,
        };

        const total = Object.values(breakdown).reduce((s, v) => s + v, 0);

        const topFactors = Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .filter(([, score]) => score > 5)
            .map(([factor]) => factor);

        const reason = topFactors.length
            ? `Strong ${topFactors.join(' + ')} match`
            : 'General characteristics match';

        return { total, breakdown, reason };
    }

    // ─── Individual scoring functions (all return 0–1) ────────────────────────

    _scoreGenre(preset, genre) {
        const map = {
            electronic:  ['electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'dnb', 'synthwave'],
            rock:        ['rock', 'alternative', 'indie rock', 'punk', 'grunge'],
            metal:       ['metal', 'heavy metal', 'death metal', 'black metal', 'metalcore'],
            jazz:        ['jazz', 'bebop', 'swing', 'blues', 'fusion'],
            classical:   ['classical', 'orchestral', 'symphony', 'opera', 'baroque', 'chamber'],
            acoustic:    ['acoustic', 'folk', 'singer-songwriter', 'country', 'bluegrass'],
            hiphop:      ['hip hop', 'hip-hop', 'rap', 'trap'],
            vocal:       ['pop', 'r&b', 'rnb', 'soul', 'gospel'],
        };

        const terms = map[preset] ?? [];

        // Full exact-substring match (genre string contains the entire term)
        for (const term of terms) {
            if (genre.includes(term)) return 1.0;
        }

        // Partial match: genre is a substring of the term
        // e.g. genre='metal' matches term='death metal'
        // Guarded to require genre.length >= 4 to avoid spurious one-letter hits.
        if (genre.length >= 4) {
            for (const term of terms) {
                if (term.includes(genre)) return 0.5;
            }
        }

        return 0;
    }

    _scoreSpectral(preset, spectralCentroid, frequencyBands) {
        const profiles = {
            electronic:   { min: 1800, max: 3500 },
            rock:         { min: 1500, max: 2800 },
            metal:        { min: 2200, max: 3500 },
            jazz:         { min: 1400, max: 2200 },
            classical:    { min: 1200, max: 2000 },
            acoustic:     { min: 1300, max: 2000 },
            hiphop:       { min: 1500, max: 2500 },
            vocal:        { min: 1800, max: 2800 },
            bassBoost:    { min: 1200, max: 2500 },
            trebleBoost:  { min:  800, max: 1600 },
            vintageTape:  { min: 1000, max: 1800 },
            loudnessWar:  { min: 1500, max: 2800 },
            liveRecording:{ min: 1500, max: 2500 },
            lofi:         { min: 1000, max: 1600 },
        };

        const p = profiles[preset];
        if (!p) return 0;

        if (spectralCentroid >= p.min && spectralCentroid <= p.max) return 1.0;

        const mid  = (p.min + p.max) / 2;
        return Math.max(0, 1 - Math.abs(spectralCentroid - mid) / 1000);
    }

    _scoreEnergy(preset, energy, danceability, bpm) {
        const profiles = {
            electronic:   { eMin: 0.6, eMax: 1.0, dMin: 0.6, bMin: 110, bMax: 150 },
            rock:         { eMin: 0.5, eMax: 0.9, dMin: 0.4, bMin: 100, bMax: 160 },
            metal:        { eMin: 0.7, eMax: 1.0, dMin: 0.3, bMin: 130, bMax: 200 },
            jazz:         { eMin: 0.3, eMax: 0.7, dMin: 0.2, bMin:  80, bMax: 140 },
            classical:    { eMin: 0.1, eMax: 0.5, dMin: 0.0, bMin:  40, bMax: 120 },
            acoustic:     { eMin: 0.2, eMax: 0.6, dMin: 0.2, bMin:  70, bMax: 130 },
            hiphop:       { eMin: 0.5, eMax: 0.9, dMin: 0.6, bMin:  70, bMax: 110 },
            vocal:        { eMin: 0.4, eMax: 0.8, dMin: 0.4, bMin:  90, bMax: 130 },
            lofi:         { eMin: 0.1, eMax: 0.5, dMin: 0.2, bMin:  60, bMax: 100 },
        };

        const p = profiles[preset];
        if (!p) return 0.5; // neutral for presets without an energy profile

        const eScore = (energy      >= p.eMin && energy      <= p.eMax) ? 1.0 : 0.3;
        const dScore = (danceability >= p.dMin)                          ? 1.0 : 0.5;
        const bScore = (bpm         >= p.bMin && bpm         <= p.bMax) ? 1.0 : 0.5;

        return eScore * 0.5 + dScore * 0.25 + bScore * 0.25;
    }

    _scoreFrequency(preset, frequencyBands) {
        if (!frequencyBands) return 0.5;

        // Only the bands actually used in profiles are destructured
        const { subBass, bass, midrange, brilliance } = frequencyBands;

        const profiles = {
            electronic:   { subBass: 'high',     bass: 'high',     mid: 'low',      treble: 'high'     },
            rock:         { subBass: 'medium',   bass: 'high',     mid: 'high',     treble: 'high'     },
            metal:        { subBass: 'low',      bass: 'medium',   mid: 'low',      treble: 'very-high'},
            jazz:         { subBass: 'low',      bass: 'medium',   mid: 'high',     treble: 'medium'   },
            classical:    { subBass: 'low',      bass: 'medium',   mid: 'medium',   treble: 'medium'   },
            acoustic:     { subBass: 'low',      bass: 'medium',   mid: 'very-high',treble: 'low'      },
            hiphop:       { subBass: 'very-high',bass: 'very-high',mid: 'low',      treble: 'medium'   },
            vocal:        { subBass: 'low',      bass: 'low',      mid: 'very-high',treble: 'high'     },
            bassBoost:    { subBass: 'very-low', bass: 'low',      mid: 'any',      treble: 'any'      },
            trebleBoost:  { subBass: 'any',      bass: 'any',      mid: 'any',      treble: 'very-low' },
        };

        const p = profiles[preset];
        if (!p) return 0.5;

        const scoreLevel = (actual, level) => {
            switch (level) {
                case 'very-high': return actual > 0.20 ? 1 : 0;
                case 'high':      return actual > 0.15 ? 1 : 0;
                case 'medium':    return (actual >= 0.10 && actual <= 0.18) ? 1 : 0;
                case 'low':       return actual < 0.12 ? 1 : 0;
                case 'very-low':  return actual < 0.08 ? 1 : 0;
                case 'any':       return 0.5;
                default:          return 0;
            }
        };

        // Brilliance thresholds differ from the sub-bass scale — define separately
        const scoreBrilliance = (level) => {
            switch (level) {
                case 'very-high': return brilliance > 0.15 ? 1 : 0;
                case 'high':      return brilliance > 0.10 ? 1 : 0;
                case 'medium':    return (brilliance >= 0.05 && brilliance <= 0.12) ? 1 : 0;
                case 'low':       return brilliance < 0.08 ? 1 : 0;
                case 'very-low':  return brilliance < 0.05 ? 1 : 0;
                case 'any':       return 0.5;
                default:          return 0;
            }
        };

        // Midrange thresholds
        const scoreMid = (level) => {
            switch (level) {
                case 'very-high': return midrange > 0.30 ? 1 : 0;
                case 'high':      return midrange > 0.25 ? 1 : 0;
                case 'medium':    return (midrange >= 0.20 && midrange <= 0.30) ? 1 : 0;
                case 'low':       return midrange < 0.22 ? 1 : 0;
                case 'any':       return 0.5;
                default:          return 0;
            }
        };

        const total = scoreLevel(subBass, p.subBass) +
                      scoreBrilliance(p.treble)       +
                      scoreMid(p.mid);

        return total / 3;
    }

    _scoreDynamics(preset, dynamicRange) {
        if (!dynamicRange) return 0.5;

        const crest = dynamicRange.crestFactor;
        const profiles = {
            classical:    { min: 12, max: 25 },
            jazz:         { min: 10, max: 18 },
            liveRecording:{ min: 11, max: 20 },
            acoustic:     { min:  8, max: 15 },
            rock:         { min:  6, max: 12 },
            electronic:   { min:  5, max: 10 },
            metal:        { min:  4, max:  8 },
            hiphop:       { min:  5, max: 10 },
            loudnessWar:  { min:  3, max:  6 },
        };

        const p = profiles[preset];
        if (!p) return 0.5;

        if (crest >= p.min && crest <= p.max) return 1.0;

        const distance = Math.min(Math.abs(crest - p.min), Math.abs(crest - p.max));
        return Math.max(0, 1 - distance / 5);
    }

    _scoreContext(preset, { vocalProminence, acousticness, mood, isVintage, instrumentalness }) {
        let score = 0;
        let total = 0;

        const add = (points) => { score += points; total++; };

        // Vintage
        if      (preset === 'vintageTape'                                      && isVintage)  add(1.0);
        else if (['classical', 'jazz'].includes(preset)                        && isVintage)  add(0.7);
        else if (!['vintageTape', 'classical', 'jazz'].includes(preset)        && !isVintage) add(0.5);

        // Vocal prominence
        if      (preset === 'vocal'                                && vocalProminence > 1.5) add(1.0);
        else if (preset === 'acoustic'                             && vocalProminence > 1.3) add(0.8);
        else if (['electronic', 'rock'].includes(preset)          && vocalProminence < 1.2) add(0.7);

        // Acousticness
        if      (preset === 'acoustic'    && acousticness > 0.7) add(1.0);
        else if (preset === 'classical'   && acousticness > 0.6) add(0.9);
        else if (preset === 'electronic'  && acousticness < 0.3) add(0.9);

        // Instrumentalness
        if      (preset === 'classical' && instrumentalness > 0.8) add(1.0);
        else if (preset === 'jazz'      && instrumentalness > 0.7) add(0.8);

        // Mood
        if      (preset === 'lofi'       && mood === 'calm')                          add(1.0);
        else if (preset === 'metal'      && mood === 'dark')                          add(0.7);
        else if (preset === 'electronic' && ['energetic', 'bright'].includes(mood))   add(0.8);

        return total > 0 ? score / total : 0.5;
    }

    // ─── Gain compensation ────────────────────────────────────────────────────

    /**
     * After applying an EQ preset, reduce makeup gain when the combined EQ boost
     * is large enough to risk clipping. Reads the actual applied values from the
     * presets manager so dynamic adjustments are accounted for.
     */
    _applyGainCompensation() {
        const ctx       = window.audioContext;
        const makeup    = window.volumeMakeupGain;
        if (!ctx || !makeup) return;

        const { bass, mid, treble } = this.presetsManager.getCurrentValues();
        const totalBoost = Math.abs(bass) + Math.abs(mid) + Math.abs(treble);

        if (totalBoost > 6) {
            // Scale down makeup gain up to 40% for very heavy EQ (max 36 dB total)
            const factor = Math.max(0.6, 1 - totalBoost / 36);
            makeup.gain.setValueAtTime(1.2 * factor, ctx.currentTime);
            this._log(`🎚️ Gain compensation: ${(factor * 100).toFixed(0)}% (total EQ boost ${totalBoost.toFixed(1)} dB)`, 'info');
        } else {
            // Reset to unity makeup gain
            makeup.gain.setValueAtTime(1.2, ctx.currentTime);
        }
    }

    // ─── Debug helper ─────────────────────────────────────────────────────────

    /**
     * Returns a detailed scoring breakdown for the given track — useful for
     * the debug panel / deep analysis view.
     */
    getScoreBreakdown(track) {
        if (!track.analysis) return { error: 'No analysis data available' };

        const genre = track.metadata?.genre?.toLowerCase() ?? '';

        const hardRule = this._applyHardRules(track.analysis, genre);
        if (hardRule) {
            return { method: 'Hard Rule', ...hardRule, willApply: true };
        }

        const combo = this._detectComboPatterns(track.analysis, genre);
        if (combo.confidence >= this.confidenceThreshold) {
            return { method: 'Combo Pattern', ...combo, willApply: true };
        }

        const decision = this._multiDimensionalScoring(track.analysis, genre);
        return {
            method:    'Multi-Dimensional Scoring',
            bestMatch: decision.preset,
            confidence:decision.confidence,
            reason:    decision.reason,
            breakdown: decision.breakdown,
            willApply: decision.confidence >= this.confidenceThreshold,
            threshold: this.confidenceThreshold,
        };
    }
}

window.AutoEQManager = AutoEQManager;
console.log('✅ AutoEQManager v1.1 loaded');
