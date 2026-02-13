/* ============================================
   Analysis Text Parser
   Reads .txt files from Deep Analysis Tool
   ============================================ */

class AnalysisTextParser {
    constructor(debugLog) {
        this.debugLog = debugLog;
    }
    
    /**
     * Parse analysis text file and return analysis object
     */
    parseAnalysisText(textContent) {
        const analysis = {};
        
        try {
            // Split into lines
            const lines = textContent.split('\n');
            
            // Parse each line looking for key-value pairs
            for (const line of lines) {
                const trimmed = line.trim();
                
                // === BASIC METRICS ===
                if (trimmed.startsWith('Duration:')) {
                    const durationStr = trimmed.split(':').slice(1).join(':').trim();
                    analysis.duration = this.parseTime(durationStr);
                    }
                
                if (trimmed.startsWith('BPM:')) {
                    const bpmMatch = trimmed.match(/BPM:\s*(\d+)/);
                    if (bpmMatch) {
                        analysis.bpm = parseInt(bpmMatch[1]);
                    }
                    // Extract confidence
                    if (trimmed.includes('High')) analysis.bpmConfidence = 'high';
                    else if (trimmed.includes('Medium')) analysis.bpmConfidence = 'medium';
                    else if (trimmed.includes('Low')) analysis.bpmConfidence = 'low';
                }
                
                if (trimmed.startsWith('Key:')) {
                    const keyLine = trimmed.split(':')[1].trim();
                    const keyMatch = keyLine.match(/^(\w#?) (major|minor)/);
                    if (keyMatch) {
                        analysis.key = keyMatch[1];
                        analysis.mode = keyMatch[2];
                    } else {
                        analysis.key = keyLine;
                    }
                    // Extract confidence
                    if (trimmed.includes('High')) analysis.keyConfidence = 'high';
                    else if (trimmed.includes('Medium')) analysis.keyConfidence = 'medium';
                    else if (trimmed.includes('Low')) analysis.keyConfidence = 'low';
                }
                
                if (trimmed.startsWith('Tempo:')) {
                    analysis.tempo = trimmed.split(':')[1].trim();
                }
                
                if (trimmed.startsWith('Genre:')) {
                    analysis.genre = trimmed.split(':')[1].trim();
                }
                
if (trimmed.startsWith('Mood:')) {
    const moodText = trimmed.split(':')[1].trim();
    
    // Our 5 allowed mood terms
    const primaryMoods = ['energetic', 'bright', 'calm', 'dark', 'neutral'];
    
    // First check if there's a slash (like "Happy/Energetic")
    if (moodText.includes('/')) {
        const parts = moodText.split('/');
        // Check each part for a valid mood
        for (const part of parts) {
            const lowerPart = part.trim().toLowerCase();
            if (primaryMoods.includes(lowerPart)) {
                analysis.mood = lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
                this.debugLog(`Slash-separated mood: "${moodText}" -> "${analysis.mood}"`, 'info');
                break; // <-- Changed from 'return' to 'break'
            }
        }
    }
    
    // If mood not set yet, try other methods
    if (!analysis.mood) {
        // Try direct match (case-insensitive)
        const lowerText = moodText.toLowerCase();
        let foundMood = null;
        
        for (const mood of primaryMoods) {
            if (lowerText === mood) {
                foundMood = mood;
                break;
            }
        }
        
        // Look for mood anywhere in the text
        if (!foundMood) {
            // Simple substring search instead of regex with word boundaries
            const lowerMoodText = moodText.toLowerCase();
            for (const mood of primaryMoods) {
                if (lowerMoodText.includes(mood)) {
                    foundMood = mood;
                    break;
                }
            }
        }
        
        // Set the mood (or default to Neutral)
        if (foundMood) {
            analysis.mood = foundMood.charAt(0).toUpperCase() + foundMood.slice(1);
            this.debugLog(`Parsed mood: "${moodText}" -> "${analysis.mood}"`, 'info');
        } else {
            analysis.mood = 'Neutral';
            this.debugLog(`No mood term found in: "${moodText}", defaulting to Neutral`, 'warning');
        }
    }
}
                
                // === AUDIO CHARACTERISTICS ===
                if (trimmed.startsWith('Energy:')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.energy = parseFloat(match[1]) / 100;
                    }
                    // Also extract LUFS value
                    const lufsMatch = trimmed.match(/\(([-\d.]+) LUFS\)/);
                    if (lufsMatch) {
                        analysis.loudnessLUFS = parseFloat(lufsMatch[1]);
                    }
                }
                
                if (trimmed.startsWith('Loudness:')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.loudness = parseFloat(match[1]) / 100;
                    }
                }
                
                if (trimmed.startsWith('Danceability:')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.danceability = parseFloat(match[1]) / 100;
                    }
                }
                
                if (trimmed.startsWith('Valence (Positivity):')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.valence = parseFloat(match[1]) / 100;
                    }
                }
                
                if (trimmed.startsWith('Speechiness:')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.speechiness = parseFloat(match[1]) / 100;
                    }
                }
                
