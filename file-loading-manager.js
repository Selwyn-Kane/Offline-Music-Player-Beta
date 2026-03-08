/* ============================================
   FILE LOADING MANAGER v3.1
   Progressive, mobile-aware file loading.
   ============================================ */

class EnhancedFileLoadingManager {

    constructor(debugLog = console.log, options = {}) {
        this._log = debugLog;

        this.isMobile    = this._detectMobile();
        this.isLowMemory = (navigator.deviceMemory ?? 4) < 4;

        this.config = {
            supportedAudioFormats: options.supportedAudioFormats ?? [
                'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus', 'webm',
            ],
            // Mobile: lower concurrency to avoid saturating the main thread
            maxConcurrent:       this.isMobile ? 2 : (options.maxConcurrent ?? 3),
            retryAttempts:       options.retryAttempts ?? 2,
            retryDelayMs:        options.retryDelay    ?? 1000,
            fuzzyMatchThreshold: options.fuzzyMatchThreshold ?? 0.8,
            chunkSize:           this.isMobile ? 3 : (options.chunkSize ?? 5),
            // Progressive mode: return a minimal playlist immediately, enrich in background
            progressiveMode:     options.progressiveMode ?? this.isMobile,
            useIdleCallback:     options.useIdleCallback ?? true,
        };

        // Dependencies — set by init()
        this.metadataParser      = null;
        this.vttParser           = null;
        this.analysisParser      = null;
        this.customMetadataStore = null;
        this.analyzer            = null;
        this.workerManager       = null;
        this.imageOptimizer      = null;

        this.state = {
            isLoading:      false,
            processedFiles: 0,
            totalFiles:     0,
            errors:         [],
            warnings:       [],
        };

        this.callbacks = {
            onLoadStart:         null,
            onLoadProgress:      null,
            onLoadComplete:      null,
            onLoadError:         null,
            onFileProcessed:     null,
            onChunkComplete:     null,
            onProgressiveUpdate: null,
        };

        this._isProcessingBackground = false;

        this._log(`📁 FileLoadingManager v3.1 (${this.isMobile ? 'mobile' : 'desktop'})`, 'info');
    }

    // ─── Detection ────────────────────────────────────────────────────────────

