// ========== MetadataParser Class ==========
class MetadataParser {
    constructor(debugLog) {
        this.debugLog = debugLog || (() => {});
    }

    async extractMetadata(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        
        try {
            let metadata;
            
            switch(extension) {
                case 'mp3':
                    metadata = await this.parseMP3(file);
                    break;
                case 'm4a':
                case 'mp4':
                case 'aac':
                    metadata = await this.parseM4A(file);
                    break;
                case 'flac':
                    metadata = await this.parseFLAC(file);
                    break;
                case 'ogg':
                    metadata = await this.parseOGG(file);
                    break;
                case 'wav':
                    metadata = await this.parseWAV(file);
                    break;
                default:
                    throw new Error(`Unsupported format: ${extension}`);
            }
            
            return metadata;
            
        } catch (err) {
            throw new Error(`Metadata extraction failed: ${err.message}`);
        }
    }

    async parseMP3(file) {
        const buffer = await this.readFileChunk(file, 0, 500000);
        const view = new DataView(buffer);
        
        if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) !== 'ID3') {
            throw new Error('No ID3v2 tag found');
        }
        
        const version = view.getUint8(3);
        const tagSize = this.synchsafe32(view, 6);
        
        let metadata = { title: null, artist: null, album: null };
        let pos = 10;

        while (pos < tagSize + 10) {
            if (pos + 10 > buffer.byteLength) break;
            
            const frameId = String.fromCharCode(
                view.getUint8(pos), view.getUint8(pos+1), 
                view.getUint8(pos+2), view.getUint8(pos+3)
            );
            
            const frameSize = version === 4 
                ? this.synchsafe32(view, pos + 4)
                : view.getUint32(pos + 4);
            
            if (frameSize === 0 || frameSize > tagSize) break;
            
            const dataStart = pos + 10;
            const encoding = view.getUint8(dataStart);

            if (frameId === 'TIT2') metadata.title = this.decodeText(view, dataStart + 1, frameSize - 1, encoding);
            if (frameId === 'TPE1') metadata.artist = this.decodeText(view, dataStart + 1, frameSize - 1, encoding);
            if (frameId === 'TALB') metadata.album = this.decodeText(view, dataStart + 1, frameSize - 1, encoding);
            
            pos += 10 + frameSize;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    async parseM4A(file) {
        const buffer = await this.readFileChunk(file, 0, 200000);
        const view = new DataView(buffer);
        
        let metadata = { title: null, artist: null, album: null };
        let pos = 0;

        while (pos < buffer.byteLength - 8) {
            const atomSize = view.getUint32(pos);
            const atomType = String.fromCharCode(
                view.getUint8(pos+4), view.getUint8(pos+5), 
                view.getUint8(pos+6), view.getUint8(pos+7)
            );
            
            if (atomType === 'moov') {
                const ilst = this.findAtom(view, pos + 8, atomSize - 8, ['udta', 'meta', 'ilst']);
                if (ilst) {
                    metadata = this.parseILST(view, ilst.pos, ilst.size);
                }
                break;
            }
            
            pos += atomSize;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseILST(view, start, size) {
        const metadata = { title: null, artist: null, album: null };
        let pos = start;
        const end = start + size;

        while (pos < end - 8) {
            const atomSize = view.getUint32(pos);
            if (atomSize === 0 || atomSize > (end - pos)) break;
            
            const atomType = String.fromCharCode(
                view.getUint8(pos+4), view.getUint8(pos+5), 
                view.getUint8(pos+6), view.getUint8(pos+7)
            );
            
            const dataPos = pos + 8;
            const dataSize = view.getUint32(dataPos);
            const dataType = String.fromCharCode(
                view.getUint8(dataPos+4), view.getUint8(dataPos+5), 
                view.getUint8(dataPos+6), view.getUint8(dataPos+7)
            );
            
            if (dataType === 'data') {
                const dataFlags = view.getUint32(dataPos + 8);
                const textStart = dataPos + 16;
                const textLen = dataSize - 16;
                
                if (dataFlags === 1) {
                    const text = this.decodeText(view, textStart, textLen, 1);
                    
                    if (atomType === '©nam') metadata.title = text;
                    if (atomType === '©ART') metadata.artist = text;
                    if (atomType === '©alb') metadata.album = text;
                }
            }
            
            pos += atomSize;
        }
        
        return metadata;
    }

    async parseFLAC(file) {
        const buffer = await this.readFileChunk(file, 0, 200000);
        const view = new DataView(buffer);
        
        if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'fLaC') {
            throw new Error('Not a valid FLAC file');
        }
        
        let metadata = { title: null, artist: null, album: null };
        let pos = 4;

        while (pos < buffer.byteLength - 4) {
            const header = view.getUint8(pos);
            const isLast = (header & 0x80) !== 0;
            const blockType = header & 0x7F;
            const blockSize = (view.getUint8(pos+1) << 16) | (view.getUint8(pos+2) << 8) | view.getUint8(pos+3);
            
            pos += 4;
            
            if (blockType === 4) {
                metadata = this.parseVorbisComment(view, pos, blockSize);
            }
            
            pos += blockSize;
            if (isLast) break;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseVorbisComment(view, start, size) {
        const metadata = { title: null, artist: null, album: null };
        let pos = start;
        
        const vendorLen = view.getUint32(pos, true);
        pos += 4 + vendorLen;
        
        const commentCount = view.getUint32(pos, true);
        pos += 4;
        
        for (let i = 0; i < commentCount; i++) {
            const commentLen = view.getUint32(pos, true);
            pos += 4;
            
            const comment = this.decodeText(view, pos, commentLen, 1);
            pos += commentLen;
            
            const [key, value] = comment.split('=', 2);
            const keyUpper = key.toUpperCase();
            
            if (keyUpper === 'TITLE') metadata.title = value;
            if (keyUpper === 'ARTIST') metadata.artist = value;
            if (keyUpper === 'ALBUM') metadata.album = value;
        }
        
        return metadata;
    }

    async parseOGG(file) {
        const buffer = await this.readFileChunk(file, 0, 100000);
        const view = new DataView(buffer);
        
        if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'OggS') {
            throw new Error('Not a valid OGG file');
        }
        
        let metadata = { title: null, artist: null, album: null };
        let pos = 0;

        while (pos < buffer.byteLength - 27) {
            if (String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3)) !== 'OggS') {
                pos++;
                continue;
            }
            
            const segmentCount = view.getUint8(pos + 26);
            pos += 27;
            
            let pageSize = 0;
            for (let i = 0; i < segmentCount; i++) {
                pageSize += view.getUint8(pos + i);
            }
            pos += segmentCount;
            
            const packetType = view.getUint8(pos);
            if (packetType === 3) {
                const vorbisStr = String.fromCharCode(
                    view.getUint8(pos+1), view.getUint8(pos+2), 
                    view.getUint8(pos+3), view.getUint8(pos+4), 
                    view.getUint8(pos+5), view.getUint8(pos+6)
                );
                
                if (vorbisStr === 'vorbis') {
                    metadata = this.parseVorbisComment(view, pos + 7, pageSize - 7);
                    break;
                }
            }
            
            pos += pageSize;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    async parseWAV(file) {
        const buffer = await this.readFileChunk(file, 0, 100000);
        const view = new DataView(buffer);
        
        if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'RIFF') {
            throw new Error('Not a valid WAV file');
        }
        
        let metadata = { title: null, artist: null, album: null };
        let pos = 12;

        while (pos < buffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                view.getUint8(pos), view.getUint8(pos+1), 
                view.getUint8(pos+2), view.getUint8(pos+3)
            );
            const chunkSize = view.getUint32(pos + 4, true);
            
            if (chunkId === 'LIST') {
                const listType = String.fromCharCode(
                    view.getUint8(pos+8), view.getUint8(pos+9), 
                    view.getUint8(pos+10), view.getUint8(pos+11)
                );
                
                if (listType === 'INFO') {
                    metadata = this.parseWAVInfo(view, pos + 12, chunkSize - 4);
                }
            }
            
            pos += 8 + chunkSize;
            if (chunkSize % 2 !== 0) pos++;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseWAVInfo(view, start, size) {
        const metadata = { title: null, artist: null, album: null };
        let pos = start;
        const end = start + size;

        while (pos < end - 8) {
            const fieldId = String.fromCharCode(
                view.getUint8(pos), view.getUint8(pos+1), 
                view.getUint8(pos+2), view.getUint8(pos+3)
            );
            const fieldSize = view.getUint32(pos + 4, true);
            
            const text = this.decodeText(view, pos + 8, fieldSize, 0);
            
            if (fieldId === 'INAM') metadata.title = text;
            if (fieldId === 'IART') metadata.artist = text;
            if (fieldId === 'IPRD') metadata.album = text;
            
            pos += 8 + fieldSize;
            if (fieldSize % 2 !== 0) pos++;
        }
        
        return metadata;
    }

    async readFileChunk(file, start, length) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsArrayBuffer(file.slice(start, start + length));
        });
    }

    synchsafe32(view, offset) {
        return (view.getUint8(offset) << 21) | 
               (view.getUint8(offset+1) << 14) | 
               (view.getUint8(offset+2) << 7) | 
               view.getUint8(offset+3);
    }

    decodeText(view, start, length, encoding) {
        const bytes = new Uint8Array(view.buffer, start, length);
        
        try {
            if (encoding === 0) {
                return String.fromCharCode(...bytes);
            } else if (encoding === 1 || encoding === undefined) {
                return new TextDecoder('utf-8').decode(bytes);
            } else if (encoding === 2) {
                return new TextDecoder('utf-16le').decode(bytes);
            } else if (encoding === 3) {
                return new TextDecoder('utf-16be').decode(bytes);
            }
        } catch (e) {
            return String.fromCharCode(...bytes.filter(b => b >= 32 && b <= 126));
        }
        
        return '';
    }

    findAtom(view, start, size, path) {
        let pos = start;
        const end = start + size;
        const targetAtom = path[0];
        
        while (pos < end - 8) {
            const atomSize = view.getUint32(pos);
            if (atomSize === 0 || atomSize > (end - pos)) break;
            
            const atomType = String.fromCharCode(
                view.getUint8(pos+4), view.getUint8(pos+5), 
                view.getUint8(pos+6), view.getUint8(pos+7)
            );
            
            if (atomType === targetAtom) {
                if (path.length === 1) {
                    return { pos: pos + 8, size: atomSize - 8 };
                } else {
                    return this.findAtom(view, pos + 8, atomSize - 8, path.slice(1));
                }
            }
            
            pos += atomSize;
        }
        
        return null;
    }

    normalizeMetadata(metadata, file) {
        if (!metadata.title || !metadata.artist) {
            throw new Error('Missing title or artist');
        }
        
        return {
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album || 'Unknown Album'
        };
    }
}