                if (trimmed.startsWith('Acousticness:')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.acousticness = parseFloat(match[1]) / 100;
                    }
                }
                
                if (trimmed.startsWith('Instrumentalness:')) {
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) {
                        analysis.instrumentalness = parseFloat(match[1]) / 100;
                    }
                }
                
                // === SPECTRAL FEATURES ===
                if (trimmed.startsWith('Spectral Centroid:')) {
                    analysis.spectralCentroid = parseFloat(trimmed.split(':')[1].trim().split(' ')[0]);
                }
                
                if (trimmed.startsWith('Spectral Rolloff:')) {
                    analysis.spectralRolloff = parseFloat(trimmed.split(':')[1].trim().split(' ')[0]);
                }
                
                if (trimmed.startsWith('Spectral Flux:')) {
                    analysis.spectralFlux = parseFloat(trimmed.split(':')[1].trim());
                }
                
                if (trimmed.startsWith('Zero-Crossing Rate:')) {
                    analysis.zeroCrossingRate = parseFloat(trimmed.split(':')[1].trim());
                }
                
                if (trimmed.startsWith('Vocal Prominence:')) {
                    analysis.vocalProminence = parseFloat(trimmed.split(':')[1].trim());
                }
                
                // === RHYTHM & DYNAMICS ===
                if (trimmed.startsWith('Onset Rate:')) {
                    analysis.onsetRate = parseFloat(trimmed.split(':')[1].trim().split(' ')[0]);
                }
                
                if (trimmed.startsWith('Rhythmic Complexity:')) {
                    analysis.rhythmicComplexity = trimmed.split(':')[1].trim();
                }
                
                if (trimmed.startsWith('Crest Factor:')) {
                    if (!analysis.dynamicRange) analysis.dynamicRange = {};
                    analysis.dynamicRange.crestFactor = parseFloat(trimmed.split(':')[1].trim().split(' ')[0]);
                }
                
                if (trimmed.startsWith('Dynamic Range:')) {
                    if (!analysis.dynamicRange) analysis.dynamicRange = {};
                    analysis.dynamicRange.classification = trimmed.split(':')[1].trim();
                }
                
                if (trimmed.startsWith('Peak Amplitude:')) {
                    if (!analysis.dynamicRange) analysis.dynamicRange = {};
                    analysis.dynamicRange.peak = parseFloat(trimmed.split(':')[1].trim());
                }
                
                if (trimmed.startsWith('RMS:') && trimmed.split(':').length === 2) {
                    if (!analysis.dynamicRange) analysis.dynamicRange = {};
                    analysis.dynamicRange.rms = parseFloat(trimmed.split(':')[1].trim());
                }
                
                // === FREQUENCY BANDS ===
                if (trimmed.startsWith('Sub-Bass')) {
                    if (!analysis.frequencyBands) analysis.frequencyBands = {};
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) analysis.frequencyBands.subBass = parseFloat(match[1]) / 100;
                }
                
                if (trimmed.startsWith('Bass (60-200')) {
                    if (!analysis.frequencyBands) analysis.frequencyBands = {};
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) analysis.frequencyBands.bass = parseFloat(match[1]) / 100;
                }
                
                if (trimmed.startsWith('Low-Mid')) {
                    if (!analysis.frequencyBands) analysis.frequencyBands = {};
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) analysis.frequencyBands.lowMid = parseFloat(match[1]) / 100;
                }
                
                if (trimmed.startsWith('Midrange')) {
                    if (!analysis.frequencyBands) analysis.frequencyBands = {};
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) analysis.frequencyBands.midrange = parseFloat(match[1]) / 100;
                }
                
                if (trimmed.startsWith('Presence')) {
                    if (!analysis.frequencyBands) analysis.frequencyBands = {};
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) analysis.frequencyBands.presence = parseFloat(match[1]) / 100;
                }
                
                if (trimmed.startsWith('Brilliance')) {
                    if (!analysis.frequencyBands) analysis.frequencyBands = {};
                    const match = trimmed.match(/(\d+\.?\d*)%/);
                    if (match) analysis.frequencyBands.brilliance = parseFloat(match[1]) / 100;
                }
                
                // === RECORDING CHARACTERISTICS ===
                if (trimmed.startsWith('Vintage Recording:')) {
                    analysis.isVintage = trimmed.split(':')[1].trim().toLowerCase() === 'yes';
                }
            }

            // === ADD DEBUGGING HERE ===
console.log('PARSER DEBUG - Full analysis object:', analysis);
console.log('PARSER DEBUG - BPM:', analysis.bpm, 'Type:', typeof analysis.bpm);
console.log('PARSER DEBUG - Energy:', analysis.energy, 'Type:', typeof analysis.energy);
console.log('PARSER DEBUG - Mood:', analysis.mood);
console.log('PARSER DEBUG - isValidAnalysis check:', this.isValidAnalysis(analysis));
            // === END DEBUGGING ===
            
            this.debugLog('✅ Parsed analysis from text file', 'success');
            return analysis;
            
        } catch (err) {
            this.debugLog(`❌ Failed to parse analysis: ${err.message}`, 'error');
            return null;
        }
    }
    
    /**
     * Parse time string (e.g., "3:45") to seconds
     */
parseTime(timeStr) {
    // Handle formats: "3:45", "03:45", "3m 45s", etc.
    timeStr = timeStr.trim();
    
    // Remove any non-digit, non-colon characters
    timeStr = timeStr.replace(/[^\d:]/g, '');
    
    const parts = timeStr.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return 0;
}
    
    /**
     * Check if analysis text is valid
     */
    isValidAnalysis(analysis) {
        return analysis && 
               typeof analysis.bpm === 'number' && 
               typeof analysis.energy === 'number' && 
               analysis.mood &&
               !isNaN(analysis.bpm) &&
               !isNaN(analysis.energy);
    }
}

window.AnalysisTextParser = AnalysisTextParser;