    _detectMobile() {
        const ua      = navigator.userAgent.toLowerCase();
        const mobile  = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
        const small   = window.innerWidth <= 768;
        const touch   = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        return mobile || (small && touch);
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    init(deps) {
        this.metadataParser      = deps.metadataParser;
        this.vttParser           = deps.vttParser;
        this.analysisParser      = deps.analysisParser;
        this.customMetadataStore = deps.customMetadataStore;
        this.analyzer            = deps.analyzer;
        this.workerManager       = deps.workerManager  ?? window.workerManager;
        this.imageOptimizer      = deps.imageOptimizer ?? window.imageOptimizer;
        this._log('✅ FileLoadingManager initialized', 'success');
    }

    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    // ─── Public loading entry points ──────────────────────────────────────────

    /**
     * Load from a File System Access API directory handle, or fall back to a
     * FileList / plain array (mobile or older browsers).
     */
    async loadFromFolderHandle(handle) {
        // FileList / array fallback (mobile file picker)
        if (handle instanceof FileList || Array.isArray(handle)) {
            return this.loadFiles(Array.from(handle));
        }

        const files = [];
        try {
            for await (const entry of handle.values()) {
                if (entry.kind !== 'file') continue;
                try {
                    files.push(await entry.getFile());
                } catch {
                    this._log(`⚠️ Could not access: ${entry.name}`, 'warning');
                }
            }
        } catch (err) {
            this._log(`❌ Folder scan failed: ${err.message}`, 'error');
            throw err;
        }

        if (files.length === 0) throw new Error('No files found in folder');
        this._log(`📂 Found ${files.length} file(s)`, 'info');
        return this.loadFiles(files);
    }

    async loadFiles(files) {
        if (!files?.length) {
            return { success: false, playlist: [], errors: [] };
        }
        if (this.state.isLoading) {
            this._log('⚠️ Load already in progress', 'warning');
            return { success: false, error: 'Loading already in progress' };
        }

        this.state.isLoading      = true;
        this.state.processedFiles = 0;
        this.state.totalFiles     = files.length;
        this.state.errors         = [];
        this.state.warnings       = [];

        const startTime = Date.now();
        this._notify('onLoadStart', files.length);

        try {
            const categorized = this._categorizeFiles(files);
            this._log(
                `📂 ${categorized.audio.length} audio | ${categorized.vtt.length} VTT | ` +
                `${categorized.analysis.length} analysis`, 'info'
            );

            const fileMap  = this._buildFileMatchMap(categorized);
            const playlist = this.config.progressiveMode
                ? await this._progressiveLoad(categorized, fileMap, startTime)
                : await this._standardLoad(categorized, fileMap);

            const loadTime = Date.now() - startTime;
            this._log(`✅ Loaded ${playlist.length} tracks in ${(loadTime / 1000).toFixed(2)} s`, 'success');
            this._notify('onLoadComplete', playlist);

            return {
                success:  true,
                playlist,
                stats:    this._generateStats(categorized, playlist),
                loadTime,
                errors:   this.state.errors,
                warnings: this.state.warnings,
            };

        } catch (err) {
            this._log(`❌ Fatal loading error: ${err.message}`, 'error');
            this._notify('onLoadError', err);
            return { success: false, playlist: [], error: err.message, errors: this.state.errors };

        } finally {
            this.state.isLoading = false;
        }
    }

    /** Prompt the user to pick files. On Android routes through the native media picker. */
    createFileInput(options = {}) {
        // Native Android path — use the Capacitor file picker plugin
        // which opens the system media browser (Music library, Downloads, etc.)
        if (window.NativeBridge?.isNative()) {
            return this._nativeFilePick(options);
        }

        // Browser path — existing hidden <input type="file"> logic unchanged
        return new Promise((resolve, reject) => {
            const input    = document.createElement('input');
            input.type     = 'file';
            input.accept   = options.accept  ?? 'audio/*,.vtt,.txt';
            input.multiple = options.multiple !== false;
            input.style.display = 'none';
            document.body.appendChild(input);

            const cleanup = () => {
                try { document.body.removeChild(input); } catch (_) {}
            };

            input.addEventListener('change', async (e) => {
                cleanup();
                const files = Array.from(e.target.files ?? []);
                if (!files.length) { reject(new AbortError('No files selected')); return; }
                resolve(await this.loadFiles(files));
            });

            // 'cancel' is Chrome 113+ only — use a focus-based fallback for other browsers
            input.addEventListener('cancel', () => { cleanup(); reject(new AbortError('Cancelled')); });
            window.addEventListener('focus', function onFocus() {
                window.removeEventListener('focus', onFocus);
                // Give the change event time to fire before treating focus as a cancel
                setTimeout(() => { if (input.parentNode) { cleanup(); reject(new AbortError('Cancelled')); } }, 500);
            }, { once: true });

            setTimeout(() => input.click(), 100);
        });
    }

    /**
     * Native Android file pick via the Capacitor FilePicker plugin.
     * Converts each Capacitor file descriptor into a standard Web File object
     * so the rest of the processing pipeline (metadata parser, chunking, etc.)
     * is completely unchanged.
     */
    async _nativeFilePick(options = {}) {
        // NativeBridge.pickAudioFiles() throws AbortError if the user cancels
        const descriptors = await window.NativeBridge.pickAudioFiles();

        if (!descriptors || descriptors.length === 0) {
            const err  = new Error('No files selected');
            err.name   = 'AbortError';
            throw err;
        }

        this._log(`📱 Native picker returned ${descriptors.length} file(s)`, 'info');

        // Convert Capacitor file descriptors → Web File objects.
        // Capacitor gives us { name, mimeType, path/uri, size }.
        // We read the binary data via the Filesystem plugin and wrap in a File.
        const fileObjects = await Promise.all(descriptors.map(async (desc) => {
            try {
                const blob = await window.NativeBridge.readFileAsBlob(
                    desc.path ?? desc.uri,
                    desc.mimeType ?? 'audio/mpeg'
                );
                return new File([blob], desc.name, { type: desc.mimeType ?? 'audio/mpeg' });
            } catch (err) {
                this._log(`⚠️ Could not read native file "${desc.name}": ${err.message}`, 'warning');
                return null;
            }
        }));

        const valid = fileObjects.filter(Boolean);
        if (valid.length === 0) {
            throw new Error('No files could be read from device storage');
        }

        return this.loadFiles(valid);
    }

    // ─── Progressive loading ──────────────────────────────────────────────────

    async _progressiveLoad(categorized, fileMap, startTime) {
        // Phase 1: build minimal stubs instantly — UI can render the playlist right away
        const playlist = categorized.audio.map(audioFile => {
            const baseName = this._getBaseName(audioFile.name);
            const matches  = this._findMatchingFiles(baseName, fileMap);
            return {
                audioURL:       URL.createObjectURL(audioFile),
                fileName:       audioFile.name,
                fileSize:       audioFile.size,
                file:           audioFile,
                vtt:            matches.vtt      ?? null,
                metadata:       { title: baseName, artist: 'Loading…', album: 'Unknown Album',
                                  image: null, hasMetadata: false, isLoading: true },
                duration:       0,
                analysis:       null,
                hasDeepAnalysis:false,
                loadedAt:       Date.now(),
                _needsProcessing: true,
                _matches:       matches,
            };
        });

        this._log(`⚡ Phase 1: ${playlist.length} stubs in ${Date.now() - startTime} ms`, 'success');
        this._notify('onProgressiveUpdate', { phase: 1, playlist, message: 'Playlist ready — loading details…' });

        // Phase 2: enrich in background (fire-and-forget, errors logged internally)
        this._scheduleBackgroundProcessing(playlist).catch(err => {
            this._log(`⚠️ Background processing error: ${err.message}`, 'warning');
        });

        return playlist;
    }

    async _scheduleBackgroundProcessing(playlist) {
        // Priority: first three tracks (likely about to play)
        for (let i = 0; i < Math.min(3, playlist.length); i++) {
            await this._enrichTrackMetadata(playlist[i], i, playlist.length);
            this._notify('onProgressiveUpdate', { phase: 2, priority: true, trackIndex: i, playlist });
        }

        // Rest of the playlist — yield to the browser between each track
        await this._processBackgroundQueue(playlist.slice(3), 3, playlist);
    }

    _processBackgroundQueue(tracks, offset, fullPlaylist) {
        return new Promise((resolve) => {
            if (!tracks.length) { resolve(); return; }

            let i = 0;

            const processNext = async () => {
                if (i >= tracks.length) {
                    this._isProcessingBackground = false;
                    this._notify('onProgressiveUpdate', { phase: 3, complete: true, playlist: fullPlaylist });
                    resolve();
                    return;
                }

                try {
                    await this._enrichTrackMetadata(tracks[i], offset + i, fullPlaylist.length);
                    this._notify('onProgressiveUpdate', {
                        phase:      2,
                        priority:   false,
                        trackIndex: offset + i,
                        playlist:   fullPlaylist,
                        progress:   Math.round(((i + 1) / tracks.length) * 100),
                    });
                } catch (err) {
                    this._log(`Background metadata error: ${err.message}`, 'warning');
                }

                i++;

                if (this.config.useIdleCallback && 'requestIdleCallback' in window) {
                    requestIdleCallback(() => processNext(), { timeout: 2000 });
                } else {
                    setTimeout(processNext, 50);
                }
            };

            this._isProcessingBackground = true;
            processNext();
        });
    }

    async _enrichTrackMetadata(track, index, total) {
        if (!track._needsProcessing) return;

        try {
            track.metadata = await this._extractMetadata(track.file);
            track.duration = await this._getAudioDuration(track.file);

            if (track._matches?.analysis) {
                track.analysis       = await this._parseAnalysisFile(track._matches.analysis, track.fileName);
                track.hasDeepAnalysis = !!track.analysis;
            } else if (this.analyzer) {
                track.analysis = this.analyzer.analysisCache.get(track.fileName) ?? null;
            }
        } catch (err) {
            this._log(`Metadata extraction failed: ${track.fileName} — ${err.message}`, 'warning');
            track.metadata.artist    = 'Unknown Artist';
            track.metadata.isLoading = false;
        }

        delete track._needsProcessing;
        delete track._matches;

        this._updateProgress(index + 1, total, track.fileName);
    }

    // ─── Standard (non-progressive) loading ───────────────────────────────────

    async _standardLoad(categorized, fileMap) {
        const playlist = [];
        const chunks   = this._chunkArray(categorized.audio, this.config.chunkSize);

        for (let ci = 0; ci < chunks.length; ci++) {
            const results = await this._processConcurrent(
                chunks[ci],
                (audioFile, localIdx) =>
                    this._processAudioFileWithRetry(
                        audioFile, fileMap,
                        ci * this.config.chunkSize + localIdx,
                        categorized.audio.length
                    ),
                this.config.maxConcurrent
            );

            for (const r of results) {
                if (r.success) playlist.push(r.data);
            }

            this._notify('onChunkComplete', {
                chunk: ci + 1, total: chunks.length,
                processed: Math.min((ci + 1) * this.config.chunkSize, categorized.audio.length),
                playlist,
            });
        }

        return this._postProcessPlaylist(playlist);
    }

    async _processAudioFileWithRetry(audioFile, fileMap, index, total) {
        let lastError;
        for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
            try {
                if (attempt > 0) await this._delay(this.config.retryDelayMs * attempt);
                const data = await this._processAudioFile(audioFile, fileMap, index, total);
                return { success: true, data };
            } catch (err) {
                lastError = err;
            }
        }
        this.state.errors.push({ file: audioFile.name, error: lastError.message });
        return { success: false, error: lastError };
    }

