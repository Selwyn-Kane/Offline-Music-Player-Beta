/* ============================================
   Mobile-Optimized File Loading Manager v3.0
   
   Key Optimizations:
   - Progressive loading (show tracks immediately, load details later)
   - IndexedDB persistent cache with compression
   - Web Worker integration for heavy tasks
   - Mobile-specific concurrency and memory limits
   - Lazy metadata extraction on-demand
   - Background processing with requestIdleCallback
   - Optimized image handling for mobile
   - Smart prefetching and prioritization
   - Memory-efficient streaming
   ============================================ */

class EnhancedFileLoadingManager {
    constructor(debugLog, options = {}) {
        this.debugLog = debugLog;
        
        // Detect mobile for optimizations
        this.isMobile = this._detectMobile();
        this.isLowMemory = this._detectLowMemory();
        
        // Dependencies
        this.metadataParser = null;
        this.vttParser = null;
        this.analysisParser = null;
        this.customMetadataStore = null;
        this.analyzer = null;
        this.workerManager = null;
        this.imageOptimizer = null;
        
        // Mobile-optimized configuration
        this.config = {
            supportedAudioFormats: options.supportedAudioFormats || [
                'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus', 'webm'
            ],
            // Mobile: reduce concurrency, desktop: allow more
            maxConcurrent: this.isMobile ? 2 : (options.maxConcurrent || 3),
            retryAttempts: options.retryAttempts || 2,
            retryDelay: options.retryDelay || 1000,
            fuzzyMatchThreshold: options.fuzzyMatchThreshold || 0.8,
            // Mobile: smaller chunks
            chunkSize: this.isMobile ? 3 : (options.chunkSize || 5),
            enableCaching: false, // Force disabled as per user request
            maxCacheAge: options.maxCacheAge || 7 * 24 * 60 * 60 * 1000, // 7 days
            // Progressive loading
            progressiveMode: this.isMobile ? true : (options.progressiveMode || false),
            // Background processing
            useIdleCallback: this.isMobile ? true : (options.useIdleCallback !== false),
            // Mobile memory limits
            maxMemoryMB: this.isMobile ? 50 : 200,
            // Lazy metadata extraction
            lazyMetadata: this.isMobile ? true : (options.lazyMetadata || false)
        };
        
        // State management
        this.state = {
            isLoading: false,
            isPaused: false,
            currentOperation: null,
            processedFiles: 0,
            totalFiles: 0,
            errors: [],
            warnings: [],
            memoryUsage: 0
        };
        
        // Callbacks
        this.callbacks = {
            onLoadStart: null,
            onLoadProgress: null,
            onLoadComplete: null,
            onLoadError: null,
            onFileProcessed: null,
            onChunkComplete: null,
            onProgressiveUpdate: null
        };
        
        // In-memory cache (small, for current session)
        this.memoryCache = new Map();
        
        // IndexedDB cache (persistent, larger)
        this.dbCache = null;
        this.initializeDB();
        
        // Background task queue
        this.backgroundQueue = [];
        this.isProcessingBackground = false;
        
        // Prefetch queue
        this.prefetchQueue = [];
        
        this.debugLog(`📱 Mobile-optimized loader: ${this.isMobile ? 'MOBILE' : 'DESKTOP'} mode`, 'info');
    }
    
    // ========== MOBILE DETECTION ==========
    
    _detectMobile() {
        const ua = navigator.userAgent.toLowerCase();
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
        const isSmallScreen = window.innerWidth <= 768;
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        return isMobile || (isSmallScreen && isTouchDevice);
    }
    
    _detectLowMemory() {
        // Check if device has limited memory
        if (navigator.deviceMemory) {
            return navigator.deviceMemory < 4; // Less than 4GB
        }
        return this.isMobile; // Assume mobile is low memory
    }
    
    // ========== INDEXEDDB CACHE ==========
    
