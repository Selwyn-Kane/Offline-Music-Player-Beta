/* ============================================
   VTT Parser - WebVTT Lyrics Parsing
   ============================================ */

class VTTParser {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.maxFileSize = 10 * 1024 * 1024; // 10MB limit
    }

    async validateVTT(file) {
        this.debugLog(`Validating VTT file: ${file.name}`);
        
        // Check file size
        if (file.size > this.maxFileSize) {
            this.debugLog(`VTT file too large: ${(file.size / 1024 / 1024).toFixed(2)}MB`, 'error');
            return { valid: false, reason: 'File too large (max 10MB)' };
        }
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    
                    // Handle different encodings and normalize line endings
                    const normalizedContent = content
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n');
                    
                    const lines = normalizedContent.split('\n');
                    
                    // Find WEBVTT header (must be first non-empty line)
                    let headerFound = false;
                    for (let i = 0; i < Math.min(lines.length, 5); i++) {
                        const line = lines[i].trim();
                        if (line === '') continue;
                        
                        if (line === 'WEBVTT' || line.startsWith('WEBVTT ') || line.startsWith('WEBVTT\t')) {
                            headerFound = true;
                            break;
                        } else {
                            // First non-empty line must be WEBVTT
                            break;
                        }
                    }
                    
                    if (!headerFound) {
                        this.debugLog('VTT file missing WEBVTT header!', 'error');
                        resolve({ valid: false, reason: 'Missing or invalid WEBVTT header' });
                        return;
                    }
                    
                    // Count valid cues
                    const cueCount = lines.filter(line => {
                        const trimmed = line.trim();
                        return trimmed.includes('-->') && this.isValidTimestampLine(trimmed);
                    }).length;
                    
                    if (cueCount === 0) {
                        this.debugLog('VTT file contains no valid cues', 'warning');
                        resolve({ valid: true, cueCount: 0 });
                        return;
                    }
                    
                    this.debugLog(`VTT file validated: ${cueCount} cues found`, 'success');
                    resolve({ valid: true, cueCount });
                } catch (error) {
                    this.debugLog(`Validation error: ${error.message}`, 'error');
                    resolve({ valid: false, reason: 'Validation error' });
                }
            };
            
            reader.onerror = () => {
                this.debugLog('Failed to read VTT file', 'error');
                resolve({ valid: false, reason: 'File read error' });
            };
            
            reader.readAsText(file);
        });
    }

    isValidTimestampLine(line) {
        // Basic check for timestamp format
        const timeRegex = /(\d{2}:)?(\d{2}:)?\d{2}(\.\d{3})?\s*-->\s*(\d{2}:)?(\d{2}:)?\d{2}(\.\d{3})?/;
        return timeRegex.test(line);
    }

    parseVTTContent(content) {
        const cues = [];
        
        // Normalize line endings
        const normalizedContent = content
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');
        
        const lines = normalizedContent.split('\n');
        let currentCue = null;
        let inNote = false;
        let inStyle = false;
        let headerPassed = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (line === '') {
                // Empty line signals end of current cue
                if (currentCue && currentCue.text) {
                    cues.push(this.finalizeCue(currentCue));
                    currentCue = null;
                }
                inNote = false;
                inStyle = false;
                continue;
            }
            
            // Handle WEBVTT header
            if (!headerPassed) {
                if (line === 'WEBVTT' || line.startsWith('WEBVTT ') || line.startsWith('WEBVTT\t')) {
                    headerPassed = true;
                    continue;
                }
            }
            
            // Handle NOTE blocks (comments)
            if (line.toUpperCase().startsWith('NOTE')) {
                inNote = true;
                continue;
            }
            
            if (inNote) {
                continue;
            }
            
            // Handle STYLE blocks
            if (line.toUpperCase().startsWith('STYLE')) {
                inStyle = true;
                continue;
            }
            
            if (inStyle) {
                continue;
            }
            
            // Check if line is a timestamp line (contains -->)
            if (line.includes('-->')) {
                // Validate timestamp format before processing
                if (!this.isValidTimestampLine(line)) {
                    this.debugLog(`Invalid timestamp format at line ${i + 1}: ${line}`, 'warning');
                    continue;
                }
                
                // If we were already building a cue, finalize it
                if (currentCue && currentCue.text) {
                    cues.push(this.finalizeCue(currentCue));
                }
                
                try {
                    const parsedTimes = this.parseTimestampLine(line);
                    
                    if (parsedTimes) {
                        currentCue = {
                            startTime: parsedTimes.startTime,
                            endTime: parsedTimes.endTime,
                            text: '',
                            settings: parsedTimes.settings || {}
                        };
                        
                        // Validate time range
                        if (currentCue.endTime <= currentCue.startTime) {
                            this.debugLog(`Invalid time range at line ${i + 1}: end <= start`, 'warning');
                            currentCue = null;
                        }
                    }
                } catch (error) {
                    this.debugLog(`Error parsing timestamp at line ${i + 1}: ${error.message}`, 'warning');
                    currentCue = null;
                }
            } else if (currentCue) {
                // This could be a cue identifier (if text is empty) or cue text
                if (currentCue.text === '' && !line.includes(' ') && !this.looksLikeText(line)) {
                    // Likely a cue identifier, skip it
                    currentCue.identifier = line;
                    continue;
                }
                
                // Add text to current cue
                if (currentCue.text !== '') {
                    currentCue.text += '\n';
                }
                currentCue.text += this.cleanCueText(line);
            }
        }
        
        // Don't forget the last cue
        if (currentCue && currentCue.text) {
            cues.push(this.finalizeCue(currentCue));
        }
        
        // Sort cues by start time and validate
        cues.sort((a, b) => a.startTime - b.startTime);
        
        // Remove duplicate or overlapping cues
        const cleanedCues = this.removeDuplicates(cues);
        
        this.debugLog(`Manually parsed ${cleanedCues.length} cues from VTT file`, 'success');
        return cleanedCues;
    }

    looksLikeText(line) {
        // Check if line looks like actual text content vs an identifier
        return line.length > 20 || /[.!?,;:]/.test(line) || line.split(' ').length > 3;
    }

    parseTimestampLine(line) {
        // Split by --> to get start and end times
        const arrowIndex = line.indexOf('-->');
        if (arrowIndex === -1) return null;
        
        const startPart = line.substring(0, arrowIndex).trim();
        const endPart = line.substring(arrowIndex + 3).trim();
        
        // End part might have cue settings after the timestamp
        const endParts = endPart.split(/\s+/);
        const endTimeString = endParts[0];
        const settings = {};
        
        // Parse cue settings if present
        for (let i = 1; i < endParts.length; i++) {
            const setting = endParts[i];
            if (setting.includes(':')) {
                const [key, value] = setting.split(':');
                settings[key.toLowerCase()] = value;
            }
        }
        
        const startTime = this.parseVTTime(startPart);
        const endTime = this.parseVTTime(endTimeString);
        
        if (startTime === null || endTime === null || isNaN(startTime) || isNaN(endTime)) {
            return null;
        }
        
        return { startTime, endTime, settings };
    }

    parseVTTime(timeString) {
        try {
            // Remove any extra whitespace
            timeString = timeString.trim();
            
            // WebVTT format: [hours:]minutes:seconds.milliseconds
            // Regex to match: (HH:)?MM:SS.mmm or SS.mmm
            const timeRegex = /^(?:(\d{2,}):)?(\d{2}):(\d{2})(?:\.(\d{3}))?$/;
            const match = timeString.match(timeRegex);
            
            if (!match) {
                // Try simpler format without milliseconds
                const simpleRegex = /^(?:(\d{2,}):)?(\d{2}):(\d{2})$/;
                const simpleMatch = timeString.match(simpleRegex);
                
                if (!simpleMatch) {
                    return null;
                }
                
                const [, hours, minutes, seconds] = simpleMatch;
                const h = hours ? parseInt(hours, 10) : 0;
                const m = parseInt(minutes, 10);
                const s = parseInt(seconds, 10);
                
                // Validate ranges
                if (m > 59 || s > 59) return null;
                
                return h * 3600 + m * 60 + s;
            }
            
            const [, hours, minutes, seconds, milliseconds] = match;
            const h = hours ? parseInt(hours, 10) : 0;
            const m = parseInt(minutes, 10);
            const s = parseInt(seconds, 10);
            const ms = milliseconds ? parseInt(milliseconds, 10) : 0;
            
            // Validate ranges
            if (m > 59 || s > 59 || ms > 999) return null;
            
            // Return time in seconds with millisecond precision
            return h * 3600 + m * 60 + s + ms / 1000;
        } catch (error) {
            return null;
        }
    }

    cleanCueText(text) {
        // Remove WebVTT tags and clean up text
        let cleaned = text;
        
        // Remove timing tags like <00:00:00.000>
        cleaned = cleaned.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');
        
        // Remove voice/class tags but keep content: <v Name>text</v>
        cleaned = cleaned.replace(/<v\s+[^>]*>/gi, '');
        cleaned = cleaned.replace(/<\/v>/gi, '');
        
        // Remove other HTML-like tags but keep their content
        cleaned = cleaned.replace(/<\/?[^>]+(>|$)/g, '');
        
        // Normalize whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        // Decode HTML entities
        cleaned = this.decodeHTMLEntities(cleaned);
        
        return cleaned;
    }

    decodeHTMLEntities(text) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&nbsp;': ' '
        };
        
        return text.replace(/&[^;]+;/g, match => entities[match] || match);
    }

    finalizeCue(cue) {
        // Final cleanup and validation
        return {
            startTime: Math.max(0, cue.startTime),
            endTime: Math.max(cue.startTime + 0.001, cue.endTime),
            text: cue.text.trim()
        };
    }

    removeDuplicates(cues) {
        const seen = new Map();
        const result = [];
        
        for (const cue of cues) {
            const key = `${cue.startTime.toFixed(3)}-${cue.text}`;
            
            if (!seen.has(key)) {
                seen.set(key, true);
                result.push(cue);
            } else {
                this.debugLog(`Removed duplicate cue at ${cue.startTime}s`, 'warning');
            }
        }
        
        return result;
    }

    async loadVTTFile(file) {
        return new Promise((resolve, reject) => {
            // Check file size before loading
            if (file.size > this.maxFileSize) {
                this.debugLog(`VTT file too large: ${(file.size / 1024 / 1024).toFixed(2)}MB`, 'error');
                reject(new Error('File too large (max 10MB)'));
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const cues = this.parseVTTContent(content);
                    
                    if (cues.length > 0) {
                        this.debugLog(`Successfully parsed ${cues.length} cues for custom display`, 'success');
                        resolve(cues);
                    } else {
                        this.debugLog('No valid cues found in VTT file', 'warning');
                        resolve([]);
                    }
                } catch (error) {
                    this.debugLog(`Failed to parse VTT file: ${error.message}`, 'error');
                    reject(new Error(`Failed to parse VTT file: ${error.message}`));
                }
            };
            
            reader.onerror = () => {
                this.debugLog('Failed to read VTT file', 'error');
                reject(new Error('Failed to read VTT file'));
            };
            
            reader.readAsText(file);
        });
    }

    parseLRC(lrcContent) {
        const cues = [];
        const lines = lrcContent.split('\n');
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(timeRegex);

            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const msPart = match[3];
                const milliseconds = parseInt(msPart.padEnd(3, '0').substring(0, 3), 10);
                
                const startTime = minutes * 60 + seconds + milliseconds / 1000;
                const text = line.replace(timeRegex, '').trim();

                if (text) {
                    cues.push({
                        startTime: startTime,
                        endTime: startTime + 5, // Temporary end time
                        text: text
                    });
                }
            }
        }

        // Fix end times based on next cue's start time
        for (let i = 0; i < cues.length - 1; i++) {
            cues[i].endTime = cues[i + 1].startTime;
        }

        return cues;
    }

    convertLRCToVTT(lrcContent) {
        const cues = this.parseLRC(lrcContent);
        let vtt = "WEBVTT\n\n";

        cues.forEach(cue => {
            const start = this.formatVTTTime(cue.startTime);
            const end = this.formatVTTTime(cue.endTime);
            vtt += `${start} --> ${end}\n${cue.text}\n\n`;
        });

        return vtt;
    }

    formatVTTTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}

// Export for use
window.VTTParser = VTTParser;