    async _processAudioFile(audioFile, fileMap, index, total) {
        const baseName = this._getBaseName(audioFile.name);
        const matches  = this._findMatchingFiles(baseName, fileMap);

        const [metadata, duration, analysis] = await Promise.all([
            this._extractMetadata(audioFile),
            this._getAudioDuration(audioFile),
            matches.analysis ? this._parseAnalysisFile(matches.analysis, audioFile.name) : Promise.resolve(null),
        ]);

        const entry = {
            audioURL:       URL.createObjectURL(audioFile),
            fileName:       audioFile.name,
            fileSize:       audioFile.size,
            file:           audioFile,
            vtt:            matches.vtt ?? null,
            metadata,
            duration,
            analysis:       analysis ?? (this.analyzer?.analysisCache.get(audioFile.name) ?? null),
            hasDeepAnalysis:!!analysis,
            loadedAt:       Date.now(),
        };

        this._updateProgress(index + 1, total, audioFile.name);
        this._notify('onFileProcessed', entry);
        return entry;
    }

    // ─── File categorisation ──────────────────────────────────────────────────

    _categorizeFiles(files) {
        const out = { audio: [], vtt: [], analysis: [], unknown: [] };
        for (const file of files) {
            const cat = this._categorizeFile(file);
            out[cat].push(file);
            if (cat === 'unknown') this.state.warnings.push({ file: file.name, message: 'Unknown file type' });
        }
        return out;
    }