    async initializeDB() {
        try {
            this.dbCache = await this._openDB('MusicPlayerCache', 1);
            
            // Clean old entries on startup
            await this._cleanExpiredCache();
            
            this.debugLog('💾 IndexedDB cache initialized', 'success');
        } catch (err) {
            this.debugLog(`⚠️ IndexedDB unavailable: ${err.message}`, 'warning');
            this.dbCache = null;
        }
    }
    
    _openDB(name, version) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(name, version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('fileCache')) {
                    const store = db.createObjectStore('fileCache', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('fileName', 'fileName', { unique: false });
                }
            };
        });
    }
    
    async _getCachedData(cacheKey) {
        // Caching disabled as per user request to ensure fresh metadata on every load
        return null;
    }
    
    async _setCachedData(cacheKey, data, metadata = {}) {
        // Caching disabled as per user request
        return;
    }
    
    async _cleanExpiredCache() {
        if (!this.dbCache) return;
        
        try {
            const tx = this.dbCache.transaction('fileCache', 'readwrite');
            const store = tx.objectStore('fileCache');
            const index = store.index('timestamp');
            
            const cutoffTime = Date.now() - this.config.maxCacheAge;
            const range = IDBKeyRange.upperBound(cutoffTime);
            
            const request = index.openCursor(range);
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                }
            };
            
            await new Promise((resolve) => {
                tx.oncomplete = () => {
                    if (deletedCount > 0) {
                        this.debugLog(`🗑️ Cleaned ${deletedCount} expired cache entries`, 'info');
                    }
                    resolve();
                };
            });
        } catch (err) {
            this.debugLog(`Cache cleanup error: ${err.message}`, 'error');
        }
    }
    
    // ========== INITIALIZATION ==========
    
    init(dependencies) {
        this.metadataParser = dependencies.metadataParser;
        this.vttParser = dependencies.vttParser;
        this.analysisParser = dependencies.analysisParser;
        this.customMetadataStore = dependencies.customMetadataStore;
        this.analyzer = dependencies.analyzer;
        this.workerManager = dependencies.workerManager || window.workerManager;
        this.imageOptimizer = dependencies.imageOptimizer || window.imageOptimizer;
        
        this.debugLog('✅ Mobile-Optimized File Loading Manager v3.0 initialized', 'success');
    }
    
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }
    
    // ========== MAIN LOADING METHODS ==========
    
    async loadFiles(files) {
        if (!files || files.length === 0) {
            this.debugLog('No files provided', 'warning');
            return { success: false, playlist: [], errors: [] };
        }
        
        if (this.state.isLoading) {
            this.debugLog('⚠️ Loading already in progress', 'warning');
            return { success: false, error: 'Loading already in progress' };
        }
        
        this.state.isLoading = true;
        this.state.processedFiles = 0;
        this.state.totalFiles = files.length;
        this.state.errors = [];
        this.state.warnings = [];
        
        const startTime = Date.now();
        this.debugLog(`=== ${this.isMobile ? '📱 MOBILE' : '💻 DESKTOP'} Loading: ${files.length} files ===`);
        
        try {
            this._notifyCallback('onLoadStart', files.length);
            
            // Step 1: Quick categorization (no await)
            const categorized = this._categorizeFiles(files);
            
            this.debugLog(
                `📂 Categorized: ${categorized.audio.length} audio, ` +
                `${categorized.vtt.length} VTT, ${categorized.analysis.length} analysis`
            );
            
            // Step 2: Build file map (fast, no I/O)
            const fileMap = this._buildFileMatchMap(categorized);
            
            // Step 3: PROGRESSIVE MODE - Create minimal entries immediately
            let playlist;
            if (this.config.progressiveMode) {
                playlist = await this._progressiveLoad(categorized, fileMap, startTime);
            } else {
                // Standard mode - load everything upfront
                playlist = await this._standardLoad(categorized, fileMap);
            }
            
            const loadTime = Date.now() - startTime;
            this.debugLog(
                `✅ Loading complete in ${(loadTime / 1000).toFixed(2)}s: ` +
                `${playlist.length} tracks | ${this.state.errors.length} errors`,
                'success'
            );
            
            this._notifyCallback('onLoadComplete', playlist);
            
            const stats = this._generateStats(categorized, playlist);
            
            return {
                success: true,
                playlist: playlist,
                stats: stats,
                loadTime: loadTime,
                errors: this.state.errors,
                warnings: this.state.warnings
            };
            
        } catch (error) {
            this.debugLog(`❌ Fatal loading error: ${error.message}`, 'error');
            this._notifyCallback('onLoadError', error);
            
            return {
                success: false,
                playlist: [],
                error: error.message,
                errors: this.state.errors
            };
            
        } finally {
            this.state.isLoading = false;
        }
    }
    
    // ========== PROGRESSIVE LOADING (MOBILE OPTIMIZATION) ==========
    
    async _progressiveLoad(categorized, fileMap, startTime) {
        this.debugLog('⚡ PROGRESSIVE MODE: Creating minimal entries', 'info');
        
        // Phase 1: Create minimal playlist entries IMMEDIATELY (< 100ms)
        const minimalPlaylist = categorized.audio.map((audioFile, index) => {
            const baseName = this._getBaseName(audioFile.name);
            const matches = this._findMatchingFiles(baseName, fileMap);
            
            return {
                audioURL: URL.createObjectURL(audioFile),
                fileName: audioFile.name,
                fileSize: audioFile.size,
                vtt: matches.vtt || null,
                metadata: {
                    title: baseName,
                    artist: 'Loading...',
                    album: 'Unknown Album',
                    image: null,
                    hasMetadata: false,
                    isLoading: true
                },
                duration: 0,
                analysis: null,
                hasDeepAnalysis: false,
                loadedAt: Date.now(),
                _needsProcessing: true,
                _audioFile: audioFile,
                file: audioFile, // Store File object for buffer manager
                _matches: matches
            };
        });
        
        const quickLoadTime = Date.now() - startTime;
        this.debugLog(`⚡ Phase 1 complete in ${quickLoadTime}ms - Playlist ready!`, 'success');
        
        // Notify UI immediately with minimal playlist
        this._notifyCallback('onProgressiveUpdate', {
            phase: 1,
            playlist: minimalPlaylist,
            message: 'Playlist ready - Loading details...'
        });
        
        // Phase 2: Load metadata in background (prioritized)
        this._scheduleBackgroundProcessing(minimalPlaylist, categorized);
        
        return minimalPlaylist;
    }
    
    async _scheduleBackgroundProcessing(playlist, categorized) {
        // Priority 1: Current track + next 2 tracks (load immediately)
        const priorityTracks = playlist.slice(0, 3);
        
        // Priority 2: Rest of tracks (background)
        const backgroundTracks = playlist.slice(3);
        
        // Process priority tracks first
        for (let i = 0; i < priorityTracks.length; i++) {
            const track = priorityTracks[i];
            await this._enrichTrackMetadata(track, i, playlist.length);
            
            this._notifyCallback('onProgressiveUpdate', {
                phase: 2,
                priority: true,
                trackIndex: i,
                playlist: playlist
            });
        }
        
        // Process remaining tracks in background
        this._processBackgroundQueue(backgroundTracks, 3, playlist);
    }
    
    _processBackgroundQueue(tracks, offset, fullPlaylist) {
        if (this.isProcessingBackground) return;
        
        this.isProcessingBackground = true;
        let currentIndex = 0;
        
        const processNext = async () => {
            if (currentIndex >= tracks.length) {
                this.isProcessingBackground = false;
                this.debugLog('✅ Background processing complete', 'success');
                
                this._notifyCallback('onProgressiveUpdate', {
                    phase: 3,
                    complete: true,
                    playlist: fullPlaylist
                });
                return;
            }
            
            const track = tracks[currentIndex];
            const globalIndex = offset + currentIndex;
            
            try {
                await this._enrichTrackMetadata(track, globalIndex, fullPlaylist.length);
                
                this._notifyCallback('onProgressiveUpdate', {
                    phase: 2,
                    priority: false,
                    trackIndex: globalIndex,
                    playlist: fullPlaylist,
                    progress: Math.round(((currentIndex + 1) / tracks.length) * 100)
                });
            } catch (err) {
                this.debugLog(`Background processing error: ${err.message}`, 'error');
            }
            
            currentIndex++;
            
            // Use requestIdleCallback for non-blocking processing
            if (this.config.useIdleCallback && 'requestIdleCallback' in window) {
                requestIdleCallback(() => processNext(), { timeout: 2000 });
            } else {
                setTimeout(processNext, 50);
            }
        };
        
        processNext();
    }
    
    async _enrichTrackMetadata(track, index, total) {
        if (!track._needsProcessing) return;
        
        const cacheKey = this._getCacheKey(track._audioFile);
        
        // Check cache
        const cached = await this._getCachedData(cacheKey);
        if (cached) {
            Object.assign(track, {
                metadata: cached.metadata,
                duration: cached.duration,
                analysis: cached.analysis,
                hasDeepAnalysis: cached.hasDeepAnalysis
            });
            delete track._needsProcessing;
            delete track._audioFile;
            delete track._matches;
            return;
        }
        
        // Extract metadata
        try {
            const metadata = await this._extractMetadata(track._audioFile);
            track.metadata = metadata;
            
            // Get duration
            const duration = await this._getAudioDuration(track._audioFile);
            track.duration = duration;
            
            // Parse analysis if available
            if (track._matches.analysis) {
                track.analysis = await this._parseAnalysisFile(
                    track._matches.analysis,
                    track.fileName
                );
                track.hasDeepAnalysis = !!track.analysis;
            } else if (this.analyzer) {
                track.analysis = this.analyzer.analysisCache.get(track.fileName);
            }
            
            // Cache the enriched data
            await this._setCachedData(cacheKey, {
                metadata: track.metadata,
                duration: track.duration,
                analysis: track.analysis,
                hasDeepAnalysis: track.hasDeepAnalysis
            }, {
                fileName: track.fileName,
                size: track.fileSize
            });
            
            delete track._needsProcessing;
            delete track._audioFile;
            delete track._matches;
            
        } catch (err) {
            this.debugLog(`Metadata extraction failed: ${track.fileName}`, 'error');
            track.metadata.artist = 'Unknown Artist';
            track.metadata.isLoading = false;
        }
        
        this._updateProgress(index + 1, total, track.fileName, !!cached);
    }
    
    // ========== STANDARD LOADING ==========
    
    async _standardLoad(categorized, fileMap) {
        const playlist = [];
        const chunks = this._chunkArray(categorized.audio, this.config.chunkSize);
        
        this.debugLog(`⚡ Processing ${categorized.audio.length} files in ${chunks.length} chunks`);
        
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            
            const chunkResults = await this._processConcurrent(
                chunk,
                async (audioFile, index) => {
                    const globalIndex = chunkIndex * this.config.chunkSize + index;
                    return await this._processAudioFileWithRetry(
                        audioFile,
                        fileMap,
                        globalIndex,
                        categorized.audio.length
                    );
                },
                this.config.maxConcurrent
            );
            
            for (const result of chunkResults) {
                if (result.success) {
                    playlist.push(result.data);
                }
            }
            
            this._notifyCallback('onChunkComplete', {
                chunk: chunkIndex + 1,
                total: chunks.length,
                processed: (chunkIndex + 1) * this.config.chunkSize,
                playlist: playlist
            });
        }
        
        return this._postProcessPlaylist(playlist);
    }
    
    // ========== FILE CATEGORIZATION ==========
    
    _categorizeFiles(files) {
        const categorized = {
            audio: [],
            vtt: [],
            analysis: [],
            unknown: []
        };
        
        for (const file of files) {
            const category = this._categorizeFile(file);
            categorized[category].push(file);
            
            if (category === 'unknown') {
                this.state.warnings.push({
                    file: file.name,
                    message: 'Unknown file type'
                });
            }
        }
        
        return categorized;
    }
    
    _categorizeFile(file) {
        const nameLower = file.name.toLowerCase();
        const extension = nameLower.split('.').pop();
        
        if (file.type.startsWith('audio/') || 
            this.config.supportedAudioFormats.includes(extension)) {
            return 'audio';
        }
        
        if (extension === 'vtt' || file.type === 'text/vtt') {
            return 'vtt';
        }
        
        if (extension === 'txt' || file.type === 'text/plain') {
            return 'analysis';
        }
        
        return 'unknown';
    }
    
    // ========== SMART FILE MATCHING ==========
    
    _buildFileMatchMap(categorized) {
        const map = {
            byBaseName: new Map(),
            vttFiles: categorized.vtt,
            analysisFiles: categorized.analysis
        };
        
        const allFiles = [...categorized.vtt, ...categorized.analysis];
        
        for (const file of allFiles) {
            const baseName = this._getBaseName(file.name);
            
            if (!map.byBaseName.has(baseName)) {
                map.byBaseName.set(baseName, []);
            }
            map.byBaseName.get(baseName).push(file);
        }
        
        return map;
    }
    
    _getBaseName(filename) {
        return filename
            .split('.').slice(0, -1).join('.')
            .toLowerCase()
            .trim();
    }
    
    _findMatchingFiles(audioBaseName, fileMap) {
        const matches = {
            vtt: null,
            analysis: null
        };
        
        // Try exact match first
        const exactMatches = fileMap.byBaseName.get(audioBaseName) || [];
        
        for (const file of exactMatches) {
            const ext = file.name.toLowerCase().split('.').pop();
            if (ext === 'vtt' && !matches.vtt) {
                matches.vtt = file;
            } else if (ext === 'txt' && !matches.analysis) {
                matches.analysis = file;
            }
        }
        
        // Fuzzy matching only if necessary
        if (!matches.vtt) {
            matches.vtt = this._fuzzyMatch(audioBaseName, fileMap.vttFiles);
        }
        
        if (!matches.analysis) {
            matches.analysis = this._fuzzyMatch(audioBaseName, fileMap.analysisFiles);
        }
        
        return matches;
    }
    
    _fuzzyMatch(baseName, files) {
        let bestMatch = null;
        let bestScore = 0;
        
        for (const file of files) {
            const fileBaseName = this._getBaseName(file.name);
            const score = this._calculateSimilarity(baseName, fileBaseName);
            
            if (score > bestScore && score >= this.config.fuzzyMatchThreshold) {
                bestScore = score;
                bestMatch = file;
            }
        }
        
        return bestMatch;
    }
    
    _calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this._levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }
    
    _levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    // ========== PARALLEL PROCESSING ==========
    
    async _processConcurrent(items, processor, concurrency) {
        const results = [];
        const executing = [];
        
        for (let i = 0; i < items.length; i++) {
            const promise = processor(items[i], i).then(result => {
                executing.splice(executing.indexOf(promise), 1);
                return result;
            });
            
            results.push(promise);
            executing.push(promise);
            
            if (executing.length >= concurrency) {
                await Promise.race(executing);
            }
        }
        
        return await Promise.all(results);
    }
    
    _chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
    
    // ========== FILE PROCESSING ==========
    
    async _processAudioFileWithRetry(audioFile, fileMap, index, total) {
        let lastError = null;
        
        for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
            try {
                if (attempt > 0) {
                    await this._delay(this.config.retryDelay * attempt);
                }
                
                const result = await this._processAudioFile(audioFile, fileMap, index, total);
                return { success: true, data: result };
                
            } catch (error) {
                lastError = error;
            }
        }
        
        this.state.errors.push({
            file: audioFile.name,
            error: lastError.message
        });
        
        return { success: false, error: lastError };
    }
    
    async _processAudioFile(audioFile, fileMap, index, total) {
        const baseName = this._getBaseName(audioFile.name);
        const cacheKey = this._getCacheKey(audioFile);
        
        // Check cache
        const cached = await this._getCachedData(cacheKey);
        if (cached && !this.config.forceRefresh) {
            this._updateProgress(index + 1, total, audioFile.name, true);
            
            return {
                ...cached,
                audioURL: URL.createObjectURL(audioFile),
                loadedAt: Date.now()
            };
        }
        
        // Find matching files
        const matches = this._findMatchingFiles(baseName, fileMap);
        
        // Parse analysis
        let parsedAnalysis = null;
        if (matches.analysis) {
            parsedAnalysis = await this._parseAnalysisFile(matches.analysis, audioFile.name);
        }
        
        // Extract metadata
        const metadata = await this._extractMetadata(audioFile);
        
        // Get duration
        const duration = await this._getAudioDuration(audioFile);
        
        // Create blob URL
        const audioURL = URL.createObjectURL(audioFile);
        
        // Check cached analysis
        const finalAnalysis = parsedAnalysis || 
            (this.analyzer ? this.analyzer.analysisCache.get(audioFile.name) : null);
        
        // Build entry
        const entry = {
            audioURL: audioURL,
            fileName: audioFile.name,
            fileSize: audioFile.size,
            file: audioFile, // Store File object for buffer manager
            vtt: matches.vtt || null,
            metadata: metadata,
            duration: duration,
            analysis: finalAnalysis,
            hasDeepAnalysis: !!parsedAnalysis,
            loadedAt: Date.now()
        };
        
        // Cache for future
        await this._setCachedData(cacheKey, {
            fileName: entry.fileName,
            fileSize: entry.fileSize,
            vtt: entry.vtt,
            metadata: entry.metadata,
            duration: entry.duration,
            analysis: entry.analysis,
            hasDeepAnalysis: entry.hasDeepAnalysis
        }, {
            fileName: audioFile.name,
            size: audioFile.size
        });
        
        this._updateProgress(index + 1, total, audioFile.name, false);
        this._notifyCallback('onFileProcessed', entry);
        
        return entry;
    }
    
    _getCacheKey(file) {
        return `${file.name}_${file.size}_${file.lastModified || 0}`;
    }
    
    async _parseAnalysisFile(analysisFile, audioFileName) {
        if (!this.analysisParser) return null;
        
        try {
            const analysisText = await analysisFile.text();
            const parsed = this.analysisParser.parseAnalysisText(analysisText);
            
            if (this.analysisParser.isValidAnalysis(parsed)) {
                return parsed;
            }
        } catch (err) {
            this.state.errors.push({
                file: analysisFile.name,
                error: `Analysis parse failed: ${err.message}`
            });
        }
        
        return null;
    }
    
    async _extractMetadata(audioFile) {
        if (!this.metadataParser) {
            return this._createDefaultMetadata(audioFile);
        }
        
        let metadata = await this.metadataParser.extractMetadata(audioFile);
        
        // Check custom metadata
        if (this.customMetadataStore) {
            const customMeta = this.customMetadataStore.get(audioFile.name, audioFile.size);
            if (customMeta) {
                metadata = {
                    ...metadata,
                    ...customMeta,
                    hasMetadata: true,
                    isCustom: true
                };
            }
        }
        
        // Optimize image if available
        if (metadata.image && this.imageOptimizer) {
            try {
                metadata.optimizedImage = await this.imageOptimizer.optimizeImage(
                    metadata.image,
                    'thumbnail'
                );
            } catch (err) {
                this.debugLog(`Image optimization failed for ${audioFile.name}`, 'warning');
            }
        }
        
        return metadata;
    }
    
    _createDefaultMetadata(audioFile) {
        return {
            title: audioFile.name.split('.')[0],
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            image: null,
            hasMetadata: false
        };
    }
    
    async _getAudioDuration(audioFile) {
        const tempAudio = new Audio();
        const blobURL = URL.createObjectURL(audioFile);
        tempAudio.src = blobURL;
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(0);
                URL.revokeObjectURL(blobURL);
            }, 3000); // Shorter timeout for mobile
            
            tempAudio.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                const duration = tempAudio.duration;
                URL.revokeObjectURL(blobURL);
                resolve(duration || 0);
            }, { once: true });
            
            tempAudio.addEventListener('error', () => {
                clearTimeout(timeout);
                URL.revokeObjectURL(blobURL);
                resolve(0);
            }, { once: true });
        });
    }
    
    // ========== POST-PROCESSING ==========
    
    async _postProcessPlaylist(playlist) {
        // Sort by file name
        playlist.sort((a, b) => a.fileName.localeCompare(b.fileName));
        
        // Remove duplicates
        const seen = new Set();
        const deduplicated = playlist.filter(track => {
            const key = `${track.fileName}_${track.fileSize}`;
            if (seen.has(key)) {
                URL.revokeObjectURL(track.audioURL);
                return false;
            }
            seen.add(key);
            return true;
        });
        
        return deduplicated;
    }
    
    // ========== FOLDER LOADING ==========
    
    async loadFromFolderHandle(folderHandle) {
        this.debugLog('📂 Scanning folder...', 'info');
        
        const files = [];
        
        try {
            // Check if folderHandle is actually a FileList (fallback for mobile)
            if (folderHandle instanceof FileList || Array.isArray(folderHandle)) {
                this.debugLog('📱 Using file list fallback for mobile folder loading', 'info');
                return await this.loadFiles(Array.from(folderHandle));
            }

            // Standard File System Access API
            for await (const entry of folderHandle.values()) {
                if (entry.kind === 'file') {
                    try {
                        const file = await entry.getFile();
                        files.push(file);
                    } catch (err) {
                        this.debugLog(`⚠️ Couldn't access: ${entry.name}`, 'warning');
                    }
                }
            }
            
            if (files.length === 0) {
                throw new Error('No files found in folder');
            }
            
            this.debugLog(`📁 Found ${files.length} files`, 'success');
            
            return await this.loadFiles(files);
            
        } catch (error) {
            this.debugLog(`Error scanning folder: ${error.message}`, 'error');
            
            // If it failed and we're on mobile, try to trigger the fallback
            if (this.isMobile) {
                this.debugLog('🔄 Attempting mobile fallback...', 'warning');
                return this.triggerMobileFolderFallback();
            }
            throw error;
        }
    }

    triggerMobileFolderFallback() {
        return new Promise((resolve) => {
            let input = document.getElementById('mobile-folder-fallback');
            if (!input) {
                input = document.createElement('input');
                input.id = 'mobile-folder-fallback';
                input.type = 'file';
                input.webkitdirectory = true;
                input.directory = true;
                input.style.display = 'none';
                document.body.appendChild(input);
            }

            input.onchange = async (e) => {
                if (e.target.files.length > 0) {
                    const result = await this.loadFiles(Array.from(e.target.files));
                    resolve(result);
                } else {
                    resolve({ success: false, error: 'No files selected' });
                }
            };

            input.click();
        });
    }
    
    // ========== FILE INPUT HELPERS ==========
    
    createFileInput(options = {}) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = options.accept || 'audio/*,.vtt,.txt';
        input.multiple = options.multiple !== false;
        
        input.style.display = 'none';
        document.body.appendChild(input);
        
        return new Promise((resolve, reject) => {
            input.onchange = async (e) => {
                document.body.removeChild(input);
                
                const files = Array.from(e.target.files);
                if (files.length === 0) {
                    reject(new Error('No files selected'));
                    return;
                }
                
                const result = await this.loadFiles(files);
                resolve(result);
            };
            
            input.oncancel = () => {
                document.body.removeChild(input);
                reject(new Error('File selection cancelled'));
            };
            
            setTimeout(() => input.click(), 100);
        });
    }
    
    // ========== CLEANUP ==========
    
    cleanupPlaylist(playlist) {
        let revokedCount = 0;
        
        for (const track of playlist) {
            if (track.audioURL) {
                URL.revokeObjectURL(track.audioURL);
                revokedCount++;
            }
            
            if (track.metadata?.image?.startsWith('blob:')) {
                URL.revokeObjectURL(track.metadata.image);
                revokedCount++;
            }
        }
        
        this.debugLog(`🗑️ Cleaned up ${revokedCount} blob URLs`, 'info');
    }
    
    async clearCache() {
        // Clear memory cache
        const memorySize = this.memoryCache.size;
        this.memoryCache.clear();
        
        // Clear IndexedDB cache
        if (this.dbCache) {
            try {
                const tx = this.dbCache.transaction('fileCache', 'readwrite');
                const store = tx.objectStore('fileCache');
                await new Promise((resolve, reject) => {
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                
                this.debugLog(`🗑️ Cleared all cache (${memorySize} memory entries)`, 'info');
            } catch (err) {
                this.debugLog(`Cache clear error: ${err.message}`, 'error');
            }
        }
    }
    
    // ========== UTILITIES ==========
    
    _updateProgress(current, total, filename, fromCache) {
        this.state.processedFiles = current;
        
        this._notifyCallback('onLoadProgress', {
            current: current,
            total: total,
            filename: filename,
            percentage: Math.round((current / total) * 100),
            fromCache: fromCache
        });
    }
    
    _notifyCallback(name, data) {
        if (this.callbacks[name]) {
            try {
                this.callbacks[name](data);
            } catch (err) {
                this.debugLog(`Callback error (${name}): ${err.message}`, 'error');
            }
        }
    }
    
    _generateStats(categorized, playlist) {
        return {
            totalFiles: this.state.totalFiles,
            audioFiles: categorized.audio.length,
            vttFiles: categorized.vtt.length,
            analysisFiles: categorized.analysis.length,
            unknownFiles: categorized.unknown?.length || 0,
            playlistSize: playlist.length,
            errors: this.state.errors.length,
            warnings: this.state.warnings.length,
            withLyrics: playlist.filter(t => t.vtt).length,
            withAnalysis: playlist.filter(t => t.analysis).length,
            withDeepAnalysis: playlist.filter(t => t.hasDeepAnalysis).length,
            totalDuration: playlist.reduce((sum, t) => sum + (t.duration || 0), 0),
            cacheHits: this.memoryCache.size,
            isMobile: this.isMobile,
            progressiveMode: this.config.progressiveMode
        };
    }
    
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // ========== STATE MANAGEMENT ==========
    
    getState() {
        return { ...this.state };
    }
    
    getErrors() {
        return [...this.state.errors];
    }
    
    getWarnings() {
        return [...this.state.warnings];
    }
    
    isLoading() {
        return this.state.isLoading;
    }
    
    // ========== PUBLIC API FOR PROGRESSIVE UPDATES ==========
    
    async forceRefreshTrack(trackIndex, playlist) {
        if (!playlist[trackIndex] || !playlist[trackIndex]._audioFile) {
            return;
        }
        
        await this._enrichTrackMetadata(playlist[trackIndex], trackIndex, playlist.length);
        
        this._notifyCallback('onProgressiveUpdate', {
            phase: 2,
            priority: true,
            trackIndex: trackIndex,
            playlist: playlist
        });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedFileLoadingManager;
}