// ========== LyricsSearchEngine Class ==========
class LyricsSearchEngine {
    constructor() {
        this.attemptLog = [];
        this.rateLimitDelay = 200;
    }

    async enhancedSmartSearch(artist, title) {
        this.attemptLog = [];
        
        const titleVariations = this.getTitleVariations(title);
        const artistVariations = this.getArtistVariations(artist);
        
        let result = await this.tryLRCLIB(artist, title, 'LRCLIB: Exact match');
        if (result) return result;
        
        const cleanedTitle = this.cleanString(title);
        const cleanedArtist = this.cleanString(artist);
        
        if (cleanedTitle !== title || cleanedArtist !== artist) {
            result = await this.tryLRCLIB(cleanedArtist, cleanedTitle, 'LRCLIB: Cleaned');
            if (result) return result;
        }
        
        for (const titleVar of titleVariations.slice(0, 5)) {
            result = await this.tryLRCLIB(cleanedArtist, titleVar, `LRCLIB: Title var "${titleVar.substring(0, 30)}..."`);
            if (result) return result;
        }
        
        for (const artistVar of artistVariations.slice(0, 5)) {
            result = await this.tryLRCLIB(artistVar, cleanedTitle, `LRCLIB: Artist var "${artistVar}"`);
            if (result) return result;
        }
        
        result = await this.tryLRCLIB(cleanedTitle, cleanedArtist, 'LRCLIB: Swapped artist/title');
        if (result) return result;
        
        result = await this.tryLRCLIBSearch(cleanedArtist, cleanedTitle, 'LRCLIB: Fuzzy search');
        if (result) return result;
        
        result = await this.tryLyricsOVH(cleanedArtist, cleanedTitle, 'Lyrics.ovh: Search');
        if (result) return result;
        
        return null;
    }

