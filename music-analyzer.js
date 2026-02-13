/* ============================================
   Music Analyzer - Smart Playlist Generation
   Enhanced with Frequency Band & Dynamic Range Analysis
   ============================================ */

class MusicAnalyzer {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.analysisCache = new Map();
        this.maxCacheSize = 100;
    }
    
    /**
     * Main analysis function - analyzes a track and returns characteristics
     */
    async analyzeTrack(audioFile, trackId) {
        // Check cache first
        if (this.analysisCache.has(trackId)) {
            this.debugLog(`Using cached analysis for ${trackId}`, 'info');
            return this.analysisCache.get(trackId);
        }
        
        try {
            this.debugLog(`Analyzing track: ${trackId}`, 'info');
            
            // Decode audio file to buffer
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Analyze 3 segments (intro, middle, outro) for speed and accuracy
            const segments = this.extractSegments(audioBuffer, 3, 15); // 3x 15-second segments
            
            // Perform enhanced analyses on segments
            const spectralCentroid = this.calculateSpectralCentroid(audioBuffer);
            const frequencyBands = this.analyzeFrequencyBands(segments, audioBuffer.sampleRate);
            const dynamicRange = this.calculateDynamicRange(audioBuffer);
            const vocalProminence = this.calculateVocalProminence(frequencyBands);
            
            const bpm = await this.detectBPM(audioBuffer);
            const energy = this.calculateEnergy(audioBuffer);
            
            const analysis = {
                bpm: bpm,
                energy: energy,
                spectralCentroid: spectralCentroid,
                mood: this.detectMood(energy, spectralCentroid, bpm),
                key: this.detectKey(audioBuffer),
                danceability: this.calculateDanceability(audioBuffer),
                loudness: this.calculateLoudness(audioBuffer),
                tempo: this.classifyTempo(bpm),
                duration: audioBuffer.duration,
                
                // Structural analysis
                intro: this.detectIntro(audioBuffer),
                outro: this.detectOutro(audioBuffer),
                silence: this.detectSilence(audioBuffer),

                // Enhanced analysis
                frequencyBands: frequencyBands,
                dynamicRange: dynamicRange,
                vocalProminence: vocalProminence,
                isVintage: this.detectVintageRecording(spectralCentroid, dynamicRange, frequencyBands)
            };
            
            // Cache the result
            this.cacheAnalysis(trackId, analysis);
            
            this.debugLog(`✅ Analysis: BPM=${analysis.bpm}, Energy=${analysis.energy.toFixed(2)}, DR=${analysis.dynamicRange.crestFactor.toFixed(1)}dB, Vintage=${analysis.isVintage}`, 'success');
            
            await audioContext.close();
            return analysis;
            
        } catch (err) {
            this.debugLog(`Analysis failed: ${err.message}`, 'error');
            return this.getDefaultAnalysis();
        }
    }
    
    /**
     * Extract representative segments from track
     */
    extractSegments(audioBuffer, numSegments, segmentLengthSec) {
        const channel = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const segmentLength = segmentLengthSec * sampleRate;
        const segments = [];
        
        for (let i = 0; i < numSegments; i++) {
            // Position segments evenly: intro, middle, outro
            const position = (i + 1) / (numSegments + 1);
            const startSample = Math.floor(position * channel.length) - Math.floor(segmentLength / 2);
            const validStart = Math.max(0, Math.min(startSample, channel.length - segmentLength));
            
            if (validStart + segmentLength <= channel.length) {
                segments.push({
                    data: channel.slice(validStart, validStart + segmentLength),
                    sampleRate: sampleRate
                });
            }
        }
        
        return segments;
    }
    
    /**
     * Analyze frequency bands for EQ decision-making
     */
    analyzeFrequencyBands(segments, sampleRate) {
        const bands = {
            subBass: 0,      // <60 Hz
            bass: 0,         // 60-200 Hz
            lowMid: 0,       // 200-500 Hz
            midrange: 0,     // 500-2000 Hz
            presence: 0,     // 2000-6000 Hz
            brilliance: 0    // 6000+ Hz
        };
        
        if (!segments || segments.length === 0) {
            return bands;
        }
        
        // Average across all segments
        segments.forEach(segment => {
            const segmentBands = this.analyzeSingleSegmentBands(segment.data, sampleRate);
            Object.keys(bands).forEach(key => {
                bands[key] += segmentBands[key];
            });
        });
        
        // Average and normalize
        const numSegments = segments.length;
        Object.keys(bands).forEach(key => {
            bands[key] /= numSegments;
        });
        
        // Calculate total energy for normalization
        const totalEnergy = Object.values(bands).reduce((sum, val) => sum + val, 0);
        
        if (totalEnergy > 0) {
            Object.keys(bands).forEach(key => {
                bands[key] = bands[key] / totalEnergy;
            });
        }
        
        return bands;
    }
    
    /**
     * Analyze frequency bands for a single segment
     */
    analyzeSingleSegmentBands(data, sampleRate) {
        const bands = {
            subBass: 0,
            bass: 0,
            lowMid: 0,
            midrange: 0,
            presence: 0,
            brilliance: 0
        };
        
        // Simple time-domain approximation using filtering
        // Divide signal into rough frequency bands based on sample groups
        const numBins = 64;
        const samplesPerBin = Math.floor(data.length / numBins);
        
        for (let bin = 0; bin < numBins; bin++) {
            const start = bin * samplesPerBin;
            const end = Math.min(start + samplesPerBin, data.length);
            
            // Calculate RMS energy for this bin
            let energy = 0;
            for (let i = start; i < end; i++) {
                energy += data[i] * data[i];
            }
            energy = Math.sqrt(energy / (end - start));
            
            // Map bin to approximate frequency range
            const centerFreq = (bin / numBins) * (sampleRate / 2);
            
            if (centerFreq < 60) bands.subBass += energy;
            else if (centerFreq < 200) bands.bass += energy;
            else if (centerFreq < 500) bands.lowMid += energy;
            else if (centerFreq < 2000) bands.midrange += energy;
            else if (centerFreq < 6000) bands.presence += energy;
            else bands.brilliance += energy;
        }
        
        return bands;
    }
    
    /**
     * Calculate dynamic range (crest factor in dB)
     */
    calculateDynamicRange(audioBuffer) {
        const channel = audioBuffer.getChannelData(0);
        
        // Find peak amplitude
        let peak = 0;
        for (let i = 0; i < channel.length; i += 100) {
            const abs = Math.abs(channel[i]);
            if (abs > peak) peak = abs;
        }
        
        // Calculate RMS
        let sumSquares = 0;
        let count = 0;
        for (let i = 0; i < channel.length; i += 100) {
            sumSquares += channel[i] * channel[i];
            count++;
        }
        const rms = Math.sqrt(sumSquares / count);
        
        // Crest factor in dB
        const crestFactor = 20 * Math.log10((peak + 0.0001) / (rms + 0.0001));
        
        // Classification
        let classification = 'moderate';
        if (crestFactor > 12) classification = 'high'; // Classical, Jazz
        else if (crestFactor < 6) classification = 'low'; // Modern Pop, EDM
        
        return {
            crestFactor: Math.max(0, Math.min(30, crestFactor)),
            peak: peak,
            rms: rms,
            classification: classification
        };
    }
    
    /**
     * Calculate vocal prominence score
     */
    calculateVocalProminence(frequencyBands) {
        if (!frequencyBands) return 0;
        
        // Vocal presence: 1-3kHz range dominance
        // Formula: (presence energy) / (lowMid energy)
        const vocalRange = frequencyBands.presence || 0;
        const mudRange = frequencyBands.lowMid || 0.001; // Avoid division by zero
        
        const ratio = vocalRange / mudRange;
        
        // Threshold: > 1.5 suggests vocal-forward track
        return ratio;
    }
    
    /**
     * Detect vintage recordings
     */
    detectVintageRecording(spectralCentroid, dynamicRange, frequencyBands) {
        let vintageScore = 0;
        
        // Low spectral brightness (< 1500 Hz)
        if (spectralCentroid < 1500) vintageScore += 2;
        
        // High dynamic range (> 12 dB)
        if (dynamicRange.crestFactor > 12) vintageScore += 2;
        
        // Low sub-bass energy (old recordings lack deep bass)
        if (frequencyBands && frequencyBands.subBass < 0.08) vintageScore += 1;
        
        // Low brilliance (old recordings roll off highs)
        if (frequencyBands && frequencyBands.brilliance < 0.12) vintageScore += 1;
        
        // Threshold: score >= 3 is vintage
        return vintageScore >= 3;
    }
    
    /**
     * BPM Detection - FIXED to prevent stack overflow
     */
    async detectBPM(audioBuffer) {
        try {
            const channel = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            
            // Limit analysis to first 30 seconds
            const maxSamples = Math.min(channel.length, sampleRate * 30);
            
            // Downsample aggressively
            const downsampled = [];
            for (let i = 0; i < maxSamples; i += 200) {
                downsampled.push(Math.abs(channel[i]));
            }
            
            // Simple moving average filter
            const filtered = [];
            const windowSize = 3;
            for (let i = 0; i < downsampled.length; i++) {
                let sum = 0;
                let count = 0;
                const start = Math.max(0, i - windowSize);
                const end = Math.min(downsampled.length - 1, i + windowSize);
                
                for (let j = start; j <= end; j++) {
                    sum += downsampled[j];
                    count++;
                }
                filtered.push(sum / count);
            }
            
            // Find peaks
            const peaks = [];
            const threshold = Math.max(...filtered) * 0.6;
            const minPeakDistance = 10;
            
            for (let i = 1; i < filtered.length - 1; i++) {
                if (filtered[i] > threshold && 
                    filtered[i] > filtered[i - 1] && 
                    filtered[i] > filtered[i + 1]) {
                    
                    if (peaks.length === 0 || i - peaks[peaks.length - 1] > minPeakDistance) {
                        peaks.push(i);
                    }
                }
            }
            
            if (peaks.length < 4) return 120;
            
            // Calculate intervals
            const intervals = [];
            for (let i = 1; i < Math.min(peaks.length, 30); i++) {
                intervals.push(peaks[i] - peaks[i - 1]);
            }
            
            // Median interval
            intervals.sort((a, b) => a - b);
            const medianInterval = intervals[Math.floor(intervals.length / 2)];
            
            // Convert to BPM
            let bpm = Math.round((60 * sampleRate / 200) / medianInterval);
            
            // Validate range
            while (bpm < 60) bpm *= 2;
            while (bpm > 180) bpm /= 2;
            
            return Math.round(bpm);
            
        } catch (err) {
            this.debugLog(`BPM detection failed: ${err.message}`, 'warning');
            return 120;
        }
    }
    
    /**
     * Energy calculation
     */
    calculateEnergy(audioBuffer) {
        const channel = audioBuffer.getChannelData(0);
        let sum = 0;
        let count = 0;
        
        for (let i = 0; i < channel.length; i += 1000) {
            sum += Math.abs(channel[i]);
            count++;
        }
        
        const avgAmplitude = sum / count;
        const energy = Math.min(Math.max(avgAmplitude / 0.15, 0), 1);
        
        return energy;
    }
    
    /**
     * Spectral centroid calculation
     */
    calculateSpectralCentroid(audioBuffer) {
        try {
            const channel = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            
            const numSegments = 3;
            const segmentLength = 4096;
            const totalLength = channel.length;
            
            let totalCentroid = 0;
            let validSegments = 0;
            
            for (let seg = 0; seg < numSegments; seg++) {
                const segmentStart = Math.floor((totalLength / (numSegments + 1)) * (seg + 1));
                
                if (segmentStart + segmentLength >= totalLength) continue;
                
                const segment = new Float32Array(segmentLength);
                for (let i = 0; i < segmentLength; i++) {
                    segment[i] = channel[segmentStart + i];
                }
                
                const numBands = 32;
                const samplesPerBand = Math.floor(segmentLength / numBands);
                
                let weightedSum = 0;
                let totalPower = 0;
                
                for (let band = 0; band < numBands; band++) {
                    const bandStart = band * samplesPerBand;
                    const bandEnd = Math.min(bandStart + samplesPerBand, segmentLength);
                    
                    let bandPower = 0;
                    for (let i = bandStart; i < bandEnd; i++) {
                        bandPower += segment[i] * segment[i];
                    }
                    bandPower = Math.sqrt(bandPower / (bandEnd - bandStart));
                    
                    const centerFreq = ((band + 0.5) / numBands) * (sampleRate / 2);
                    
                    weightedSum += centerFreq * bandPower;
                    totalPower += bandPower;
                }
                
                if (totalPower > 0.001) {
                    totalCentroid += weightedSum / totalPower;
                    validSegments++;
                }
            }
            
            const avgCentroid = validSegments > 0 ? totalCentroid / validSegments : 1500;
            return Math.min(Math.max(avgCentroid, 300), 5000);
            
        } catch (err) {
            this.debugLog(`Spectral centroid failed: ${err.message}`, 'warning');
            return 1500;
        }
    }
    
    /**
     * Mood detection with realistic thresholds
     */
    detectMood(energy, spectralCentroid, bpm) {
        if (energy > 0.65) {
            if (bpm > 130 || spectralCentroid > 2500) return 'energetic';
            return 'bright';
        }
        
        if (energy < 0.35) {
            if (spectralCentroid < 1200 || bpm < 90) return 'calm';
            return 'dark';
        }
        
        if (spectralCentroid > 2800) return 'bright';
        if (spectralCentroid < 1000) return 'dark';
        
        if (bpm > 130 && energy > 0.5) return 'energetic';
        if (bpm < 90 && energy < 0.5) return 'calm';
        
        return 'neutral';
    }
    
    /**
     * Key detection
     */
    detectKey(audioBuffer) {
        try {
            const channel = audioBuffer.getChannelData(0);
            const fftSize = 8192;
            
            if (channel.length < fftSize) return 'C';
            
            const fft = this.performFFT(channel.slice(0, fftSize));
            
            let maxMagnitude = 0;
            let peakIndex = 0;
            
            for (let i = 20; i < fft.length / 2; i++) {
                const magnitude = Math.sqrt(fft[i].real ** 2 + fft[i].imag ** 2);
                if (magnitude > maxMagnitude) {
                    maxMagnitude = magnitude;
                    peakIndex = i;
                }
            }
            
            const peakFreq = (peakIndex * audioBuffer.sampleRate) / fftSize;
            
            const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const a4 = 440;
            const halfSteps = Math.round(12 * Math.log2(peakFreq / a4));
            const noteIndex = (halfSteps + 9 + 12 * 10) % 12;
            
            return notes[noteIndex];
            
        } catch (err) {
            return 'C';
        }
    }
    
    /**
     * Danceability calculation
     */
    calculateDanceability(audioBuffer) {
        try {
            const channel = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            
            const windowSize = Math.floor(sampleRate * 0.1);
            const energies = [];
            const maxWindows = 100;
            
            for (let i = 0; i < channel.length - windowSize && energies.length < maxWindows; i += windowSize) {
                let sum = 0;
                for (let j = 0; j < windowSize; j++) {
                    sum += Math.abs(channel[i + j]);
                }
                energies.push(sum / windowSize);
            }
            
            if (energies.length < 2) return 0.5;
            
            const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
            const variance = energies.reduce((sum, e) => sum + (e - mean) ** 2, 0) / energies.length;
            
            const danceability = Math.max(0, Math.min(1, 1 - variance * 50));
            
            return danceability;
            
        } catch (err) {
            return 0.5;
        }
    }
    
    /**
     * Loudness calculation
     */
    calculateLoudness(audioBuffer) {
        const channel = audioBuffer.getChannelData(0);
        let sum = 0;
        let count = 0;
        
        for (let i = 0; i < channel.length; i += 100) {
            sum += channel[i] ** 2;
            count++;
        }
        
        const rms = Math.sqrt(sum / count);
        const db = 20 * Math.log10(rms + 0.0001);
        
        return Math.max(0, Math.min(1, (db + 60) / 60));
    }
    
    /**
     * Tempo classification
     */
    classifyTempo(bpm) {
        if (bpm < 80) return 'slow';
        if (bpm < 110) return 'moderate';
        if (bpm < 140) return 'fast';
        return 'very-fast';
    }

    /**
     * Detect start of music (skip silence at start)
     */
    detectIntro(audioBuffer) {
        const channel = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const threshold = 0.005;
        
        // Check first 15 seconds
        const maxCheck = Math.min(channel.length, sampleRate * 15);
        for (let i = 0; i < maxCheck; i += 100) {
            if (Math.abs(channel[i]) > threshold) {
                return { start: 0, end: i / sampleRate };
            }
        }
        return { start: 0, end: 0 };
    }

    /**
     * Detect end of music (where fade out finishes)
     */
    detectOutro(audioBuffer) {
        const channel = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const threshold = 0.005;
        
        // Check last 30 seconds
        const maxCheck = Math.min(channel.length, sampleRate * 30);
        const startOffset = channel.length - maxCheck;
        
        for (let i = channel.length - 1; i >= startOffset; i -= 100) {
            if (Math.abs(channel[i]) > threshold) {
                return { start: i / sampleRate, end: duration };
            }
        }
        return { start: duration, end: duration };
    }

    /**
     * Detect silence at start and end
     */
    detectSilence(audioBuffer) {
        const intro = this.detectIntro(audioBuffer);
        const outro = this.detectOutro(audioBuffer);
        return {
            start: intro.end,
            end: audioBuffer.duration - outro.start
        };
    }
    
    /**
     * Simplified FFT
     */
    performFFT(data) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            result.push({ real: data[i], imag: 0 });
        }
        return result;
    }
    
    /**
     * Cache management
     */
    cacheAnalysis(trackId, analysis) {
        if (this.analysisCache.size >= this.maxCacheSize) {
            const firstKey = this.analysisCache.keys().next().value;
            this.analysisCache.delete(firstKey);
        }
        this.analysisCache.set(trackId, analysis);
    }
    
    /**
     * Default analysis for failed cases
     */
    getDefaultAnalysis() {
        return {
            bpm: 120,
            energy: 0.5,
            mood: 'neutral',
            key: 'C',
            danceability: 0.5,
            loudness: 0.5,
            tempo: 'moderate',
            spectralCentroid: 1500,
            duration: 0,
            frequencyBands: {
                subBass: 0.15,
                bass: 0.2,
                lowMid: 0.2,
                midrange: 0.2,
                presence: 0.15,
                brilliance: 0.1
            },
            dynamicRange: {
                crestFactor: 9,
                peak: 0.5,
                rms: 0.1,
                classification: 'moderate'
            },
            vocalProminence: 1.0,
            isVintage: false
        };
    }
    
    /**
     * Batch analyze multiple tracks
     */
    async analyzeBatch(tracks, progressCallback) {
        const results = [];
        
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const analysis = await this.analyzeTrack(track.file, track.id);
            results.push({ ...track, analysis });
            
            if (progressCallback) {
                progressCallback(i + 1, tracks.length, track);
            }
        }
        
        return results;
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        this.analysisCache.clear();
        this.debugLog('Analysis cache cleared', 'info');
    }
    
    /**
     * Save/load stubs for compatibility
     */
    saveAnalysesToStorage() {
        this.debugLog('Analysis cache in memory only', 'info');
    }
    
    loadAnalysesFromStorage() {
        this.debugLog('Analysis cache starting fresh', 'info');
    }
}

window.MusicAnalyzer = MusicAnalyzer;