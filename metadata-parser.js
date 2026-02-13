/* ============================================
   Complete Multi-Format Metadata Parser
   Supports: MP3, M4A, FLAC, OGG, WAV, AAC, WMA
   Enhanced with robust tag extraction and memory management
   ============================================ */

class MetadataParser {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.activeBlobs = new Set();
    }

    async extractMetadata(file) {
        this.debugLog(`Extracting metadata from: ${file.name}`);
        
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
                case 'wma':
                    metadata = await this.parseWMA(file);
                    break;
                default:
                    this.debugLog(`Unsupported format: ${extension}`, 'warning');
                    metadata = this.getDefaultMetadata(file);
            }
            
            // Validate metadata before returning
            if (!metadata.title) {
                metadata.title = file.name.replace(/\.[^/.]+$/, '');
                this.debugLog(`Warning: Title was empty, using filename: ${metadata.title}`, 'warning');
            }
            
            this.debugLog(`Metadata extracted - Title: "${metadata.title}", Artist: "${metadata.artist || 'Unknown'}"`, 'success');
            return metadata;
            
        } catch (err) {
            this.debugLog(`Metadata extraction failed for ${file.name}: ${err.message}`, 'error');
            return this.getDefaultMetadata(file);
        }
    }

    // Cleanup helper for object URLs
    revokeMetadataImages(metadataList) {
        metadataList.forEach(m => {
            if (m.image && m.image.startsWith('blob:')) {
                URL.revokeObjectURL(m.image);
            }
        });
    }

    // ========== MP3 / ID3v2 Parser ==========
    async parseMP3(file) {
        // Read larger chunk to ensure we get the full ID3 header
        const buffer = await this.readFileChunk(file, 0, 1024 * 1024); // 1MB
        const view = new DataView(buffer);
        
        if (buffer.byteLength < 10 || String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) !== 'ID3') {
            // Check for ID3v1 at the end of file
            return await this.parseID3v1(file);
        }
        
        const version = view.getUint8(3);
        const tagSize = this.synchsafe32(view, 6);
        
        let metadata = { title: null, artist: null, album: null, year: null, image: null, genre: null, track: null };
        let pos = 10;

        // Handle ID3v2.2 (3-char frame IDs)
        const isV22 = version === 2;
        const frameHeaderSize = isV22 ? 6 : 10;

        while (pos < tagSize + 10 && pos + frameHeaderSize < buffer.byteLength) {
            let frameId, frameSize;
            
            if (isV22) {
                frameId = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2));
                frameSize = (view.getUint8(pos+3) << 16) | (view.getUint8(pos+4) << 8) | view.getUint8(pos+5);
            } else {
                frameId = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3));
                frameSize = version === 4 ? this.synchsafe32(view, pos + 4) : view.getUint32(pos + 4);
            }
            
            if (frameSize <= 0 || pos + frameHeaderSize + frameSize > buffer.byteLength) break;
            
            const dataStart = pos + frameHeaderSize;
            const encoding = view.getUint8(dataStart);

            // Mapping for v2.2 and v2.3/4
            const idMap = {
                'TIT2': 'title', 'TT2': 'title',
                'TPE1': 'artist', 'TP1': 'artist',
                'TALB': 'album', 'TAL': 'album',
                'TYER': 'year', 'TDRC': 'year', 'TYE': 'year',
                'TCON': 'genre', 'TCO': 'genre',
                'TRCK': 'track', 'TRK': 'track',
                'APIC': 'image', 'PIC': 'image'
            };

            const field = idMap[frameId];
            if (field) {
                if (field === 'image') {
                    if (isV22) {
                        metadata.image = this.extractID3v22Image(view, dataStart, frameSize);
                    } else {
                        metadata.image = this.extractID3Image(view, dataStart, frameSize);
                    }
                } else {
                    const text = this.decodeText(view, dataStart + 1, frameSize - 1, encoding);
                    if (field === 'year') metadata.year = parseInt(text);
                    else metadata[field] = text;
                }
            }
            
            pos += frameHeaderSize + frameSize;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    async parseID3v1(file) {
        const size = file.size;
        if (size < 128) return this.getDefaultMetadata(file);
        
        const buffer = await this.readFileChunk(file, size - 128, 128);
        const view = new DataView(buffer);
        
        if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) !== 'TAG') {
            return this.getDefaultMetadata(file);
        }
        
        // ID3v1 is traditionally ISO-8859-1, but many use local encodings
        return this.normalizeMetadata({
            title: this.decodeText(view, 3, 30, 0),
            artist: this.decodeText(view, 33, 30, 0),
            album: this.decodeText(view, 63, 30, 0),
            year: parseInt(this.decodeText(view, 93, 4, 0)) || null
        }, file);
    }

    // ========== M4A / MP4 Parser ==========
    async parseM4A(file) {
        const buffer = await this.readFileChunk(file, 0, 1024 * 512); // 512KB
        const view = new DataView(buffer);
        
        let metadata = { title: null, artist: null, album: null, year: null, image: null };
        
        const moov = this.findAtom(view, 0, buffer.byteLength, ['moov']);
        if (moov) {
            const ilst = this.findAtom(view, moov.pos, moov.size, ['udta', 'meta', 'ilst']);
            if (ilst) {
                metadata = this.parseILST(view, ilst.pos, ilst.size);
            }
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseILST(view, start, size) {
        const metadata = { title: null, artist: null, album: null, year: null, image: null };
        let pos = start;
        const end = start + size;

        while (pos < end - 8) {
            const atomSize = view.getUint32(pos);
            if (atomSize <= 0 || pos + atomSize > end) break;
            
            const atomType = String.fromCharCode(view.getUint8(pos+4), view.getUint8(pos+5), view.getUint8(pos+6), view.getUint8(pos+7));
            
            const dataAtom = this.findAtom(view, pos + 8, atomSize - 8, ['data']);
            if (dataAtom) {
                const dataFlags = view.getUint32(dataAtom.pos);
                const textStart = dataAtom.pos + 8;
                const textLen = dataAtom.size - 8;
                
                if (dataFlags === 1) { // Text
                    const text = this.decodeText(view, textStart, textLen, 1);
                    if (atomType === '©nam') metadata.title = text;
                    else if (atomType === '©ART' || atomType === 'aART') metadata.artist = metadata.artist || text;
                    else if (atomType === '©alb') metadata.album = text;
                    else if (atomType === '©day') metadata.year = parseInt(text);
                } else if ((dataFlags === 13 || dataFlags === 14) && atomType === 'covr') { // Image
                    const imageData = new Uint8Array(view.buffer, textStart, textLen);
                    const blob = new Blob([imageData], { type: dataFlags === 13 ? 'image/jpeg' : 'image/png' });
                    metadata.image = URL.createObjectURL(blob);
                }
            }
            
            pos += atomSize;
        }
        
        return metadata;
    }

    // ========== FLAC Parser ==========
    async parseFLAC(file) {
        const buffer = await this.readFileChunk(file, 0, 1024 * 1024); // 1MB
        const view = new DataView(buffer);
        
        if (buffer.byteLength < 4 || String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'fLaC') {
            throw new Error('Not a valid FLAC file');
        }
        
        let metadata = { title: null, artist: null, album: null, year: null, image: null };
        let pos = 4;

        while (pos < buffer.byteLength - 4) {
            const header = view.getUint8(pos);
            const isLast = (header & 0x80) !== 0;
            const blockType = header & 0x7F;
            const blockSize = (view.getUint8(pos+1) << 16) | (view.getUint8(pos+2) << 8) | view.getUint8(pos+3);
            
            pos += 4;
            if (pos + blockSize > buffer.byteLength) break;
            
            if (blockType === 4) { // Vorbis Comment
                const vorbis = this.parseVorbisComment(view, pos, blockSize);
                Object.assign(metadata, vorbis);
            } else if (blockType === 6) { // Picture
                metadata.image = this.parseFLACPicture(view, pos, blockSize);
            }
            
            pos += blockSize;
            if (isLast) break;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseVorbisComment(view, start, size) {
        const metadata = { title: null, artist: null, album: null, year: null };
        let pos = start;
        
        const vendorLen = view.getUint32(pos, true);
        pos += 4 + vendorLen;
        
        const commentCount = view.getUint32(pos, true);
        pos += 4;
        
        for (let i = 0; i < commentCount; i++) {
            if (pos + 4 > start + size) break;
            const commentLen = view.getUint32(pos, true);
            pos += 4;
            
            if (pos + commentLen > start + size) break;
            const comment = this.decodeText(view, pos, commentLen, 1);
            pos += commentLen;
            
            const index = comment.indexOf('=');
            if (index > 0) {
                const key = comment.substring(0, index).toUpperCase();
                const value = comment.substring(index + 1);
                
                if (key === 'TITLE') metadata.title = value;
                else if (key === 'ARTIST') metadata.artist = value;
                else if (key === 'ALBUM') metadata.album = value;
                else if (key === 'DATE' || key === 'YEAR') metadata.year = parseInt(value);
            }
        }
        
        return metadata;
    }

    parseFLACPicture(view, start, size) {
        try {
            let pos = start + 4; // Skip type
            const mimeLen = view.getUint32(pos); pos += 4;
            const mimeType = this.decodeText(view, pos, mimeLen, 1); pos += mimeLen;
            const descLen = view.getUint32(pos); pos += 4 + descLen;
            pos += 16; // Skip dimensions
            const imageLen = view.getUint32(pos); pos += 4;
            
            const imageData = new Uint8Array(view.buffer, pos, imageLen);
            const blob = new Blob([imageData], { type: mimeType });
            return URL.createObjectURL(blob);
        } catch (e) { return null; }
    }

    // ========== OGG Vorbis Parser ==========
    async parseOGG(file) {
        const buffer = await this.readFileChunk(file, 0, 1024 * 256); // 256KB
        const view = new DataView(buffer);
        
        if (buffer.byteLength < 4 || String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'OggS') {
            throw new Error('Not a valid OGG file');
        }
        
        let metadata = { title: null, artist: null, album: null, year: null, image: null };
        let pos = 0;

        while (pos < buffer.byteLength - 27) {
            if (String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3)) !== 'OggS') {
                pos++; continue;
            }
            
            const segmentCount = view.getUint8(pos + 26);
            const segments = new Uint8Array(buffer, pos + 27, segmentCount);
            let pageSize = 0;
            for (let s of segments) pageSize += s;
            
            const headerStart = pos + 27 + segmentCount;
            if (headerStart + 7 > buffer.byteLength) break;

            // Check for Vorbis header type 3 (Comment)
            if (view.getUint8(headerStart) === 3 && this.decodeText(view, headerStart + 1, 6, 1) === 'vorbis') {
                metadata = this.parseVorbisComment(view, headerStart + 7, pageSize - 7);
                break;
            }
            pos = headerStart + pageSize;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    // ========== WAV Parser ==========
    async parseWAV(file) {
        const buffer = await this.readFileChunk(file, 0, 1024 * 512); // 512KB
        const view = new DataView(buffer);
        
        if (buffer.byteLength < 12 || String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'RIFF') {
            throw new Error('Not a valid WAV file');
        }
        
        let metadata = { title: null, artist: null, album: null, year: null, image: null };
        let pos = 12;

        while (pos < buffer.byteLength - 8) {
            const chunkId = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3));
            const chunkSize = view.getUint32(pos + 4, true);
            
            if (chunkId === 'LIST') {
                const listType = String.fromCharCode(view.getUint8(pos+8), view.getUint8(pos+9), view.getUint8(pos+10), view.getUint8(pos+11));
                if (listType === 'INFO') {
                    Object.assign(metadata, this.parseWAVInfo(view, pos + 12, chunkSize - 4));
                }
            } else if (chunkId.toLowerCase() === 'id3 ') {
                try {
                    const id3Data = await this.parseMP3(new Blob([new Uint8Array(view.buffer, pos + 8, chunkSize)]));
                    Object.assign(metadata, id3Data);
                } catch (e) {}
            }
            
            pos += 8 + chunkSize + (chunkSize % 2);
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseWAVInfo(view, start, size) {
        const metadata = {};
        let pos = start;
        const end = start + size;

        while (pos < end - 8) {
            const fieldId = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3));
            const fieldSize = view.getUint32(pos + 4, true);
            const text = this.decodeText(view, pos + 8, fieldSize, 0).trim();
            
            if (fieldId === 'INAM') metadata.title = text;
            else if (fieldId === 'IART') metadata.artist = text;
            else if (fieldId === 'IPRD') metadata.album = text;
            else if (fieldId === 'ICRD') metadata.year = parseInt(text);
            
            pos += 8 + fieldSize + (fieldSize % 2);
        }
        return metadata;
    }

    // ========== WMA Parser ==========
    async parseWMA(file) {
        const buffer = await this.readFileChunk(file, 0, 1024 * 256); // 256KB
        const view = new DataView(buffer);
        
        if (buffer.byteLength < 30 || this.readGUID(view, 0) !== '75b22630-668e-11cf-a6d9-00aa0062ce6c') {
            throw new Error('Not a valid WMA file');
        }
        
        let metadata = { title: null, artist: null, album: null, year: null, image: null };
        let pos = 30;

        while (pos < buffer.byteLength - 24) {
            const objGuid = this.readGUID(view, pos);
            const objSize = Number(view.getBigUint64(pos + 16, true));
            if (objSize <= 0) break;
            
            if (objGuid === '75b22633-668e-11cf-a6d9-00aa0062ce6c') { // Content Description
                Object.assign(metadata, this.parseWMAContentDescription(view, pos + 24, objSize - 24));
            } else if (objGuid === 'd2d0a440-e307-11d2-97f0-00a0c95ea850') { // Extended Content
                Object.assign(metadata, this.parseWMAExtendedContent(view, pos + 24, objSize - 24));
            }
            pos += objSize;
        }
        
        return this.normalizeMetadata(metadata, file);
    }

    parseWMAContentDescription(view, start, size) {
        let pos = start;
        const lens = [view.getUint16(pos, true), view.getUint16(pos+2, true), view.getUint16(pos+4, true), view.getUint16(pos+6, true), view.getUint16(pos+8, true)];
        pos += 10;
        
        const title = lens[0] > 0 ? this.decodeUTF16LE(view, pos, lens[0]) : null; pos += lens[0];
        const artist = lens[1] > 0 ? this.decodeUTF16LE(view, pos, lens[1]) : null;
        return { title, artist };
    }

    parseWMAExtendedContent(view, start, size) {
        const metadata = {};
        let pos = start;
        const count = view.getUint16(pos, true); pos += 2;
        
        for (let i = 0; i < count; i++) {
            const nameLen = view.getUint16(pos, true); pos += 2;
            const name = this.decodeUTF16LE(view, pos, nameLen); pos += nameLen;
            const type = view.getUint16(pos, true); pos += 2;
            const valLen = view.getUint16(pos, true); pos += 2;
            
            if (type === 0) { // String
                const val = this.decodeUTF16LE(view, pos, valLen);
                if (name === 'WM/AlbumTitle') metadata.album = val;
                else if (name === 'WM/Year') metadata.year = parseInt(val);
            }
            pos += valLen;
        }
        return metadata;
    }

    // ========== Utilities ==========
    async readFileChunk(file, start, length) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsArrayBuffer(file.slice(start, start + length));
        });
    }

    synchsafe32(view, offset) {
        return (view.getUint8(offset) << 21) | (view.getUint8(offset+1) << 14) | (view.getUint8(offset+2) << 7) | view.getUint8(offset+3);
    }

    /**
     * "Almost Redundant" Robust Text Decoder
     * Handles BOM, encoding detection, Mojibake, and non-printable characters
     */
    /**
     * "Extreme" Robust Text Decoder
     * Eliminates garbage (), boxes, and Mojibake using multi-pass decoding
     * and aggressive visual filtering.
     */
    decodeText(view, start, length, encoding) {
        if (length <= 0) return '';
        
        // Use a slice to avoid view issues with shared buffers
        const bytes = new Uint8Array(view.buffer.slice(start, start + length));
        
        /**
         * The "Redundant Sanitizer"
         * Removes: Nulls, Control Chars, Private Use Areas, and Invalid Glyphs
         */
        const extremeSanitize = (str) => {
            if (!str) return '';
            return str
                .replace(/\0/g, '') // Remove nulls
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove ASCII control chars
                .replace(/[\uFFFD\u0001-\u001F\u007F-\u009F]/g, '') // Remove  and extended control chars
                .replace(/[\uE000-\uF8FF]|\uD83C[\uDFFB-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g, '') // Remove Private Use & certain boxes
                .trim();
        };

        // 1. BOM Detection (Highest Priority)
        if (bytes.length >= 2) {
            if (bytes[0] === 0xFF && bytes[1] === 0xFE) return extremeSanitize(new TextDecoder('utf-16le').decode(bytes.slice(2)));
            if (bytes[0] === 0xFE && bytes[1] === 0xFF) return extremeSanitize(new TextDecoder('utf-16be').decode(bytes.slice(2)));
        }
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            return extremeSanitize(new TextDecoder('utf-8').decode(bytes.slice(3)));
        }

        // 2. Heuristic Encoding Detection (CJK & Common Local Encodings)
        const isLikelyUTF16 = () => {
            if (bytes.length < 4) return false;
            let nullCount = 0;
            for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) nullCount++;
            return nullCount > bytes.length * 0.2; // High null density suggests UTF-16
        };

        const decoders = [];
        if (isLikelyUTF16()) {
            decoders.push('utf-16le', 'utf-16be');
        }

        // Map ID3 encoding hints to decoder priorities
        const hintMap = {
            0: ['iso-8859-1', 'windows-1252', 'gbk', 'shift-jis', 'euc-kr', 'utf-8'], // "ISO" often means local
            1: ['utf-16le', 'utf-16be', 'utf-8'],
            2: ['utf-16le', 'utf-16be', 'utf-8'],
            3: ['utf-8', 'iso-8859-1', 'windows-1252']
        };

        const priorities = hintMap[encoding] || ['utf-8', 'iso-8859-1', 'windows-1252', 'gbk', 'shift-jis', 'euc-kr'];
        decoders.push(...priorities);

        // 3. Multi-Pass Decoding with "Mojibake Repair"
        for (const enc of decoders) {
            try {
                const decoder = new TextDecoder(enc, { fatal: true });
                let result = decoder.decode(bytes);
                
                // Repair Step: If decoded as ISO but looks like UTF-8 Mojibake
                if ((enc === 'iso-8859-1' || enc === 'windows-1252') && /[\xC0-\xDF][\x80-\xBF]/.test(result)) {
                    try {
                        const repair = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                        if (repair.length < result.length) result = repair;
                    } catch(e) {}
                }

                const sanitized = extremeSanitize(result);
                // If the result is substantial and clean, we've found it
                if (sanitized.length > 0 && !sanitized.includes('')) return sanitized;
            } catch (e) { continue; }
        }

        // 4. Ultimate Recovery: Manual character mapping
        let recovery = '';
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b >= 32 && b <= 126) recovery += String.fromCharCode(b);
            else if (b >= 160) recovery += String.fromCharCode(b); // Extended Latin
        }
        return extremeSanitize(recovery);
    }

    decodeUTF16LE(view, start, length) {
        return this.decodeText(view, start, length, 2);
    }

    extractID3Image(view, start, size) {
        try {
            let pos = start + 1; // Skip encoding
            while (pos < start + size && view.getUint8(pos) !== 0) pos++; // Skip MIME
            pos++; // Skip null
            pos++; // Skip type
            while (pos < start + size && view.getUint8(pos) !== 0) pos++; // Skip desc
            pos++; // Skip null
            
            const data = new Uint8Array(view.buffer, pos, start + size - pos);
            return URL.createObjectURL(new Blob([data]));
        } catch (e) { return null; }
    }

    extractID3v22Image(view, start, size) {
        try {
            let pos = start + 1; // Skip encoding
            pos += 3; // Skip format (3 bytes)
            pos++; // Skip type
            while (pos < start + size && view.getUint8(pos) !== 0) pos++; // Skip desc
            pos++; // Skip null
            
            const data = new Uint8Array(view.buffer, pos, start + size - pos);
            return URL.createObjectURL(new Blob([data]));
        } catch (e) { return null; }
    }

    findAtom(view, start, size, path) {
        let pos = start;
        const end = start + size;
        const target = path[0];
        
        while (pos < end - 8) {
            const atomSize = view.getUint32(pos);
            if (atomSize <= 0 || pos + atomSize > end) break;
            const atomType = String.fromCharCode(view.getUint8(pos+4), view.getUint8(pos+5), view.getUint8(pos+6), view.getUint8(pos+7));
            
            if (atomType === target) {
                if (path.length === 1) return { pos: pos + 8, size: atomSize - 8 };
                return this.findAtom(view, pos + 8, atomSize - 8, path.slice(1));
            }
            pos += atomSize;
        }
        return null;
    }

    readGUID(view, offset) {
        const b = [];
        for (let i = 0; i < 16; i++) b.push(view.getUint8(offset + i).toString(16).padStart(2, '0'));
        return `${b[3]}${b[2]}${b[1]}${b[0]}-${b[5]}${b[4]}-${b[7]}${b[6]}-${b[8]}${b[9]}-${b[10]}${b[11]}${b[12]}${b[13]}${b[14]}${b[15]}`;
    }

    normalizeMetadata(metadata, file) {
        // Final "Nuclear" Sanitization Pass
        const nuclearClean = (str) => {
            if (!str) return '';
            return str
                .replace(/[\uFFFD\u0000-\u001F\u007F-\u009F\uFEFF]/g, '') // Remove , Control, BOM
                .replace(/[\uE000-\uF8FF]/g, '') // Remove Private Use
                .trim();
        };

        const title = nuclearClean(metadata.title || file.name.split('.').slice(0, -1).join('.'));
        return {
            title: title || 'Unknown Track',
            artist: nuclearClean(metadata.artist || 'Unknown Artist'),
            album: nuclearClean(metadata.album || 'Unknown Album'),
            year: metadata.year || null,
            image: metadata.image || null,
            genre: nuclearClean(metadata.genre || null),
            track: metadata.track || null,
            hasMetadata: !!(metadata.title || metadata.artist || metadata.album)
        };
    }

    getDefaultMetadata(file) {
        return this.normalizeMetadata({}, file);
    }
}

window.MetadataParser = MetadataParser;