    _categorizeFile(file) {
        const ext = file.name.toLowerCase().split('.').pop();
        if (file.type.startsWith('audio/') || this.config.supportedAudioFormats.includes(ext)) return 'audio';
        if (ext === 'vtt' || file.type === 'text/vtt')   return 'vtt';
        if (ext === 'txt' || file.type === 'text/plain') return 'analysis';
        return 'unknown';
    }

    // ─── File matching ────────────────────────────────────────────────────────

    _buildFileMatchMap(categorized) {
        const map = { byBaseName: new Map(), vttFiles: categorized.vtt, analysisFiles: categorized.analysis };
        for (const file of [...categorized.vtt, ...categorized.analysis]) {
            const base = this._getBaseName(file.name);
            if (!map.byBaseName.has(base)) map.byBaseName.set(base, []);
            map.byBaseName.get(base).push(file);
        }
        return map;
    }

    _getBaseName(filename) {
        return filename.split('.').slice(0, -1).join('.').toLowerCase().trim();
    }

    _findMatchingFiles(audioBase, fileMap) {
        const matches   = { vtt: null, analysis: null };
        const exact     = fileMap.byBaseName.get(audioBase) ?? [];

        for (const file of exact) {
            const ext = file.name.toLowerCase().split('.').pop();
            if (ext === 'vtt' && !matches.vtt)      matches.vtt      = file;
            if (ext === 'txt' && !matches.analysis)  matches.analysis = file;
        }

        if (!matches.vtt)      matches.vtt      = this._fuzzyMatch(audioBase, fileMap.vttFiles);
        if (!matches.analysis) matches.analysis = this._fuzzyMatch(audioBase, fileMap.analysisFiles);

        return matches;
    }

