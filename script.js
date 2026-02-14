/* ============================================
   Ultimate Local Music Player - FULLY INTEGRATED v1.0
   All 26 issues fixed through 7 core integrations
   ============================================ */

// ✅ CRITICAL: Audio Chain Reconnection Helper
window.reconnectAudioChainWithVolumeControl = function() {
    try {
        if (!window.sharedAudioSource || 
            !window.sharedBassFilter || 
            !window.sharedMidFilter || 
            !window.sharedTrebleFilter || 
            !window.sharedAnalyser || 
            !window.audioContext) {
            console.log('⏳ Audio pipeline not ready for reconnection');
            return false;
        }
        
        if (!window.volumeGainNode || 
            !window.volumeCompressor || 
            !window.volumeMakeupGain) {
            console.log('⏳ Volume control nodes not ready');
            return false;
        }
        
        console.log('🔗 Reconnecting audio chain with volume control...');
        
        try {
            window.sharedAudioSource.disconnect();
            window.sharedBassFilter.disconnect();
            window.sharedMidFilter.disconnect();
            window.sharedTrebleFilter.disconnect();
            window.volumeGainNode.disconnect();
            window.volumeCompressor.disconnect();
            window.volumeMakeupGain.disconnect();
            window.sharedAnalyser.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
        
        window.sharedAudioSource.connect(window.sharedBassFilter);
        window.sharedBassFilter.connect(window.sharedMidFilter);
        window.sharedMidFilter.connect(window.sharedTrebleFilter);
        window.sharedTrebleFilter.connect(window.volumeGainNode);
        window.volumeGainNode.connect(window.volumeCompressor);
        window.volumeCompressor.connect(window.volumeMakeupGain);
        window.volumeMakeupGain.connect(window.sharedAnalyser);
        window.sharedAnalyser.connect(window.audioContext.destination);
        
        console.log('✅ Audio chain reconnected successfully');
        
        return true;
        
    } catch (error) {
        console.error('❌ Audio chain reconnection failed:', error);
        return false;
    }
};

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
            backgroundAnalysisRunning: false,
            visualizerEnabled: true
        };

        this.config = {
            PROGRESS_UPDATE_INTERVAL_MS: 200,
            SEEK_DEBOUNCE_DELAY_MS: 100
        };

        this.managers = {};
        this.elements = {};
        this.colorCache = new Map();
        window.colorCache = this.colorCache;
    }

    async init() {
        try {
            this.cacheElements();
            await this.initializeManagers();
            this.initializeAudio();
            this.setupEventListeners();
            await this.restoreState();
            this.debugLog('✅ Music player initialized successfully', 'success');
        } catch (error) {
            this.debugLog(\`❌ Initialization error: \${error.message}\`, 'error');
            console.error(error);
        }
    }

    cacheElements() {
        this.elements = {
            player: document.getElementById('audio-player'),
            loadButton: document.getElementById('load-button'),
            folderButton: document.getElementById('folder-button'),
            prevButton: document.getElementById('prev-button'),
            nextButton: document.getElementById('next-button'),
            shuffleButton: document.getElementById('shuffle-button'),
            loopButton: document.getElementById('loop-button'),
            clearButton: document.getElementById('clear-playlist'),
            playlistStatus: document.getElementById('playlist-status'),
            playlistItems: document.getElementById('playlist-items'),
            playlistSearch: document.getElementById('playlist-search'),
            jumpToCurrentBtn: document.getElementById('jump-to-current'),
            coverArt: document.getElementById('cover-art'),
            coverPlaceholder: document.getElementById('cover-placeholder'),
            trackTitle: document.getElementById('track-title'),
            trackArtist: document.getElementById('track-artist'),
            trackAlbum: document.getElementById('track-album'),
            progressContainer: document.getElementById('custom-progress-container'),
            progressBar: document.getElementById('progress-bar'),
            currentTimeDisplay: document.getElementById('current-time'),
            durationDisplay: document.getElementById('duration'),
            lyricsDisplay: document.getElementById('lyrics-display'),
            canvas: document.getElementById('visualizer'),
            eqBassSlider: document.getElementById('eq-bass'),
            eqMidSlider: document.getElementById('eq-mid'),
            eqTrebleSlider: document.getElementById('eq-treble'),
            bassValue: document.getElementById('bass-value'),
            midValue: document.getElementById('mid-value'),
            trebleValue: document.getElementById('treble-value'),
            eqResetBtn: document.getElementById('eq-reset'),
            debugToggle: document.getElementById('debug-toggle'),
            debugPanel: document.getElementById('debug-panel'),
            dropZone: document.getElementById('drop-zone'),
            exportLyricsButton: document.getElementById('export-lyrics-button'),
            fullscreenLyricsContainer: document.getElementById('fullscreen-lyrics'),
            fullscreenLyricsContent: document.getElementById('fullscreen-lyrics-content'),
            fullscreenLyricsToggle: document.getElementById('fullscreen-lyrics-toggle'),
            fullscreenLyricsCloseBtn: document.getElementById('lyrics-close-btn'),
            fullscreenLyricsPrevBtn: document.getElementById('lyrics-prev-btn'),
            fullscreenLyricsNextBtn: document.getElementById('lyrics-next-btn')
        };

        if (this.elements.canvas) {
            this.elements.canvasCtx = this.elements.canvas.getContext('2d');
        }
    }

    async initializeManagers() {
        const debugLog = this.debugLog.bind(this);

        try {
            if (typeof createMusicPlayerWorkerManager !== 'undefined') {
                this.managers.worker = createMusicPlayerWorkerManager(debugLog);
                window.workerManager = this.managers.worker;
            }

            if (typeof UIManager !== 'undefined') {
                this.managers.ui = new UIManager(debugLog);
                window.uiManager = this.managers.ui;
            }

            if (typeof PerformanceManager !== 'undefined') {
                this.managers.performance = new PerformanceManager(debugLog);
                window.perfManager = this.managers.performance;
            }

            if (typeof ImageOptimizer !== 'undefined') {
                this.managers.imageOptimizer = new ImageOptimizer(debugLog);
            }

            if (typeof AudioBufferManager !== 'undefined') {
                this.managers.audioBuffer = new AudioBufferManager(debugLog);
                this.managers.audioBuffer.setPlaylist(this.state.playlist);
            }

            // ✅ FIX #1: Parsers - CRITICAL FOR METADATA
            if (typeof MetadataParser !== 'undefined') {
                this.managers.metadata = new MetadataParser(debugLog);
            }

            if (typeof VTTParser !== 'undefined') {
                this.managers.vtt = new VTTParser(debugLog);
            }

            if (typeof ErrorRecovery !== 'undefined') {
                this.managers.errorRecovery = new ErrorRecovery(debugLog);
            }

            if (typeof AnalysisTextParser !== 'undefined') {
                this.managers.analysisParser = new AnalysisTextParser(debugLog);
            }

            if (typeof MetadataEditor !== 'undefined') {
                this.managers.metadataEditor = new MetadataEditor(debugLog);
            }

            if (typeof MusicAnalyzer !== 'undefined') {
                this.managers.analyzer = new MusicAnalyzer(debugLog);
            }

            if (typeof CustomMetadataStore !== 'undefined') {
                this.managers.customMetadata = new CustomMetadataStore();
            }

            if (typeof FolderPersistence !== 'undefined') {
                this.managers.folderPersistence = new FolderPersistence();
            }

            // ✅ FIX #1: File loading with dependencies
            if (typeof EnhancedFileLoadingManager !== 'undefined') {
                this.managers.fileLoading = new EnhancedFileLoadingManager(debugLog);
                
                this.managers.fileLoading.init({
                    metadataParser: this.managers.metadata,
                    vttParser: this.managers.vtt,
                    analysisParser: this.managers.analysisParser,
                    customMetadataStore: this.managers.customMetadata,
                    analyzer: this.managers.analyzer,
                    workerManager: this.managers.worker,
                    imageOptimizer: this.managers.imageOptimizer
                });
                
                window.fileLoadingManager = this.managers.fileLoading;
                this.debugLog('✅ FileLoadingManager initialized', 'success');
            }

            // ✅ FIX #2: Playlist renderer - correct class
            if (typeof EnhancedPlaylistRenderer !== 'undefined') {
                this.managers.playlistRenderer = new EnhancedPlaylistRenderer(debugLog);
                
                this.managers.playlistRenderer.init({
                    playlistContainer: document.getElementById('playlist-container'),
                    playlistItems: this.elements.playlistItems,
                    playlistSearch: this.elements.playlistSearch,
                    clearButton: this.elements.clearButton,
                    jumpToCurrentBtn: this.elements.jumpToCurrentBtn
                });
                
                this.managers.playlistRenderer.setCallbacks({
                    onTrackClick: (index) => this.loadTrack(index),
                    onEditClick: (index) => this.editTrackMetadata(index)
                });
                
                window.playlistRenderer = this.managers.playlistRenderer;
                this.debugLog('✅ EnhancedPlaylistRenderer initialized', 'success');
            }

            // ✅ FIX #3: Lyrics manager with elements
            if (typeof LyricsManager !== 'undefined') {
                this.managers.lyrics = new LyricsManager(debugLog);
                
                this.managers.lyrics.init({
                    lyricsDisplay: this.elements.lyricsDisplay,
                    exportButton: this.elements.exportLyricsButton,
                    fullscreenToggle: this.elements.fullscreenLyricsToggle,
                    fullscreenContainer: this.elements.fullscreenLyricsContainer,
                    fullscreenContent: this.elements.fullscreenLyricsContent,
                    fullscreenCloseBtn: this.elements.fullscreenLyricsCloseBtn,
                    fullscreenPrevBtn: this.elements.fullscreenLyricsPrevBtn,
                    fullscreenNextBtn: this.elements.fullscreenLyricsNextBtn
                }, this.elements.player);
                
                this.managers.lyrics.onNavigationRequest = (action) => {
                    if (action === 'previous') this.playPrevious();
                    else if (action === 'next') this.playNext();
                };
                
                this.managers.lyrics.onGetTrackInfo = () => {
                    if (this.state.currentTrackIndex === -1) return {};
                    const track = this.state.playlist[this.state.currentTrackIndex];
                    return {
                        title: track.metadata?.title || track.fileName,
                        artist: track.metadata?.artist || 'Unknown Artist'
                    };
                };
                
                window.lyricsManager = this.managers.lyrics;
                this.debugLog('✅ LyricsManager initialized', 'success');
            }

            this.debugLog('✅ All managers initialized', 'success');
        } catch (error) {
            this.debugLog(\`⚠️ Manager init warning: \${error.message}\`, 'warning');
        }
    }

    initializeAudio() {
        try {
            // ✅ FIX #4: Audio Pipeline with player
            if (typeof AudioPipeline !== 'undefined' && this.elements.player) {
                this.managers.audioPipeline = new AudioPipeline(this.debugLog.bind(this));
                this.managers.audioPipeline.init(this.elements.player);
                
                window.audioPipeline = this.managers.audioPipeline;
                window.audioContext = this.managers.audioPipeline.audioContext;
                window.sharedAnalyser = this.managers.audioPipeline.analyser;
                window.sharedDataArray = this.managers.audioPipeline.dataArray;
                window.sharedAudioSource = this.managers.audioPipeline.audioSource;
                window.sharedBassFilter = this.managers.audioPipeline.bassFilter;
                window.sharedMidFilter = this.managers.audioPipeline.midFilter;
                window.sharedTrebleFilter = this.managers.audioPipeline.trebleFilter;
                
                document.dispatchEvent(new CustomEvent('audioContextReady'));
                this.debugLog('✅ AudioPipeline initialized', 'success');
            }

            if (typeof VolumeControl !== 'undefined' && this.elements.player) {
                this.managers.volume = new VolumeControl(this.elements.player, this.debugLog.bind(this));
                window.volumeControl = this.managers.volume;
            }

            if (typeof VisualizerManager !== 'undefined') {
                this.managers.visualizer = new VisualizerManager();
                
                if (this.managers.audioPipeline?.analyser && this.elements.canvas) {
                    this.managers.visualizer.initMainVisualizer(
                        this.elements.canvas,
                        this.managers.audioPipeline.analyser,
                        this.managers.audioPipeline.dataArray,
                        this.managers.audioPipeline.bufferLength
                    );
                    this.managers.visualizer.start();
                }
            }

            if (typeof CrossfadeManager !== 'undefined') {
                this.managers.crossfade = new CrossfadeManager(this.elements.player, this.debugLog.bind(this));
            }

            if (typeof AutoEQManager !== 'undefined') {
                this.managers.autoEQ = new AutoEQManager(this.debugLog.bind(this));
            }

            if (window.backgroundAudioHandler) {
                this.initializeBackgroundAudio();
            }

            this.debugLog('✅ Audio system initialized', 'success');
        } catch (error) {
            this.debugLog(\`⚠️ Audio init: \${error.message}\`, 'warning');
        }
    }

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
            }
        } catch (error) {
            this.debugLog(\`⚠️ Background audio: \${error.message}\`, 'warning');
        }
    }

    setupEventListeners() {
        this.elements.player.addEventListener('ended', () => this.handleTrackEnded());
        this.elements.player.addEventListener('timeupdate', () => this.handleTimeUpdate());
        this.elements.player.addEventListener('loadedmetadata', () => this.handleMetadataLoaded());
        this.elements.player.addEventListener('error', (e) => this.handlePlayerError(e));
        this.elements.player.addEventListener('play', () => this.handlePlay());
        this.elements.player.addEventListener('pause', () => this.handlePause());

        if (this.elements.loadButton) {
            this.elements.loadButton.addEventListener('click', () => this.loadFiles());
        }

        if (this.elements.folderButton) {
            this.elements.folderButton.addEventListener('click', () => this.loadFromFolder());
        }

        if (this.elements.prevButton) {
            this.elements.prevButton.addEventListener('click', () => this.playPrevious());
        }

        if (this.elements.nextButton) {
            this.elements.nextButton.addEventListener('click', () => this.playNext());
        }

        if (this.elements.shuffleButton) {
            this.elements.shuffleButton.addEventListener('click', () => this.toggleShuffle());
        }

        if (this.elements.loopButton) {
            this.elements.loopButton.addEventListener('click', () => this.cycleLoopMode());
        }

        if (this.elements.clearButton) {
            this.elements.clearButton.addEventListener('click', () => this.clearPlaylist());
        }

        if (this.elements.progressContainer) {
            this.setupProgressBar();
        }

        this.setupEqualizer();

        if (this.elements.debugToggle) {
            this.elements.debugToggle.addEventListener('change', (e) => {
                this.state.debugMode = e.target.checked;
                if (this.elements.debugPanel) {
                    this.elements.debugPanel.classList.toggle('visible', this.state.debugMode);
                }
            });
        }

        this.debugLog('✅ Event listeners registered', 'success');
    }

    setupProgressBar() {
        let seekDebounce = null;

        this.elements.progressContainer.addEventListener('mousedown', (e) => {
            clearTimeout(seekDebounce);
            this.state.isSeekingProg = true;
            const wasPlaying = !this.elements.player.paused;
            this.elements.player.pause();

            seekDebounce = setTimeout(() => {
                if (wasPlaying) {
                    this.elements.player.play().catch(err => 
                        this.debugLog(\`Resume error: \${err.message}\`, 'error')
                    );
                }
            }, this.config.SEEK_DEBOUNCE_DELAY_MS);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.state.isSeekingProg) return;
            this.updateProgressBar(e);
        });

        document.addEventListener('mouseup', (e) => {
            if (!this.state.isSeekingProg) return;
            this.state.isSeekingProg = false;
            const newTime = this.updateProgressBar(e);
            if (newTime !== null && !isNaN(newTime)) {
                try {
                    this.elements.player.currentTime = newTime;
                } catch (err) {
                    this.debugLog(\`Seek failed: \${err.message}\`, 'error');
                }
            }
        });
    }

    updateProgressBar(e) {
        const rect = this.elements.progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        let percent = clickX / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        
        const newTime = percent * this.elements.player.duration;
        this.elements.progressBar.style.width = \`\${percent * 100}%\`;
        this.elements.currentTimeDisplay.textContent = this.formatTime(newTime);
        return newTime;
    }

    setupEqualizer() {
        const sliders = [
            { slider: this.elements.eqBassSlider, display: this.elements.bassValue, type: 'bass' },
            { slider: this.elements.eqMidSlider, display: this.elements.midValue, type: 'mid' },
            { slider: this.elements.eqTrebleSlider, display: this.elements.trebleValue, type: 'treble' }
        ];

        sliders.forEach(({ slider, display, type }) => {
            if (!slider) return;
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (display) display.textContent = \`\${value > 0 ? '+' : ''}\${value} dB\`;
                this.updateEqualizer(type, value);
            });
        });

        if (this.elements.eqResetBtn) {
            this.elements.eqResetBtn.addEventListener('click', () => this.resetEqualizer());
        }
    }

    async loadFiles() {
        try {
            if (!this.managers.fileLoading) {
                this.managers.ui?.showToast('File loading not available', 'error');
                return;
            }

            const result = await this.managers.fileLoading.createFileInput();
            
            if (result && result.success && result.playlist.length > 0) {
                this.state.playlist = result.playlist;
                this.state.currentTrackIndex = -1;
                
                // ✅ FIX #6: Update buffer manager
                if (this.managers.audioBuffer) {
                    this.managers.audioBuffer.setPlaylist(this.state.playlist);
                }
                
                this.updatePlaylist();
                this.savePlaylistToStorage();
                
                this.managers.ui?.showToast(\`Loaded \${result.playlist.length} tracks\`, 'success');
                this.startBackgroundAnalysis();

                // ✅ FIX #5: Auto-play
                if (result.playlist.length > 0) {
                    this.loadTrack(0);
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(\`Error loading: \${error.message}\`, 'error');
            }
        }
    }

    async loadFromFolder() {
        try {
            if (!('showDirectoryPicker' in window)) {
                this.managers.ui?.showToast('Folder selection not supported', 'error');
                return;
            }

            const dirHandle = await window.showDirectoryPicker({
                mode: 'read',
                startIn: 'music'
            });

            this.state.folderHandle = dirHandle;

            if (!this.managers.fileLoading) return;

            const result = await this.managers.fileLoading.loadFromFolderHandle(dirHandle);

            if (result && result.success && result.playlist.length > 0) {
                this.state.playlist = result.playlist;
                this.state.currentTrackIndex = -1;

                // ✅ FIX #6: Update buffer manager
                if (this.managers.audioBuffer) {
                    this.managers.audioBuffer.setPlaylist(this.state.playlist);
                }

                this.updatePlaylist();
                this.savePlaylistToStorage();

                if (this.managers.folderPersistence && result.stats) {
                    await this.managers.folderPersistence.updateMetadata({
                        trackCount: result.stats.audioFiles,
                        hasLyrics: result.stats.withLyrics > 0,
                        hasAnalysis: result.stats.withAnalysis > 0,
                        totalSize: result.stats.totalSize || 0
                    });
                }

                this.managers.ui?.showToast(\`Loaded \${result.playlist.length} tracks\`, 'success');
                this.startBackgroundAnalysis();

                // ✅ FIX #5: Auto-play
                if (result.playlist.length > 0) {
                    this.loadTrack(0);
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(\`Error: \${error.message}\`, 'error');
            }
        }
    }

    async loadTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        this.state.currentTrackIndex = index;
        const track = this.state.playlist[index];

        this.debugLog(\`Loading track \${index + 1}: \${track.fileName}\`, 'info');

        if (track.metadata) {
            this.displayMetadata(track.metadata);
        } else {
            this.clearMetadata();
            this.elements.trackTitle.textContent = track.fileName;
        }

        if (this.managers.volume && track.metadata) {
            const trackId = \`\${track.metadata.artist || 'Unknown'}_\${track.metadata.title || track.fileName}\`;
            const hasAppliedSaved = this.managers.volume.applyTrackVolume(trackId);
            if (!hasAppliedSaved && track.analysis) {
                this.managers.volume.applyVolume(this.managers.volume.getVolume(), true, track.analysis);
            }
        }

        if (this.managers.autoEQ && this.managers.autoEQ.enabled && track.analysis) {
            this.managers.autoEQ.applyAutoEQ(track);
        }

        if (this.managers.visualizer) {
            if (track.analysis) {
                this.managers.visualizer.setTrackAnalysis(track.analysis);
            } else {
                this.managers.visualizer.clearTrackAnalysis();
            }
        }

        if (this.managers.audioBuffer && track.file) {
            const loadTrackIndex = index;
            
            if (this.elements.player.src && this.elements.player.src.startsWith('blob:')) {
                URL.revokeObjectURL(this.elements.player.src);
            }

            this.managers.audioBuffer.getBuffer(loadTrackIndex).then(buffer => {
                if (this.state.currentTrackIndex !== loadTrackIndex) return;

                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                const bufferUrl = URL.createObjectURL(blob);
                this.elements.player.src = bufferUrl;
                this.elements.player.load();

                if (track.analysis?.silence?.start > 0.1) {
                    this.elements.player.currentTime = track.analysis.silence.start;
                }

                // ✅ FIX #5: Auto-play
                this.elements.player.play().catch(e => 
                    this.debugLog(\`Playback failed: \${e.message}\`, 'warning')
                );
                
                this.managers.audioBuffer.preloadUpcoming(loadTrackIndex);
            }).catch(err => {
                this.elements.player.src = track.audioURL;
                this.elements.player.load();
                
                // ✅ FIX #5: Auto-play fallback
                this.elements.player.play().catch(e => 
                    this.debugLog(\`Playback failed: \${e.message}\`, 'warning')
                );
            });
        } else {
            this.elements.player.src = track.audioURL;
            this.elements.player.load();
            
            // ✅ FIX #5: Auto-play
            this.elements.player.play().catch(e => 
                this.debugLog(\`Playback failed: \${e.message}\`, 'warning')
            );
        }

        if (track.vtt && this.managers.vtt && this.managers.lyrics) {
            try {
                const parsedCues = await this.managers.vtt.loadVTTFile(track.vtt);
                this.managers.lyrics.loadLyrics(parsedCues);
            } catch (err) {
                this.managers.lyrics.clearLyrics();
            }
        } else if (this.managers.lyrics) {
            this.managers.lyrics.clearLyrics();
        }

        if (this.managers.playlistRenderer) {
            this.managers.playlistRenderer.updateHighlight(this.state.currentTrackIndex);
        }

        if (this.elements.prevButton) this.elements.prevButton.disabled = false;
        if (this.elements.nextButton) this.elements.nextButton.disabled = false;

        this.updateMediaSession();
    }

    displayMetadata(metadata) {
        if (!metadata) return;

        this.elements.trackTitle.textContent = metadata.title || 'Unknown Title';
        this.elements.trackArtist.textContent = metadata.artist || 'Unknown Artist';
        this.elements.trackAlbum.textContent = metadata.album || 'Unknown Album';

        if (metadata.image) {
            this.elements.coverArt.src = metadata.image;
            this.elements.coverArt.onload = () => {
                this.elements.coverArt.classList.add('loaded');
                this.elements.coverPlaceholder.style.display = 'none';
            };
            this.elements.coverArt.onerror = () => {
                this.elements.coverArt.src = '';
                this.elements.coverArt.classList.remove('loaded');
                this.elements.coverPlaceholder.style.display = 'flex';
            };
        } else {
            this.elements.coverArt.src = '';
            this.elements.coverArt.classList.remove('loaded');
            this.elements.coverPlaceholder.style.display = 'flex';
        }
    }

    clearMetadata() {
        this.elements.trackTitle.textContent = 'No track loaded';
        this.elements.trackArtist.textContent = '--';
        this.elements.trackAlbum.textContent = '--';
        this.elements.coverArt.src = '';
        this.elements.coverArt.classList.remove('loaded');
        this.elements.coverPlaceholder.style.display = 'flex';

        if (this.managers.lyrics) {
            this.managers.lyrics.clearLyrics();
        }
    }

    updatePlaylist() {
        if (this.managers.playlistRenderer) {
            this.managers.playlistRenderer.setPlaylist(this.state.playlist, this.state.currentTrackIndex);
        }

        this.updatePlaylistStatus();
    }

    updatePlaylistStatus() {
        const count = this.state.playlist.length;
        if (this.elements.playlistStatus) {
            this.elements.playlistStatus.textContent = 
                \`\${count} track\${count !== 1 ? 's' : ''} loaded\`;
        }

        if (this.elements.clearButton) this.elements.clearButton.disabled = count === 0;
        if (this.elements.shuffleButton) this.elements.shuffleButton.disabled = count === 0;
        if (this.elements.loopButton) this.elements.loopButton.disabled = count === 0;
    }

    updateMediaSession() {
        if ('mediaSession' in navigator && this.state.currentTrackIndex !== -1) {
            const track = this.state.playlist[this.state.currentTrackIndex];
            const metadata = track.metadata || {};

            navigator.mediaSession.metadata = new MediaMetadata({
                title: metadata.title || track.fileName,
                artist: metadata.artist || 'Unknown Artist',
                album: metadata.album || 'Unknown Album',
                artwork: metadata.image ? [{ src: metadata.image, sizes: '512x512', type: 'image/png' }] : []
            });

            if (window.backgroundAudioHandler) {
                backgroundAudioHandler.updateMediaSessionMetadata();
            }
        }
    }

    playNext() {
        if (this.state.playlist.length === 0) return;

        if (this.state.currentTrackIndex !== -1 && this.managers.volume) {
            const track = this.state.playlist[this.state.currentTrackIndex];
            const trackId = \`\${track.metadata?.artist || 'Unknown'}_\${track.metadata?.title || track.fileName}\`;
            this.managers.volume.rememberTrackVolume(trackId, this.managers.volume.getVolume());
        }

        let nextIndex;
        if (this.state.isShuffled) {
            nextIndex = Math.floor(Math.random() * this.state.playlist.length);
        } else {
            nextIndex = this.state.currentTrackIndex + 1;
            if (nextIndex >= this.state.playlist.length) {
                if (this.state.loopMode === 'all') {
                    nextIndex = 0;
                } else {
                    return;
                }
            }
        }

        this.loadTrack(nextIndex);
    }

    playPrevious() {
        if (this.state.playlist.length === 0) return;

        if (this.state.currentTrackIndex > 0) {
            this.loadTrack(this.state.currentTrackIndex - 1);
        } else if (this.state.loopMode === 'all') {
            this.loadTrack(this.state.playlist.length - 1);
        }
    }

    handleTrackEnded() {
        if (this.state.loopMode === 'one') {
            this.elements.player.currentTime = 0;
            this.elements.player.play();
        } else {
            this.playNext();
        }
    }

    toggleShuffle() {
        this.state.isShuffled = !this.state.isShuffled;
        if (this.elements.shuffleButton) {
            this.elements.shuffleButton.classList.toggle('active', this.state.isShuffled);
        }
        this.managers.ui?.showToast(\`Shuffle \${this.state.isShuffled ? 'on' : 'off'}\`, 'info');
    }

    cycleLoopMode() {
        const modes = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(this.state.loopMode);
        this.state.loopMode = modes[(currentIndex + 1) % modes.length];

        if (this.elements.loopButton) {
            this.elements.loopButton.classList.toggle('active', this.state.loopMode !== 'off');
        }

        this.managers.ui?.showToast(\`Loop: \${this.state.loopMode}\`, 'info');
    }

    clearPlaylist() {
        if (confirm('Clear playlist?')) {
            if (this.managers.fileLoading) {
                this.managers.fileLoading.cleanupPlaylist(this.state.playlist);
            }

            if (this.managers.audioBuffer) {
                this.managers.audioBuffer.clearAllBuffers();
            }

            this.state.playlist = [];
            this.state.currentTrackIndex = -1;
            
            this.elements.player.pause();
            this.elements.player.src = '';
            
            this.clearMetadata();
            this.updatePlaylist();

            if (this.elements.prevButton) this.elements.prevButton.disabled = true;
            if (this.elements.nextButton) this.elements.nextButton.disabled = true;
        }
    }

    handleTimeUpdate() {
        if (this.state.isSeekingProg) return;

        if (this.managers.performance?.shouldUpdate('progress') !== false) {
            const percent = (this.elements.player.currentTime / this.elements.player.duration) * 100;
            this.elements.progressBar.style.width = \`\${percent}%\`;
            this.elements.currentTimeDisplay.textContent = this.formatTime(this.elements.player.currentTime);
        }

        // ✅ FIX #7: Update lyrics
        if (this.managers.lyrics && this.managers.performance?.shouldUpdate('lyrics') !== false) {
            this.managers.lyrics.update(
                this.elements.player.currentTime, 
                this.state.compactMode
            );
        }
    }

    handleMetadataLoaded() {
        if (this.elements.durationDisplay) {
            this.elements.durationDisplay.textContent = this.formatTime(this.elements.player.duration);
        }
    }

    handlePlay() {
        if (this.managers.audioPipeline?.isInitialized) {
            if (this.managers.audioPipeline.audioContext.state === 'suspended') {
                this.managers.audioPipeline.resume();
            }
        }

        if (window.backgroundAudioHandler) {
            backgroundAudioHandler.updatePlaybackState('playing');
        }
    }

    handlePause() {
        if (window.backgroundAudioHandler) {
            backgroundAudioHandler.updatePlaybackState('paused');
        }
    }

    handlePlayerError(e) {
        if (this.state.currentTrackIndex === -1) return;

        const trackInfo = this.state.playlist[this.state.currentTrackIndex];
        
        if (this.managers.errorRecovery) {
            this.managers.errorRecovery.handleAudioError(this.elements.player, trackInfo);
        }
    }

    updateEqualizer(type, value) {
        if (!this.managers.audioPipeline?.isInitialized) return;

        const filters = {
            bass: this.managers.audioPipeline.bassFilter,
            mid: this.managers.audioPipeline.midFilter,
            treble: this.managers.audioPipeline.trebleFilter
        };

        if (filters[type]) {
            this.managers.audioPipeline.setGain(filters[type], value);
        }
    }

    resetEqualizer() {
        const sliders = [
            { slider: this.elements.eqBassSlider, display: this.elements.bassValue },
            { slider: this.elements.eqMidSlider, display: this.elements.midValue },
            { slider: this.elements.eqTrebleSlider, display: this.elements.trebleValue }
        ];

        sliders.forEach(({ slider, display }) => {
            if (slider) {
                slider.value = 0;
                if (display) display.textContent = '0 dB';
            }
        });

        if (this.managers.audioPipeline?.bassFilter) {
            this.managers.audioPipeline.setGain(this.managers.audioPipeline.bassFilter, 0);
            this.managers.audioPipeline.setGain(this.managers.audioPipeline.midFilter, 0);
            this.managers.audioPipeline.setGain(this.managers.audioPipeline.trebleFilter, 0);
        }
    }

    async startBackgroundAnalysis() {
        if (this.state.backgroundAnalysisRunning) return;
        if (!this.managers.analyzer) return;

        this.state.backgroundAnalysisRunning = true;

        const needsAnalysis = this.state.playlist
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => !track.analysis);

        if (needsAnalysis.length === 0) {
            this.state.backgroundAnalysisRunning = false;
            return;
        }

        for (let i = 0; i < needsAnalysis.length; i += 3) {
            const batch = needsAnalysis.slice(i, i + 3);
            
            await Promise.all(batch.map(async ({ track, index }) => {
                try {
                    const response = await fetch(track.audioURL);
                    const blob = await response.blob();
                    const file = new File([blob], track.fileName, { type: 'audio/mpeg' });
                    
                    const analysis = await this.managers.analyzer.analyzeTrack(file, track.fileName);
                    this.state.playlist[index].analysis = analysis;
                } catch (err) {
                    // Silent fail
                }
            }));

            this.updatePlaylist();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.state.backgroundAnalysisRunning = false;
    }

    savePlaylistToStorage() {
        try {
            const data = this.state.playlist.map(t => ({
                fileName: t.fileName,
                metadata: t.metadata,
                hasVTT: !!t.vtt,
                duration: t.duration
            }));

            localStorage.setItem('savedPlaylist', JSON.stringify(data));
        } catch (error) {
            // Silent fail
        }
    }

    async restoreState() {
        try {
            const savedCrossfade = localStorage.getItem('crossfadeEnabled') === 'true';
            const savedAutoEQ = localStorage.getItem('autoEQEnabled') === 'true';

            if (savedCrossfade && this.managers.crossfade) {
                this.managers.crossfade.setEnabled(true);
            }
            if (savedAutoEQ && this.managers.autoEQ) {
                this.managers.autoEQ.setEnabled(true);
            }
        } catch (error) {
            // Silent fail
        }
    }

    editTrackMetadata(index) {
        const track = this.state.playlist[index];
        if (!track || !this.managers.metadataEditor) return;

        const currentMetadata = {
            title: track.metadata?.title || track.fileName,
            artist: track.metadata?.artist || 'Unknown Artist',
            album: track.metadata?.album || 'Unknown Album'
        };

        this.managers.metadataEditor.openEditor(index, currentMetadata, (trackIndex, newMetadata) => {
            if (this.managers.customMetadata) {
                this.managers.customMetadata.save(
                    this.state.playlist[trackIndex].fileName,
                    this.state.playlist[trackIndex].duration || 0,
                    newMetadata
                );
            }

            this.state.playlist[trackIndex].metadata = {
                ...this.state.playlist[trackIndex].metadata,
                ...newMetadata,
                hasMetadata: true
            };

            this.updatePlaylist();

            if (trackIndex === this.state.currentTrackIndex) {
                this.displayMetadata(this.state.playlist[trackIndex].metadata);
            }
        });
    }

    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
    }

    debugLog(message, type = 'info') {
        if (!this.state.debugMode && type !== 'error') return;

        const prefix = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
        console.log(\`\${prefix} \${message}\`);

        if (this.elements.debugPanel && this.state.debugMode) {
            const entry = document.createElement('div');
            entry.className = \`debug-entry debug-\${type}\`;
            entry.textContent = \`\${new Date().toLocaleTimeString()} - \${message}\`;
            this.elements.debugPanel.appendChild(entry);

            while (this.elements.debugPanel.children.length > 100) {
                this.elements.debugPanel.removeChild(this.elements.debugPanel.firstChild);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Initializing - FULLY INTEGRATED v1.0');
    window.musicPlayerApp = new MusicPlayerApp();
    window.musicPlayerApp.init();
});

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

console.log('✅ Script loaded - All 7 critical fixes applied!');