    getTitleVariations(title) {
        const variations = [];
        variations.push(title.replace(/\s*-?\s*topic\s*$/gi, '').trim());
        variations.push(title.replace(/\s*-?\s*(remastered|remaster|deluxe|edition|version|single|album|mix|radio edit)\s*(\(\d+\))?/gi, '').trim());
        variations.push(title.replace(/\s*\(feat\..*?\)/gi, '').trim());
        variations.push(title.replace(/\s*ft\..*$/gi, '').trim());
        variations.push(title.replace(/\s*featuring.*$/gi, '').trim());
        variations.push(title.replace(/'/g, ''));
        variations.push(title.replace(/'/g, ''));
        if (title.toLowerCase().startsWith('the ')) {
            variations.push(title.substring(4));
        }
        variations.push(title.replace(/[^\w\s\-&]/g, ' ').replace(/\s+/g, ' ').trim());
        variations.push(title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim());
        return [...new Set(variations.filter(v => v && v !== title && v.length > 1))];
    }

    getArtistVariations(artist) {
        const variations = [];
        variations.push(artist.replace(/\s*-?\s*topic\s*$/gi, '').trim());
        if (!artist.toLowerCase().includes('cast')) {
            variations.push(`${artist} Cast`);
        }
        if (artist.toLowerCase().includes('cast')) {
            variations.push(artist.replace(/\s*cast\s*/gi, '').trim());
        }
        if (artist.includes(',')) {
            variations.push(artist.split(',')[0].trim());
        }
        if (artist.toLowerCase().startsWith('the ')) {
            variations.push(artist.substring(4));
        }
        if (artist.includes('&') || artist.toLowerCase().includes(' and ')) {
            variations.push(artist.split(/\s*&\s*|\s+and\s+/i)[0].trim());
        }
        return [...new Set(variations.filter(v => v && v !== artist && v.length > 0))];
    }

    cleanString(str) {
        return str
            .replace(/\s*-?\s*topic\s*$/gi, '')
            .replace(/\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\s*feat\.?\s*.*/i, '')
            .replace(/\s*ft\.?\s*.*/i, '')
            .replace(/\s*featuring\s*.*/i, '')
            .replace(/\s*with\s*.*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async tryLRCLIB(artist, title, attemptDesc) {
        await this.rateLimit();
        
        try {
            const params = new URLSearchParams({
                artist_name: artist,
                track_name: title
            });
            
            const response = await fetch(`https://lrclib.net/api/get?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.syncedLyrics) {
                    this.attemptLog.push(`✓ ${attemptDesc}`);
                    return this.parseLRC(data.syncedLyrics);
                } else if (data.plainLyrics) {
                    this.attemptLog.push(`✓ ${attemptDesc} (unsynced)`);
                    return this.createFakeSyncedLyrics(data.plainLyrics);
                }
            }
            
            this.attemptLog.push(`✗ ${attemptDesc}`);
        } catch (err) {
            this.attemptLog.push(`✗ ${attemptDesc} (error: ${err.message})`);
        }
        
        return null;
    }

    async tryLRCLIBSearch(artist, title, attemptDesc) {
        await this.rateLimit();
        
        try {
            const params = new URLSearchParams({
                track_name: title,
                artist_name: artist
            });
            
            const response = await fetch(`https://lrclib.net/api/search?${params}`);
            
            if (response.ok) {
                const results = await response.json();
                
                if (results && results.length > 0) {
                    const first = results[0];
                    
                    if (first.syncedLyrics) {
                        this.attemptLog.push(`✓ ${attemptDesc}: "${first.trackName}" by ${first.artistName}`);
                        return this.parseLRC(first.syncedLyrics);
                    } else if (first.plainLyrics) {
                        this.attemptLog.push(`✓ ${attemptDesc} (unsynced): "${first.trackName}" by ${first.artistName}`);
                        return this.createFakeSyncedLyrics(first.plainLyrics);
                    }
                }
            }
            
            this.attemptLog.push(`✗ ${attemptDesc}`);
        } catch (err) {
            this.attemptLog.push(`✗ ${attemptDesc} (error: ${err.message})`);
        }
        
        return null;
    }

    async tryLyricsOVH(artist, title, attemptDesc) {
        await this.rateLimit();
        
        try {
            const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.lyrics) {
                    this.attemptLog.push(`✓ ${attemptDesc} (unsynced)`);
                    return this.createFakeSyncedLyrics(data.lyrics);
                }
            }
            
            this.attemptLog.push(`✗ ${attemptDesc}`);
        } catch (err) {
            this.attemptLog.push(`✗ ${attemptDesc} (error: ${err.message})`);
        }
        
        return null;
    }

    parseLRC(lrcContent) {
        const lines = lrcContent.split('\n');
        const lyrics = [];
        
        for (const line of lines) {
            const match = line.match(/\[(\d+):(\d+)\.(\d+)\](.*)/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const centiseconds = parseInt(match[3]);
                const text = match[4].trim();
                
                const time = minutes * 60 + seconds + centiseconds / 100;
                lyrics.push({ time, text });
            }
        }
        
        return lyrics.length > 0 ? lyrics : null;
    }

    createFakeSyncedLyrics(plainLyrics) {
        const lines = plainLyrics.split('\n');
        return lines.map((text, i) => ({
            time: i * 3,
            text: text.trim()
        })).filter(l => l.text);
    }

    async rateLimit() {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
    }

    getAttemptSummary() {
        return this.attemptLog.join('\n');
    }
}

// ========== Worker Message Handler ==========
self.onmessage = async function(e) {
    const { id, file, fileData } = e.data;
    
    try {
        // Recreate File object from data
        const fileObj = new File([fileData], file.name, { type: file.type });
        
        // Extract metadata
        const parser = new MetadataParser();
        let metadata;
        
        try {
            metadata = await parser.extractMetadata(fileObj);
        } catch (err) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            metadata = {
                title: nameWithoutExt,
                artist: 'Unknown Artist'
            };
        }
        
        // Search for lyrics
        const searchEngine = new LyricsSearchEngine();
        const lyrics = await searchEngine.enhancedSmartSearch(metadata.artist, metadata.title);
        
        // Send result back
        self.postMessage({
            id,
            success: true,
            file: file,
            metadata: metadata,
            lyrics: lyrics,
            attemptLog: searchEngine.getAttemptSummary()
        });
        
    } catch (err) {
        self.postMessage({
            id,
            success: false,
            file: file,
            error: err.message
        });
    }
};