    _fuzzyMatch(baseName, files) {
        let bestFile  = null;
        let bestScore = 0;
        for (const file of files) {
            const score = this._similarity(baseName, this._getBaseName(file.name));
            if (score > bestScore && score >= this.config.fuzzyMatchThreshold) {
                bestScore = score;
                bestFile  = file;
            }
        }
        return bestFile;
    }

    _similarity(a, b) {
        const long  = a.length >= b.length ? a : b;
        const short = a.length >= b.length ? b : a;
        if (!long.length) return 1;
        return (long.length - this._editDistance(long, short)) / long.length;
    }

    _editDistance(s, t) {
        // Two-row DP — O(n) space instead of O(n²)
        let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
        for (let i = 1; i <= s.length; i++) {
            const curr = [i];
            for (let j = 1; j <= t.length; j++) {
                curr[j] = s[i - 1] === t[j - 1]
                    ? prev[j - 1]
                    : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
            }
            prev = curr;
        }
        return prev[t.length];
    }

    // ─── Concurrency helper ───────────────────────────────────────────────────

    async _processConcurrent(items, processor, concurrency) {
        const results  = new Array(items.length);
        const executing = new Set();

        for (let i = 0; i < items.length; i++) {
            const idx = i;
            const p   = processor(items[idx], idx).then(r => {
                executing.delete(p);
                results[idx] = r;
            });
            executing.add(p);
            if (executing.size >= concurrency) await Promise.race(executing);
        }

        await Promise.all(executing);
        return results;
    }

    // ─── Metadata & duration ──────────────────────────────────────────────────

    async _extractMetadata(audioFile) {
        if (!this.metadataParser) return this._defaultMetadata(audioFile);

        let meta = await this.metadataParser.extractMetadata(audioFile);

        if (this.customMetadataStore) {
            const custom = this.customMetadataStore.get(audioFile.name, audioFile.size);
            if (custom) meta = { ...meta, ...custom, hasMetadata: true, isCustom: true };
        }

        if (meta.image && this.imageOptimizer) {
            try {
                meta.optimizedImage = await this.imageOptimizer.optimizeImage(meta.image, 'thumbnail');
            } catch {
                // Non-fatal — proceed without optimized image
            }
        }

        return meta;
    }

    _defaultMetadata(audioFile) {
        return {
            title:       audioFile.name.split('.').slice(0, -1).join('.') || audioFile.name,
            artist:     'Unknown Artist',
            album:      'Unknown Album',
            image:       null,
            hasMetadata: false,
        };
    }

