/* ============================================
   Ultimate Local Music Player - Refactored
   ============================================ */

/**
 * Main Music Player Application
 * Coordinates all subsystems and manages application state
 */
class MusicPlayerApp {
    constructor() {
        this.state = {
            playlist: [],
            currentTrackIndex: -1,
            isShuffled: false,
            loopMode: 'off',
            debugMode: false,
            isSeekingProg: false,
            compactMode: 'full',
            folderHandle: null,
            backgroundAnalysisRunning: false
        };

        this.config = {
            MAX_CACHE_SIZE: APP_CONFIG?.MAX_CACHE_SIZE || 100,
            PROGRESS_UPDATE_INTERVAL_MS: 200,
            SEEK_DEBOUNCE_DELAY_MS: 100,
            PROGRESS_EDGE_TOLERANCE: 0.02,
            ANALYSIS_BATCH_SIZE: 3,
            ANALYSIS_BATCH_DELAY_MS: 500
        };

        // Core managers (initialized in init())
        this.managers = {};
        this.elements = {};
        
        // Caches
        this.colorCache = new Map();
        window.colorCache = this.colorCache;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            this.initializeElements();
            await this.initializeManagers();
            this.initializeAudioPipeline();
            this.setupEventListeners();
            await this.restoreState();
            this.debugLog('✅ Music player initialized successfully', 'success');
        } catch (error) {
            this.debugLog(`❌ Initialization error: ${error.message}`, 'error');
            console.error(error);
        }
    }

    /**
     * Cache DOM element references
     */
    initializeElements() {
        this.elements = {
            player: document.getElementById('audio-player'),
            playlistStatus: document.getElementById('playlist-status'),
            playlistItems: document.getElementById('playlist-items'),
            
            // Controls
            loadButton: document.getElementById('load-button'),
            prevButton: document.getElementById('prev-button'),
            nextButton: document.getElementById('next-button'),
            shuffleButton: document.getElementById('shuffle-button'),
            loopButton: document.getElementById('loop-button'),
            clearButton: document.getElementById('clear-playlist'),
            
            // Display
            coverArtContainer: document.getElementById('cover-art-container'),
            coverArt: document.getElementById('cover-art'),
            coverPlaceholder: document.getElementById('cover-placeholder'),
            trackTitle: document.getElementById('track-title'),
            trackArtist: document.getElementById('track-artist'),
            trackAlbum: document.getElementById('track-album'),
            metadataContainer: document.getElementById('metadata-container'),
            lyricsDisplay: document.getElementById('lyrics-display'),
            
            // Progress
            progressContainer: document.getElementById('custom-progress-container'),
            progressBar: document.getElementById('progress-bar'),
            currentTimeDisplay: document.getElementById('current-time'),
            durationDisplay: document.getElementById('duration'),
            
            // Visualizer
            canvas: document.getElementById('visualizer'),
            
            // Equalizer
            eqBassSlider: document.getElementById('eq-bass'),
            eqMidSlider: document.getElementById('eq-mid'),
            eqTrebleSlider: document.getElementById('eq-treble'),
            bassValue: document.getElementById('bass-value'),
            midValue: document.getElementById('mid-value'),
            trebleValue: document.getElementById('treble-value'),
            eqResetBtn: document.getElementById('eq-reset'),
            
            // Debug
            debugToggle: document.getElementById('debug-toggle'),
            debugPanel: document.getElementById('debug-panel'),
            
            // Other
            dropZone: document.getElementById('drop-zone'),
            exportLyricsButton: document.getElementById('export-lyrics-button'),
            pipToggle: document.getElementById('pip-toggle')
        };

        // Get canvas context
        if (this.elements.canvas) {
            this.elements.canvasCtx = this.elements.canvas.getContext('2d');
        }
    }

    /**
     * Initialize all manager instances
     */
    async initializeManagers() {
        const debugLog = this.debugLog.bind(this);

        // Core managers
        this.managers.worker = createMusicPlayerWorkerManager?.(debugLog);
        window.workerManager = this.managers.worker;

        this.managers.ui = new UIManager(debugLog);
        window.uiManager = this.managers.ui;

        this.managers.performance = new PerformanceManager(debugLog);
        this.managers.imageOptimizer = new ImageOptimizer(debugLog);
        this.managers.audioBuffer = new AudioBufferManager(debugLog);
        
        // Parsers
        this.managers.metadata = new MetadataParser(debugLog);
        this.managers.vtt = new VTTParser(debugLog);
        this.managers.errorRecovery = new ErrorRecovery(debugLog);
        this.managers.analysisParser = new AnalysisTextParser(debugLog);
        
        // Editors and analyzers
        this.managers.metadataEditor = new MetadataEditor(debugLog);
        this.managers.analyzer = new MusicAnalyzer(debugLog);
        
        // Storage
        this.managers.customMetadata = new CustomMetadataStore();
        this.managers.folderPersistence = new FolderPersistence();
        
        // File loading
        this.managers.fileLoading = new EnhancedFileLoadingManager(debugLog);
        window.fileLoadingManager = this.managers.fileLoading;

        // Display storage stats
        const stats = await this.managers.folderPersistence.getStats();
        if (stats) {
            this.debugLog(`💾 Storage: ${stats.percentUsed}% used | ${stats.historyCount} folders`, 'info');
            if (stats.hasSavedFolder) {
                this.debugLog(`📁 Saved: "${stats.folderName}" (${stats.trackCount} tracks)`, 'success');
            }
        }

        this.debugLog('✅ All managers initialized', 'success');
    }

    /**
     * Initialize audio pipeline and related components
     */
    initializeAudioPipeline() {
        this.managers.audioPipeline = new AudioPipeline(this.debugLog.bind(this));
        window.audioPipeline = this.managers.audioPipeline;

        // Volume control
        this.managers.volume = new VolumeControl(this.elements.player, this.debugLog.bind(this));
        window.volumeControlInitialized = true;

        // Visualizer
        if (typeof VisualizerManager !== 'undefined') {
            this.managers.visualizer = new VisualizerManager();
        }

        // Background audio
        if (window.backgroundAudioHandler) {
            this.initializeBackgroundAudio();
        }

        this.debugLog('✅ Audio pipeline initialized', 'success');
    }

    /**
     * Initialize background audio handling
     */
    async initializeBackgroundAudio() {
        try {
            const success = await backgroundAudioHandler.init({
                player: this.elements.player,
                playlist: () => this.state.playlist,
                getCurrentTrackIndex: () => this.state.currentTrackIndex,
                onMediaAction: {
                    previous: () => this.playPrevious(),
                    next: () => this.playNext()
                }
            });

            if (success) {
                this.debugLog('✅ Background audio activated', 'success');
            } else {
                this.debugLog('⚠️ Background audio initialized with warnings', 'warning');
            }
        } catch (error) {
            this.debugLog(`⚠️ Background audio error: ${error.message}`, 'warning');
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Player events
        this.elements.player.addEventListener('ended', () => this.handleTrackEnded());
        this.elements.player.addEventListener('timeupdate', () => this.updateProgress());
        this.elements.player.addEventListener('loadedmetadata', () => this.handleMetadataLoaded());
        this.elements.player.addEventListener('error', (e) => this.handlePlayerError(e));

        // Control buttons
        this.elements.loadButton?.addEventListener('click', () => this.loadMusicFolder());
        this.elements.prevButton?.addEventListener('click', () => this.playPrevious());
        this.elements.nextButton?.addEventListener('click', () => this.playNext());
        this.elements.shuffleButton?.addEventListener('click', () => this.toggleShuffle());
        this.elements.loopButton?.addEventListener('click', () => this.cycleLoopMode());
        this.elements.clearButton?.addEventListener('click', () => this.clearPlaylist());

        // Progress bar
        if (this.elements.progressContainer) {
            this.elements.progressContainer.addEventListener('click', (e) => this.handleProgressClick(e));
        }

        // Equalizer
        this.setupEqualizerListeners();

        // Debug toggle
        this.elements.debugToggle?.addEventListener('change', (e) => {
            this.state.debugMode = e.target.checked;
            this.elements.debugPanel?.classList.toggle('visible', this.state.debugMode);
        });

        // Drag and drop
        this.setupDragAndDrop();

        this.debugLog('✅ Event listeners registered', 'success');
    }

    /**
     * Setup equalizer event listeners
     */
    setupEqualizerListeners() {
        const sliders = [
            { slider: this.elements.eqBassSlider, display: this.elements.bassValue, type: 'bass' },
            { slider: this.elements.eqMidSlider, display: this.elements.midValue, type: 'mid' },
            { slider: this.elements.eqTrebleSlider, display: this.elements.trebleValue, type: 'treble' }
        ];

        sliders.forEach(({ slider, display, type }) => {
            if (!slider) return;
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (display) display.textContent = `${value > 0 ? '+' : ''}${value}`;
                this.updateEqualizer(type, value);
            });
        });

        this.elements.eqResetBtn?.addEventListener('click', () => this.resetEqualizer());
    }

    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        if (!this.elements.dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.elements.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.elements.dropZone.addEventListener(eventName, () => {
                this.elements.dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.elements.dropZone.addEventListener(eventName, () => {
                this.elements.dropZone.classList.remove('drag-over');
            });
        });

        this.elements.dropZone.addEventListener('drop', (e) => this.handleFileDrop(e));
    }

    /**
     * Restore saved state from storage
     */
    async restoreState() {
        try {
            // Restore settings
            const savedCrossfade = localStorage.getItem('crossfadeEnabled') === 'true';
            const savedAutoEQ = localStorage.getItem('autoEQEnabled') === 'true';
            const savedAutoLyrics = localStorage.getItem('autoLyricsEnabled') === 'true';

            if (savedCrossfade && this.managers.crossfade) {
                this.managers.crossfade.setEnabled(true);
            }
            if (savedAutoEQ && this.managers.autoEQ) {
                this.managers.autoEQ.setEnabled(true);
            }

            // Restore playlist if available
            const savedPlaylist = localStorage.getItem('musicPlayerPlaylist');
            if (savedPlaylist) {
                try {
                    const data = JSON.parse(savedPlaylist);
                    if (data.playlist && Array.isArray(data.playlist)) {
                        this.state.playlist = data.playlist;
                        this.state.currentTrackIndex = data.currentTrackIndex || -1;
                        this.renderPlaylist();
                    }
                } catch (e) {
                    this.debugLog('Failed to restore playlist', 'warning');
                }
            }

            this.debugLog('✅ State restored', 'success');
        } catch (error) {
            this.debugLog(`⚠️ State restoration error: ${error.message}`, 'warning');
        }
    }

    /**
     * Load music folder
     */
    async loadMusicFolder() {
        try {
            const dirHandle = await window.showDirectoryPicker();
            this.state.folderHandle = dirHandle;

            const tracks = await this.scanDirectory(dirHandle);
            
            if (tracks.length === 0) {
                this.managers.ui?.showToast('No audio files found', 'warning');
                return;
            }

            this.state.playlist = tracks;
            this.state.currentTrackIndex = -1;
            
            await this.managers.folderPersistence?.saveFolder(dirHandle, tracks);
            this.renderPlaylist();
            this.savePlaylistToStorage();
            
            this.managers.ui?.showToast(`Loaded ${tracks.length} tracks`, 'success');
            this.debugLog(`✅ Loaded ${tracks.length} tracks`, 'success');

            // Start background analysis
            this.startBackgroundAnalysis();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(`❌ Error loading folder: ${error.message}`, 'error');
                this.managers.ui?.showToast('Error loading folder', 'error');
            }
        }
    }

    /**
     * Scan directory for audio files
     */
    async scanDirectory(dirHandle) {
        const tracks = [];
        const supportedFormats = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const fileName = entry.name.toLowerCase();
                const isAudio = supportedFormats.some(ext => fileName.endsWith(ext));

                if (isAudio) {
                    const file = await entry.getFile();
                    const audioURL = URL.createObjectURL(file);
                    
                    tracks.push({
                        fileName: entry.name,
                        audioURL,
                        duration: 0,
                        metadata: null,
                        file
                    });
                }
            }
        }

        return tracks.sort((a, b) => a.fileName.localeCompare(b.fileName));
    }

    /**
     * Play track at index
     */
    async playTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        try {
            this.state.currentTrackIndex = index;
            const track = this.state.playlist[index];

            this.elements.player.src = track.audioURL;
            await this.elements.player.play();

            this.updateNowPlaying(track);
            this.renderPlaylist();
            this.savePlaylistToStorage();

            // Update background audio
            if (window.backgroundAudioHandler) {
                backgroundAudioHandler.updateNowPlaying(track.metadata || {
                    title: track.fileName,
                    artist: 'Unknown Artist',
                    album: 'Unknown Album'
                });
            }

            this.debugLog(`▶️ Playing: ${track.fileName}`, 'info');
        } catch (error) {
            this.debugLog(`❌ Playback error: ${error.message}`, 'error');
            this.managers.ui?.showToast('Playback error', 'error');
        }
    }

    /**
     * Play next track
     */
    playNext() {
        if (this.state.playlist.length === 0) return;

        let nextIndex;
        if (this.state.isShuffled) {
            nextIndex = Math.floor(Math.random() * this.state.playlist.length);
        } else {
            nextIndex = (this.state.currentTrackIndex + 1) % this.state.playlist.length;
        }

        this.playTrack(nextIndex);
    }

    /**
     * Play previous track
     */
    playPrevious() {
        if (this.state.playlist.length === 0) return;

        const prevIndex = this.state.currentTrackIndex > 0
            ? this.state.currentTrackIndex - 1
            : this.state.playlist.length - 1;

        this.playTrack(prevIndex);
    }

    /**
     * Handle track ended
     */
    handleTrackEnded() {
        switch (this.state.loopMode) {
            case 'one':
                this.elements.player.currentTime = 0;
                this.elements.player.play();
                break;
            case 'all':
                this.playNext();
                break;
            default:
                if (this.state.currentTrackIndex < this.state.playlist.length - 1) {
                    this.playNext();
                }
        }
    }

    /**
     * Toggle shuffle
     */
    toggleShuffle() {
        this.state.isShuffled = !this.state.isShuffled;
        this.elements.shuffleButton?.classList.toggle('active', this.state.isShuffled);
        
        const status = this.state.isShuffled ? 'on' : 'off';
        this.managers.ui?.showToast(`Shuffle ${status}`, 'info');
        this.debugLog(`🔀 Shuffle ${status}`, 'info');
    }

    /**
     * Cycle loop mode
     */
    cycleLoopMode() {
        const modes = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(this.state.loopMode);
        this.state.loopMode = modes[(currentIndex + 1) % modes.length];

        const icons = { off: '↻', all: '🔁', one: '🔂' };
        if (this.elements.loopButton) {
            this.elements.loopButton.textContent = icons[this.state.loopMode];
            this.elements.loopButton.classList.toggle('active', this.state.loopMode !== 'off');
        }

        this.managers.ui?.showToast(`Loop: ${this.state.loopMode}`, 'info');
    }

    /**
     * Clear playlist
     */
    clearPlaylist() {
        if (confirm('Clear entire playlist?')) {
            this.state.playlist.forEach(track => URL.revokeObjectURL(track.audioURL));
            this.state.playlist = [];
            this.state.currentTrackIndex = -1;
            
            this.elements.player.pause();
            this.elements.player.src = '';
            
            this.renderPlaylist();
            this.savePlaylistToStorage();
            
            this.managers.ui?.showToast('Playlist cleared', 'info');
        }
    }

    /**
     * Update progress display
     */
    updateProgress() {
        if (this.state.isSeekingProg || !this.elements.player.duration) return;

        const current = this.elements.player.currentTime;
        const duration = this.elements.player.duration;
        const percent = (current / duration) * 100;

        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${percent}%`;
        }
        if (this.elements.currentTimeDisplay) {
            this.elements.currentTimeDisplay.textContent = this.formatTime(current);
        }
        if (this.elements.durationDisplay && !this.elements.durationDisplay.textContent) {
            this.elements.durationDisplay.textContent = this.formatTime(duration);
        }
    }

    /**
     * Handle progress bar click
     */
    handleProgressClick(e) {
        if (!this.elements.player.duration) return;

        const rect = this.elements.progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const seekTime = percent * this.elements.player.duration;

        this.elements.player.currentTime = seekTime;
    }

    /**
     * Update now playing display
     */
    updateNowPlaying(track) {
        const metadata = track.metadata || {};
        
        if (this.elements.trackTitle) {
            this.elements.trackTitle.textContent = metadata.title || track.fileName;
        }
        if (this.elements.trackArtist) {
            this.elements.trackArtist.textContent = metadata.artist || 'Unknown Artist';
        }
        if (this.elements.trackAlbum) {
            this.elements.trackAlbum.textContent = metadata.album || 'Unknown Album';
        }

        // Update cover art
        if (metadata.coverArt) {
            this.elements.coverArt.src = metadata.coverArt;
            this.elements.coverArt.classList.remove('hidden');
            this.elements.coverPlaceholder?.classList.add('hidden');
        } else {
            this.elements.coverArt?.classList.add('hidden');
            this.elements.coverPlaceholder?.classList.remove('hidden');
        }
    }

    /**
     * Render playlist
     */
    renderPlaylist() {
        if (!this.elements.playlistItems) return;

        this.elements.playlistItems.innerHTML = '';

        this.state.playlist.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            if (index === this.state.currentTrackIndex) {
                item.classList.add('active');
            }

            const title = track.metadata?.title || track.fileName;
            const artist = track.metadata?.artist || 'Unknown Artist';

            item.innerHTML = `
                <span class="track-number">${index + 1}</span>
                <div class="track-info">
                    <div class="track-title">${this.escapeHtml(title)}</div>
                    <div class="track-artist">${this.escapeHtml(artist)}</div>
                </div>
            `;

            item.addEventListener('click', () => this.playTrack(index));
            this.elements.playlistItems.appendChild(item);
        });

        // Update status
        if (this.elements.playlistStatus) {
            this.elements.playlistStatus.textContent = 
                `${this.state.playlist.length} track${this.state.playlist.length !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Update equalizer
     */
    updateEqualizer(type, value) {
        if (!this.managers.audioPipeline?.isInitialized) return;

        const filters = this.managers.audioPipeline.filters;
        if (!filters) return;

        switch (type) {
            case 'bass':
                if (filters.bass) filters.bass.gain.value = value;
                break;
            case 'mid':
                if (filters.mid) filters.mid.gain.value = value;
                break;
            case 'treble':
                if (filters.treble) filters.treble.gain.value = value;
                break;
        }
    }

    /**
     * Reset equalizer
     */
    resetEqualizer() {
        const sliders = [
            { slider: this.elements.eqBassSlider, display: this.elements.bassValue },
            { slider: this.elements.eqMidSlider, display: this.elements.midValue },
            { slider: this.elements.eqTrebleSlider, display: this.elements.trebleValue }
        ];

        sliders.forEach(({ slider, display }) => {
            if (slider) {
                slider.value = 0;
                if (display) display.textContent = '0';
            }
        });

        if (this.managers.audioPipeline?.filters) {
            const { bass, mid, treble } = this.managers.audioPipeline.filters;
            if (bass) bass.gain.value = 0;
            if (mid) mid.gain.value = 0;
            if (treble) treble.gain.value = 0;
        }

        this.managers.ui?.showToast('Equalizer reset', 'info');
    }

    /**
     * Handle file drop
     */
    async handleFileDrop(e) {
        const items = Array.from(e.dataTransfer.items);
        const tracks = [];

        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && this.isAudioFile(file)) {
                    const audioURL = URL.createObjectURL(file);
                    tracks.push({
                        fileName: file.name,
                        audioURL,
                        duration: 0,
                        metadata: null,
                        file
                    });
                }
            }
        }

        if (tracks.length > 0) {
            this.state.playlist.push(...tracks);
            this.renderPlaylist();
            this.savePlaylistToStorage();
            this.managers.ui?.showToast(`Added ${tracks.length} track(s)`, 'success');
        }
    }

    /**
     * Start background analysis
     */
    async startBackgroundAnalysis() {
        if (this.state.backgroundAnalysisRunning || this.state.playlist.length === 0) return;

        this.state.backgroundAnalysisRunning = true;
        this.debugLog('🔍 Starting background analysis...', 'info');

        const needsAnalysis = this.state.playlist
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => !track.hasDeepAnalysis && !track.analysis);

        if (needsAnalysis.length === 0) {
            this.state.backgroundAnalysisRunning = false;
            return;
        }

        const batchSize = this.config.ANALYSIS_BATCH_SIZE;
        let analyzedCount = 0;

        for (let i = 0; i < needsAnalysis.length; i += batchSize) {
            const batch = needsAnalysis.slice(i, i + batchSize);
            
            const promises = batch.map(async ({ track, index }) => {
                try {
                    const response = await fetch(track.audioURL);
                    const blob = await response.blob();
                    const file = new File([blob], track.fileName, { type: 'audio/mpeg' });
                    
                    const analysis = await this.managers.analyzer.analyzeTrack(file, track.fileName);
                    
                    this.state.playlist[index].analysis = analysis;
                    analyzedCount++;
                    
                    return { success: true, index };
                } catch (err) {
                    this.debugLog(`Analysis failed: ${track.fileName}`, 'error');
                    return { success: false, index };
                }
            });

            await Promise.all(promises);
            this.renderPlaylist();
            
            await new Promise(resolve => setTimeout(resolve, this.config.ANALYSIS_BATCH_DELAY_MS));
        }

        if (analyzedCount > 0) {
            this.managers.analyzer?.saveAnalysesToStorage();
            this.debugLog(`✅ Analyzed ${analyzedCount} tracks`, 'success');
        }

        this.state.backgroundAnalysisRunning = false;
    }

    /**
     * Save playlist to storage
     */
    savePlaylistToStorage() {
        try {
            const data = {
                playlist: this.state.playlist.map(track => ({
                    fileName: track.fileName,
                    duration: track.duration,
                    metadata: track.metadata
                })),
                currentTrackIndex: this.state.currentTrackIndex
            };
            localStorage.setItem('musicPlayerPlaylist', JSON.stringify(data));
        } catch (error) {
            this.debugLog('Failed to save playlist', 'warning');
        }
    }

    /**
     * Handle metadata loaded
     */
    handleMetadataLoaded() {
        if (this.elements.durationDisplay) {
            this.elements.durationDisplay.textContent = 
                this.formatTime(this.elements.player.duration);
        }
    }

    /**
     * Handle player error
     */
    handlePlayerError(e) {
        this.debugLog(`Player error: ${e.target.error?.message || 'Unknown'}`, 'error');
        this.managers.ui?.showToast('Playback error', 'error');
    }

    /**
     * Utility: Check if file is audio
     */
    isAudioFile(file) {
        const audioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
        return audioTypes.some(type => file.type.includes(type)) || 
               /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name);
    }

    /**
     * Utility: Format time
     */
    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Utility: Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Debug logging
     */
    debugLog(message, type = 'info') {
        if (!this.state.debugMode && type !== 'error') return;

        const prefix = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type] || 'ℹ️';

        console.log(`${prefix} ${message}`);

        // Add to debug panel if available
        if (this.elements.debugPanel && this.state.debugMode) {
            const entry = document.createElement('div');
            entry.className = `debug-entry debug-${type}`;
            entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
            this.elements.debugPanel.appendChild(entry);
            
            // Limit entries
            while (this.elements.debugPanel.children.length > 100) {
                this.elements.debugPanel.removeChild(this.elements.debugPanel.firstChild);
            }
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.musicPlayerApp = new MusicPlayerApp();
    window.musicPlayerApp.init();
});

// Expose for debugging
window.getAudioDataForVisualizer = () => {
    const app = window.musicPlayerApp;
    if (!app) return null;

    const pipeline = app.managers.audioPipeline;
    if (pipeline?.isInitialized) {
        pipeline.getFrequencyData();
        return {
            dataArray: pipeline.dataArray,
            bufferLength: pipeline.bufferLength,
            analyser: pipeline.analyser
        };
    }

    return null;
};