    _getAudioDuration(audioFile) {
        return new Promise(resolve => {
            const url   = URL.createObjectURL(audioFile);
            const audio = new Audio();
            audio.preload = 'metadata';

            const cleanup = (duration = 0) => {
                clearTimeout(timer);
                audio.src = '';           // release the resource
                URL.revokeObjectURL(url);
                resolve(duration);
            };

            const timer = setTimeout(() => cleanup(0), 4000);

            audio.addEventListener('loadedmetadata', () => cleanup(audio.duration || 0), { once: true });
            audio.addEventListener('error',          () => cleanup(0),                   { once: true });

            audio.src = url;
            audio.load();
        });
    }

    async _parseAnalysisFile(file, audioFileName) {
        if (!this.analysisParser) return null;
        try {
            const text   = await file.text();
            const parsed = this.analysisParser.parseAnalysisText(text);
            return this.analysisParser.isValidAnalysis(parsed) ? parsed : null;
        } catch (err) {
            this.state.errors.push({ file: file.name, error: `Analysis parse failed: ${err.message}` });
            return null;
        }
    }

    // ─── Post-processing ──────────────────────────────────────────────────────

    _postProcessPlaylist(playlist) {
        playlist.sort((a, b) => a.fileName.localeCompare(b.fileName));

        const seen = new Set();
        return playlist.filter(track => {
            const key = `${track.fileName}_${track.fileSize}`;
            if (seen.has(key)) { URL.revokeObjectURL(track.audioURL); return false; }
            seen.add(key);
            return true;
        });
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    cleanupPlaylist(playlist) {
        let count = 0;
        for (const track of playlist) {
            if (track.audioURL) { URL.revokeObjectURL(track.audioURL); count++; }
            if (track.metadata?.image?.startsWith('blob:')) {
                URL.revokeObjectURL(track.metadata.image); count++;
            }
        }
        this._log(`🗑️ Revoked ${count} blob URL(s)`, 'info');
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
        return chunks;
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    _updateProgress(current, total, filename) {
        this.state.processedFiles = current;
        this._notify('onLoadProgress', {
            current, total, filename,
            percentage: Math.round((current / total) * 100),
        });
    }

    _notify(name, data) {
        if (!this.callbacks[name]) return;
        try { this.callbacks[name](data); }
        catch (err) { this._log(`Callback error (${name}): ${err.message}`, 'error'); }
    }

    _generateStats(categorized, playlist) {
        return {
            totalFiles:     this.state.totalFiles,
            audioFiles:     categorized.audio.length,
            vttFiles:       categorized.vtt.length,
            analysisFiles:  categorized.analysis.length,
            unknownFiles:   categorized.unknown.length,
            playlistSize:   playlist.length,
            errors:         this.state.errors.length,
            warnings:       this.state.warnings.length,
            withLyrics:     playlist.filter(t => t.vtt).length,
            withAnalysis:   playlist.filter(t => t.analysis).length,
            withDeepAnalysis: playlist.filter(t => t.hasDeepAnalysis).length,
            totalDuration:  playlist.reduce((s, t) => s + (t.duration ?? 0), 0),
            isMobile:       this.isMobile,
            progressiveMode:this.config.progressiveMode,
        };
    }

    // State accessors
    getState()    { return { ...this.state }; }
    getErrors()   { return [...this.state.errors]; }
    getWarnings() { return [...this.state.warnings]; }
    isLoading()   { return this.state.isLoading; }

    async forceRefreshTrack(trackIndex, playlist) {
        const track = playlist[trackIndex];
        if (!track) return;
        track._needsProcessing = true;
        await this._enrichTrackMetadata(track, trackIndex, playlist.length);
        this._notify('onProgressiveUpdate', { phase: 2, priority: true, trackIndex, playlist });
    }
}

// Helper used by createFileInput reject paths
class AbortError extends Error {
    constructor(msg) { super(msg); this.name = 'AbortError'; }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedFileLoadingManager;
}
