/* ============================================
   Ultimate Local Music Player - MEMORY LEAK FIXED v2.0
   
   CRITICAL FIXES:
   - Blob URL tracking and cleanup
   - Event listener tracking
   - Manager integration with performance manager
   - Cleanup on track changes
   - Proper destroy sequence
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
            visualizerEnabled: true,
            stickyMode: false,
            pipActive: false,
            initialized: false,
            destroyed: false
        };

        this.config = {
            PROGRESS_UPDATE_INTERVAL_MS: 200,
            SEEK_DEBOUNCE_DELAY_MS: 100
        };

        this.managers = {};
        this.elements = {};
        this.colorCache = new Map();
        window.colorCache = this.colorCache;
        
        // CRITICAL: Resource tracking for cleanup
        this.resources = {
            blobURLs: new Set(),
            eventListeners: [],
            intervals: new Set(),
            timeouts: new Set()
        };
    }

    async init() {
        if (this.state.initialized) {
            this.debugLog('⚠️ App already initialized', 'warning');
            return;
        }
        
        try {
            this.cacheElements();
            await this.initializeManagers();
            this.initializeAudio();
            this.setupEventListeners();
            this.setupKeyboardShortcuts();
            this.setupSidebarButtons();
            await this.restoreState();
            
            // CRITICAL: Connect managers to performance manager
            this.connectManagersToPerformance();
            
            this.state.initialized = true;
            this.debugLog('✅ Music player initialized successfully (Memory Leak Fixed v2.0)', 'success');
        } catch (error) {
            this.debugLog(`❌ Initialization error: ${error.message}`, 'error');
            console.error(error);
        }
    }

    cacheElements() {
        this.elements = {
            player: document.getElementById('audio-player'),
            playPauseButton: document.getElementById('play-pause-button'),
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
            fullscreenLyricsNextBtn: document.getElementById('lyrics-next-btn'),
            metadataContainer: document.getElementById('metadata-container'),
            mainContent: document.getElementById('main-content'),
            pipVideo: document.getElementById('pip-video')
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
            this.debugLog(`⚠️ Manager init warning: ${error.message}`, 'warning');
        }
    }

    /**
     * CRITICAL NEW: Connect all managers to performance manager for coordinated cleanup
     */
    connectManagersToPerformance() {
        if (!this.managers.performance) {
            this.debugLog('⚠️ Performance manager not available for connections', 'warning');
            return;
        }
        
        // Connect managers that need coordinated cleanup
        if (this.managers.visualizer) {
            this.managers.performance.connectManager('visualizer', this.managers.visualizer);
        }
        
        if (this.managers.audioBuffer) {
            this.managers.performance.connectManager('audioBuffer', this.managers.audioBuffer);
        }
        
        if (this.managers.lyrics) {
            this.managers.performance.connectManager('lyrics', this.managers.lyrics);
        }
        
        if (this.managers.audioPipeline) {
            this.managers.performance.connectManager('audioPipeline', this.managers.audioPipeline);
        }
        
        if (this.managers.ui) {
            this.managers.performance.connectManager('ui', this.managers.ui);
        }
        
        this.debugLog('✅ Managers connected to performance manager', 'success');
    }

    initializeAudio() {
        try {
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
                
                this.initializeAudioManagers();
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
                
                // Initialize fullscreen visualizer UI controller
                if (typeof VisualizerUIController !== 'undefined') {
                    this.managers.visualizerUI = new VisualizerUIController(
                        this.managers.visualizer,
                        this.debugLog.bind(this)
                    );
                    
                    this.managers.visualizerUI.init({
                        toggle: 'fullscreen-viz-toggle',
                        container: 'fullscreen-visualizer',
                        canvas: 'fullscreen-viz-canvas',
                        modeBtn: 'viz-mode-btn',
                        prevBtn: 'viz-prev-btn',
                        playPauseBtn: 'viz-play-pause-btn',
                        nextBtn: 'viz-next-btn',
                        closeBtn: 'viz-close-btn',
                        title: '.fullscreen-viz-title',
                        artist: '.fullscreen-viz-artist',
                        currentTime: 'viz-current-time',
                        duration: 'viz-duration'
                    });
                    
                    this.managers.visualizerUI.setCallbacks({
                        onPrevious: () => this.playPrevious(),
                        onNext: () => this.playNext(),
                        onPlayPause: () => this.togglePlayPause(),
                        getTrackInfo: () => {
                            if (this.state.currentTrackIndex === -1) return {};
                            const track = this.state.playlist[this.state.currentTrackIndex];
                            return {
                                title: track.metadata?.title || track.fileName,
                                artist: track.metadata?.artist || 'Unknown Artist'
                            };
                        },
                        getCurrentTime: () => this.elements.player.currentTime,
                        getDuration: () => this.elements.player.duration,
                        isPaused: () => this.elements.player.paused,
                        getAudioData: () => {
                            if (!this.managers.audioPipeline?.isInitialized) return null;
                            return {
                                analyser: this.managers.audioPipeline.analyser,
                                dataArray: this.managers.audioPipeline.dataArray,
                                bufferLength: this.managers.audioPipeline.bufferLength
                            };
                        }
                    });
                    
                    this.debugLog('✅ VisualizerUIController initialized', 'success');
                }
            }

            if (typeof CrossfadeManager !== 'undefined') {
                this.managers.crossfade = new CrossfadeManager(this.elements.player, this.debugLog.bind(this));
            }

            if (window.backgroundAudioHandler) {
                this.initializeBackgroundAudio();
            }

            this.debugLog('✅ Audio system initialized', 'success');
        } catch (error) {
            this.debugLog(`⚠️ Audio init: ${error.message}`, 'warning');
        }
    }

    initializeAudioManagers() {
        const debugLog = this.debugLog.bind(this);
        
        try {
            if (typeof AudioPresetsManager !== 'undefined' && 
                this.managers.audioPipeline?.isInitialized) {
                
                this.managers.audioPresets = new AudioPresetsManager(
                    this.managers.audioPipeline.bassFilter,
                    this.managers.audioPipeline.midFilter,
                    this.managers.audioPipeline.trebleFilter,
                    debugLog
                );
                
                window.audioPresetsManager = this.managers.audioPresets;
                
                this.populateEQPresetDropdown();
                this.setupEQPresetSelector();
                this.managers.audioPresets.loadSavedPreset();
                
                this.debugLog('✅ AudioPresetsManager initialized', 'success');
            }
            
            if (typeof AutoEQManager !== 'undefined' && this.managers.audioPresets) {
                this.managers.autoEQ = new AutoEQManager(
                    this.managers.audioPresets,
                    debugLog
                );
                
                window.autoEQManager = this.managers.autoEQ;
                this.debugLog('✅ AutoEQManager initialized', 'success');
            }
            
        } catch (error) {
            this.debugLog(`⚠️ Audio manager init: ${error.message}`, 'warning');
            console.error(error);
        }
    }

    populateEQPresetDropdown() {
        const dropdown = document.getElementById('eq-preset-select');
        if (!dropdown || !this.managers.audioPresets) return;
        
        const presets = this.managers.audioPresets.getPresetList();
        
        while (dropdown.options.length > 1) {
            dropdown.remove(1);
        }
        
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name;
            option.title = `${preset.description}\n${preset.philosophy}`;
            dropdown.appendChild(option);
        });
        
        this.debugLog(`✅ Populated ${presets.length} EQ presets`, 'info');
    }

    setupEQPresetSelector() {
        const dropdown = document.getElementById('eq-preset-select');
        if (!dropdown || !this.managers.audioPresets) return;
        
        const changeHandler = (e) => {
            const presetId = e.target.value;
            if (!presetId) return;
            
            const track = this.state.playlist[this.state.currentTrackIndex];
            const analysis = track?.analysis || null;
            
            this.managers.audioPresets.applyPreset(presetId, analysis);
            this.managers.audioPresets.saveCurrentPreset();
            
            if (this.managers.autoEQ?.isEnabled()) {
                this.managers.autoEQ.setEnabled(false);
                const autoEQBtn = document.getElementById('auto-eq-button');
                if (autoEQBtn) {
                    autoEQBtn.classList.remove('active');
                    autoEQBtn.querySelector('.sidebar-label').textContent = 'Auto-EQ Off';
                }
            }
            
            this.debugLog(`🎛️ Applied preset: ${presetId}`, 'success');
        };
        
        dropdown.addEventListener('change', changeHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: dropdown,
            event: 'change',
            handler: changeHandler
        });
    }

    setupSidebarButtons() {
        this.setupAutoEQButton();
        this.setupVolumeBoostButton();
        this.setupCrossfadeButton();
        this.setupDebugButton();
        this.setupCompactToggle();
        this.setupPiPToggle();
        this.setupStickyToggle();
        this.setupStorageStatsButton();
        this.setupCustomBackgroundButton();
        this.setupClearCacheButton();
        
        this.debugLog('✅ All sidebar buttons configured', 'success');
    }

    setupAutoEQButton() {
        const button = document.getElementById('auto-eq-button');
        if (!button || !this.managers.autoEQ) return;
        
        const savedState = localStorage.getItem('autoEQEnabled') === 'true';
        if (savedState) {
            this.managers.autoEQ.setEnabled(true);
            button.classList.add('active');
            button.querySelector('.sidebar-label').textContent = 'Auto-EQ On';
        }
        
        button.disabled = false;
        
        const clickHandler = () => {
            const newState = this.managers.autoEQ.toggle();
            
            button.classList.toggle('active', newState);
            button.querySelector('.sidebar-label').textContent = 
                newState ? 'Auto-EQ On' : 'Auto-EQ Off';
            
            localStorage.setItem('autoEQEnabled', newState.toString());
            
            if (newState && this.state.currentTrackIndex !== -1) {
                const track = this.state.playlist[this.state.currentTrackIndex];
                if (track) {
                    this.managers.autoEQ.applyAutoEQ(track);
                }
            } else if (!newState) {
                this.managers.audioPresets.reset();
                const dropdown = document.getElementById('eq-preset-select');
                if (dropdown) dropdown.value = 'flat';
            }
            
            this.managers.ui?.showToast(
                `Auto-EQ ${newState ? 'enabled' : 'disabled'}`, 
                newState ? 'success' : 'info'
            );
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupVolumeBoostButton() {
        const button = document.getElementById('volume-boost-button');
        if (!button || !this.managers.volume) return;
        
        const savedBoost = this.managers.volume.isBoostEnabled();
        if (savedBoost) {
            button.classList.add('active');
            button.querySelector('.sidebar-label').textContent = 'Boost On';
        }
        
        const clickHandler = () => {
            const currentState = this.managers.volume.isBoostEnabled();
            const newState = !currentState;
            
            this.managers.volume.setBoost(newState, 1.5);
            
            button.classList.toggle('active', newState);
            button.querySelector('.sidebar-label').textContent = 
                newState ? 'Boost On' : 'Boost Off';
            
            this.managers.ui?.showToast(
                `Volume Boost ${newState ? 'enabled' : 'disabled'}`, 
                newState ? 'success' : 'info'
            );
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupCrossfadeButton() {
        const button = document.getElementById('crossfade-button');
        if (!button || !this.managers.crossfade) return;
        
        const savedState = localStorage.getItem('crossfadeEnabled') === 'true';
        if (savedState) {
            this.managers.crossfade.setEnabled(true);
            button.classList.add('active');
            button.querySelector('.sidebar-label').textContent = 'Crossfade On';
        }
        
        button.disabled = false;
        
        const clickHandler = () => {
            const newState = !this.managers.crossfade.enabled;
            this.managers.crossfade.setEnabled(newState);
            
            button.classList.toggle('active', newState);
            button.querySelector('.sidebar-label').textContent = 
                newState ? 'Crossfade On' : 'Crossfade Off';
            
            localStorage.setItem('crossfadeEnabled', newState.toString());
            
            this.managers.ui?.showToast(
                `Crossfade ${newState ? 'enabled' : 'disabled'}`, 
                newState ? 'success' : 'info'
            );
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupDebugButton() {
        const button = document.getElementById('debug-toggle');
        if (!button) return;
        
        const clickHandler = () => {
            this.state.debugMode = !this.state.debugMode;
            button.classList.toggle('active', this.state.debugMode);
            
            if (this.elements.debugPanel) {
                this.elements.debugPanel.classList.toggle('visible', this.state.debugMode);
            }
            
            this.debugLog(`Debug mode: ${this.state.debugMode ? 'ON' : 'OFF'}`, 'info');
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupCompactToggle() {
        const button = document.getElementById('compact-toggle');
        if (!button) return;
        
        const savedMode = localStorage.getItem('compactMode') || 'full';
        this.state.compactMode = savedMode;
        this.applyCompactMode(savedMode);
        
        const clickHandler = () => {
            const modes = ['full', 'compact', 'mini'];
            const currentIndex = modes.indexOf(this.state.compactMode);
            const newMode = modes[(currentIndex + 1) % modes.length];
            
            this.state.compactMode = newMode;
            this.applyCompactMode(newMode);
            
            localStorage.setItem('compactMode', newMode);
            
            const modeNames = { full: 'Full View', compact: 'Compact', mini: 'Mini' };
            button.querySelector('.sidebar-label').textContent = modeNames[newMode];
            
            this.managers.ui?.showToast(`View: ${modeNames[newMode]}`, 'info');
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    /**
     * CRITICAL: Apply compact mode with performance manager integration
     */
    applyCompactMode(mode) {
        if (!this.elements.mainContent) return;
        
        this.elements.mainContent.classList.remove('compact-mode', 'mini-mode');
        
        if (mode === 'compact') {
            this.elements.mainContent.classList.add('compact-mode');
        } else if (mode === 'mini') {
            this.elements.mainContent.classList.add('mini-mode');
        }
        
        // CRITICAL: Tell performance manager about mode change
        if (this.managers.performance) {
            this.managers.performance.setMode(mode);
        }
    }

    setupPiPToggle() {
        const button = document.getElementById('pip-toggle');
        if (!button) return;
        
        const clickHandler = async () => {
            try {
                if (this.state.pipActive) {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    }
                    this.state.pipActive = false;
                    button.classList.remove('active');
                    this.managers.ui?.showToast('PiP disabled', 'info');
                } else {
                    if (!this.elements.pipVideo) {
                        this.managers.ui?.showToast('PiP not available', 'error');
                        return;
                    }
                    
                    const canvas = this.elements.canvas;
                    if (canvas) {
                        const stream = canvas.captureStream(30);
                        this.elements.pipVideo.srcObject = stream;
                        await this.elements.pipVideo.play();
                        await this.elements.pipVideo.requestPictureInPicture();
                        
                        this.state.pipActive = true;
                        button.classList.add('active');
                        this.managers.ui?.showToast('PiP enabled', 'success');
                    }
                }
            } catch (error) {
                this.debugLog(`PiP error: ${error.message}`, 'error');
                this.managers.ui?.showToast('PiP not supported', 'error');
            }
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupStickyToggle() {
        const button = document.getElementById('sticky-toggle');
        if (!button) return;
        
        const savedState = localStorage.getItem('stickyMode') === 'true';
        if (savedState) {
            this.state.stickyMode = true;
            button.classList.add('active');
            button.querySelector('.sidebar-label').textContent = 'Sticky On';
            this.applyStickyMode(true);
        }
        
        const clickHandler = () => {
            this.state.stickyMode = !this.state.stickyMode;
            
            button.classList.toggle('active', this.state.stickyMode);
            button.querySelector('.sidebar-label').textContent = 
                this.state.stickyMode ? 'Sticky On' : 'Sticky Off';
            
            localStorage.setItem('stickyMode', this.state.stickyMode.toString());
            
            this.applyStickyMode(this.state.stickyMode);
            
            this.managers.ui?.showToast(
                `Sticky mode ${this.state.stickyMode ? 'enabled' : 'disabled'}`, 
                this.state.stickyMode ? 'success' : 'info'
            );
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    applyStickyMode(enabled) {
        if (!this.elements.metadataContainer) return;
        
        if (enabled) {
            this.elements.metadataContainer.classList.add('sticky-mode');
            const closeBtn = this.elements.metadataContainer.querySelector('.sticky-close');
            if (closeBtn) closeBtn.style.display = 'block';
        } else {
            this.elements.metadataContainer.classList.remove('sticky-mode');
            const closeBtn = this.elements.metadataContainer.querySelector('.sticky-close');
            if (closeBtn) closeBtn.style.display = 'none';
        }
    }

    setupStorageStatsButton() {
        const button = document.getElementById('storage-stats-btn');
        if (!button) return;
        
        const clickHandler = async () => {
            try {
                let message = '💾 Storage Information\n\n';
                
                if (navigator.storage && navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    const usage = (estimate.usage / 1024 / 1024).toFixed(2);
                    const quota = (estimate.quota / 1024 / 1024).toFixed(2);
                    const percent = ((estimate.usage / estimate.quota) * 100).toFixed(1);
                    
                    message += `Used: ${usage} MB\n`;
                    message += `Total: ${quota} MB\n`;
                    message += `Usage: ${percent}%\n\n`;
                }
                
                if (this.managers.audioBuffer) {
                    const stats = this.managers.audioBuffer.getStats();
                    message += `Audio Buffer:\n`;
                    message += `- Memory: ${stats.memoryUsedMB}\n`;
                    message += `- Cached: ${stats.cachedTracks} tracks\n`;
                    message += `- Hit rate: ${stats.hitRate}\n\n`;
                }
                
                if (this.managers.performance) {
                    const perfStats = this.managers.performance.getStatsDisplay();
                    message += `Performance:\n`;
                    message += `- FPS: ${perfStats.fps}\n`;
                    message += `- Memory: ${perfStats.memory}\n`;
                    message += `- CPU: ${perfStats.cpuLoad}\n`;
                    message += `- Active Resources: ${perfStats.activeResources.intervals} intervals, ${perfStats.activeResources.animations} animations\n\n`;
                }
                
                message += `Blob URLs: ${this.resources.blobURLs.size}\n`;
                message += `Event Listeners: ${this.resources.eventListeners.length}`;
                
                alert(message);
            } catch (error) {
                this.debugLog(`Storage stats error: ${error.message}`, 'error');
                alert('Storage information not available');
            }
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupCustomBackgroundButton() {
        const button = document.getElementById('custom-bg-button');
        if (!button) return;
        
        const clickHandler = () => {
            if (typeof window.customBackground !== 'undefined' && window.customBackground.openPicker) {
                window.customBackground.openPicker();
            } else {
                this.managers.ui?.showToast('Background picker not available', 'error');
            }
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupClearCacheButton() {
        const button = document.getElementById('clear-cache-btn');
        if (!button) return;
        
        const clickHandler = async () => {
            if (!confirm('Clear all cached data? This will not delete your playlist.')) {
                return;
            }
            
            try {
                // Clean up blob URLs before clearing cache
                this.revokeBlobURLs();
                
                if (this.managers.audioBuffer) {
                    this.managers.audioBuffer.clearAllBuffers();
                }
                
                if (this.colorCache) {
                    this.colorCache.clear();
                }
                
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                }
                
                this.managers.ui?.showToast('Cache cleared successfully', 'success');
                this.debugLog('✅ Cache cleared', 'success');
            } catch (error) {
                this.debugLog(`Cache clear error: ${error.message}`, 'error');
                this.managers.ui?.showToast('Error clearing cache', 'error');
            }
        };
        
        button.addEventListener('click', clickHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: button,
            event: 'click',
            handler: clickHandler
        });
    }

    setupKeyboardShortcuts() {
        const keydownHandler = (e) => {
            // Ignore if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            const key = e.key.toLowerCase();
            
            switch (key) {
                case ' ':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                    
                case 'arrowright':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.playNext();
                    } else {
                        this.seekForward();
                    }
                    break;
                    
                case 'arrowleft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.playPrevious();
                    } else {
                        this.seekBackward();
                    }
                    break;
                    
                case 'arrowup':
                    e.preventDefault();
                    if (this.managers.volume) {
                        this.managers.volume.increaseVolume(0.1);
                    }
                    break;
                    
                case 'arrowdown':
                    e.preventDefault();
                    if (this.managers.volume) {
                        this.managers.volume.decreaseVolume(0.1);
                    }
                    break;
                    
                case 'm':
                    e.preventDefault();
                    if (this.managers.volume) {
                        this.managers.volume.toggleMute();
                    }
                    break;
                    
                case 's':
                    e.preventDefault();
                    this.toggleShuffle();
                    break;
                    
                case 'l':
                    e.preventDefault();
                    this.cycleLoopMode();
                    break;
                    
                case 'f':
                    if (this.managers.lyrics) {
                        e.preventDefault();
                        this.managers.lyrics.toggleFullscreen();
                    }
                    break;
                    
                case 'v':
                    if (this.managers.visualizerUI) {
                        e.preventDefault();
                        this.managers.visualizerUI.toggleFullscreen();
                    }
                    break;
                    
                case 'd':
                    e.preventDefault();
                    this.state.debugMode = !this.state.debugMode;
                    const debugBtn = document.getElementById('debug-toggle');
                    if (debugBtn) debugBtn.classList.toggle('active', this.state.debugMode);
                    if (this.elements.debugPanel) {
                        this.elements.debugPanel.classList.toggle('visible', this.state.debugMode);
                    }
                    break;
                    
                case 'c':
                    e.preventDefault();
                    const modes = ['full', 'compact', 'mini'];
                    const currentIndex = modes.indexOf(this.state.compactMode);
                    const newMode = modes[(currentIndex + 1) % modes.length];
                    this.state.compactMode = newMode;
                    this.applyCompactMode(newMode);
                    localStorage.setItem('compactMode', newMode);
                    break;
            }
        };
        
        document.addEventListener('keydown', keydownHandler);
        
        // CRITICAL: Track event listener
        this.resources.eventListeners.push({
            element: document,
            event: 'keydown',
            handler: keydownHandler
        });
        
        this.debugLog('✅ Keyboard shortcuts enabled', 'success');
    }

    togglePlayPause() {
        if (!this.elements.player) return;
        
        if (this.elements.player.paused) {
            this.elements.player.play().catch(e => 
                this.debugLog(`Play failed: ${e.message}`, 'error')
            );
        } else {
            this.elements.player.pause();
        }
    }

    seekForward() {
        if (!this.elements.player) return;
        const newTime = Math.min(
            this.elements.player.currentTime + 5,
            this.elements.player.duration || 0
        );
        this.elements.player.currentTime = newTime;
    }

    seekBackward() {
        if (!this.elements.player) return;
        const newTime = Math.max(this.elements.player.currentTime - 5, 0);
        this.elements.player.currentTime = newTime;
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
            this.debugLog(`⚠️ Background audio: ${error.message}`, 'warning');
        }
    }

    setupEventListeners() {
        // Audio player events
        const endedHandler = () => this.handleTrackEnded();
        const timeupdateHandler = () => this.handleTimeUpdate();
        const loadedmetadataHandler = () => this.handleMetadataLoaded();
        const errorHandler = (e) => this.handlePlayerError(e);
        const playHandler = () => this.handlePlay();
        const pauseHandler = () => this.handlePause();
        
        this.elements.player.addEventListener('ended', endedHandler);
        this.elements.player.addEventListener('timeupdate', timeupdateHandler);
        this.elements.player.addEventListener('loadedmetadata', loadedmetadataHandler);
        this.elements.player.addEventListener('error', errorHandler);
        this.elements.player.addEventListener('play', playHandler);
        this.elements.player.addEventListener('pause', pauseHandler);
        
        // CRITICAL: Track event listeners
        this.resources.eventListeners.push(
            { element: this.elements.player, event: 'ended', handler: endedHandler },
            { element: this.elements.player, event: 'timeupdate', handler: timeupdateHandler },
            { element: this.elements.player, event: 'loadedmetadata', handler: loadedmetadataHandler },
            { element: this.elements.player, event: 'error', handler: errorHandler },
            { element: this.elements.player, event: 'play', handler: playHandler },
            { element: this.elements.player, event: 'pause', handler: pauseHandler }
        );

        // Button events
        if (this.elements.loadButton) {
            const loadHandler = () => this.loadFiles();
            this.elements.loadButton.addEventListener('click', loadHandler);
            this.resources.eventListeners.push({ element: this.elements.loadButton, event: 'click', handler: loadHandler });
        }

        if (this.elements.folderButton) {
            const folderHandler = () => this.loadFromFolder();
            this.elements.folderButton.addEventListener('click', folderHandler);
            this.resources.eventListeners.push({ element: this.elements.folderButton, event: 'click', handler: folderHandler });
        }

        if (this.elements.prevButton) {
            const prevHandler = () => this.playPrevious();
            this.elements.prevButton.addEventListener('click', prevHandler);
            this.resources.eventListeners.push({ element: this.elements.prevButton, event: 'click', handler: prevHandler });
        }

        if (this.elements.nextButton) {
            const nextHandler = () => this.playNext();
            this.elements.nextButton.addEventListener('click', nextHandler);
            this.resources.eventListeners.push({ element: this.elements.nextButton, event: 'click', handler: nextHandler });
        }

        if (this.elements.playPauseButton) {
            const playPauseHandler = () => this.togglePlayPause();
            this.elements.playPauseButton.addEventListener('click', playPauseHandler);
            this.resources.eventListeners.push({ element: this.elements.playPauseButton, event: 'click', handler: playPauseHandler });
        }

        if (this.elements.shuffleButton) {
            const shuffleHandler = () => this.toggleShuffle();
            this.elements.shuffleButton.addEventListener('click', shuffleHandler);
            this.resources.eventListeners.push({ element: this.elements.shuffleButton, event: 'click', handler: shuffleHandler });
        }

        if (this.elements.loopButton) {
            const loopHandler = () => this.cycleLoopMode();
            this.elements.loopButton.addEventListener('click', loopHandler);
            this.resources.eventListeners.push({ element: this.elements.loopButton, event: 'click', handler: loopHandler });
        }

        if (this.elements.clearButton) {
            const clearHandler = () => this.clearPlaylist();
            this.elements.clearButton.addEventListener('click', clearHandler);
            this.resources.eventListeners.push({ element: this.elements.clearButton, event: 'click', handler: clearHandler });
        }

        if (this.elements.progressContainer) {
            this.setupProgressBar();
        }

        this.setupEqualizer();

        this.debugLog('✅ Event listeners registered', 'success');
    }

    setupProgressBar() {
        let seekDebounce = null;

        const mousedownHandler = (e) => {
            clearTimeout(seekDebounce);
            this.state.isSeekingProg = true;
            const wasPlaying = !this.elements.player.paused;
            this.elements.player.pause();

            seekDebounce = setTimeout(() => {
                if (wasPlaying) {
                    this.elements.player.play().catch(err => 
                        this.debugLog(`Resume error: ${err.message}`, 'error')
                    );
                }
            }, this.config.SEEK_DEBOUNCE_DELAY_MS);
            
            // Track timeout
            if (seekDebounce) {
                this.resources.timeouts.add(seekDebounce);
            }
        };

        const mousemoveHandler = (e) => {
            if (!this.state.isSeekingProg) return;
            this.updateProgressBar(e);
        };

        const mouseupHandler = (e) => {
            if (!this.state.isSeekingProg) return;
            this.state.isSeekingProg = false;
            const newTime = this.updateProgressBar(e);
            if (newTime !== null && !isNaN(newTime)) {
                try {
                    this.elements.player.currentTime = newTime;
                } catch (err) {
                    this.debugLog(`Seek failed: ${err.message}`, 'error');
                }
            }
        };

        this.elements.progressContainer.addEventListener('mousedown', mousedownHandler);
        document.addEventListener('mousemove', mousemoveHandler);
        document.addEventListener('mouseup', mouseupHandler);
        
        // CRITICAL: Track event listeners
        this.resources.eventListeners.push(
            { element: this.elements.progressContainer, event: 'mousedown', handler: mousedownHandler },
            { element: document, event: 'mousemove', handler: mousemoveHandler },
            { element: document, event: 'mouseup', handler: mouseupHandler }
        );
    }

    updateProgressBar(e) {
        const rect = this.elements.progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        let percent = clickX / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        
        const newTime = percent * this.elements.player.duration;
        this.elements.progressBar.style.width = `${percent * 100}%`;
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
            
            const inputHandler = (e) => {
                const value = parseFloat(e.target.value);
                if (display) display.textContent = `${value > 0 ? '+' : ''}${value} dB`;
                this.updateEqualizer(type, value);
            };
            
            slider.addEventListener('input', inputHandler);
            
            // CRITICAL: Track event listener
            this.resources.eventListeners.push({
                element: slider,
                event: 'input',
                handler: inputHandler
            });
        });

        if (this.elements.eqResetBtn) {
            const resetHandler = () => this.resetEqualizer();
            this.elements.eqResetBtn.addEventListener('click', resetHandler);
            this.resources.eventListeners.push({
                element: this.elements.eqResetBtn,
                event: 'click',
                handler: resetHandler
            });
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
                
                if (this.managers.audioBuffer) {
                    this.managers.audioBuffer.setPlaylist(this.state.playlist);
                }
                
                this.updatePlaylist();
                this.savePlaylistToStorage();
                
                this.managers.ui?.showToast(`Loaded ${result.playlist.length} tracks`, 'success');
                this.startBackgroundAnalysis();

                if (result.playlist.length > 0) {
                    this.loadTrack(0);
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(`Error loading: ${error.message}`, 'error');
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

                this.managers.ui?.showToast(`Loaded ${result.playlist.length} tracks`, 'success');
                this.startBackgroundAnalysis();

                if (result.playlist.length > 0) {
                    this.loadTrack(0);
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(`Error: ${error.message}`, 'error');
            }
        }
    }

    /**
     * CRITICAL: Clean up resources from previous track before loading new one
     */
    async loadTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        // CRITICAL NEW: Cleanup previous track resources
        this.cleanupCurrentTrack();
        
        // CRITICAL NEW: Tell performance manager about track change
        if (this.managers.performance) {
            this.managers.performance.cleanupForTrackChange();
        }

        this.state.currentTrackIndex = index;
        const track = this.state.playlist[index];

        this.debugLog(`Loading track ${index + 1}: ${track.fileName}`, 'info');

        if (track.metadata) {
            this.displayMetadata(track.metadata);
        } else {
            this.clearMetadata();
            this.elements.trackTitle.textContent = track.fileName;
        }

        if (this.managers.volume && track.metadata) {
            const trackId = `${track.metadata.artist || 'Unknown'}_${track.metadata.title || track.fileName}`;
            const hasAppliedSaved = this.managers.volume.applyTrackVolume(trackId);
            if (!hasAppliedSaved && track.analysis) {
                this.managers.volume.applyVolume(this.managers.volume.getVolume(), true, track.analysis);
            }
        }

        if (this.managers.autoEQ && this.managers.autoEQ.isEnabled() && track.analysis) {
            this.managers.autoEQ.applyAutoEQ(track);
        }

        if (this.managers.visualizer) {
            if (track.analysis) {
                this.managers.visualizer.setTrackAnalysis(track.analysis);
            } else {
                this.managers.visualizer.clearTrackAnalysis();
            }
        }
        
        if (this.managers.visualizerUI) {
            this.managers.visualizerUI.onTrackChange();
        }

        if (this.managers.audioBuffer && track.file) {
            const loadTrackIndex = index;
            
            // CRITICAL: Revoke old blob URL before creating new one
            if (this.elements.player.src && this.elements.player.src.startsWith('blob:')) {
                this.revokeBlobURL(this.elements.player.src);
            }

            this.managers.audioBuffer.getBuffer(loadTrackIndex).then(buffer => {
                if (this.state.currentTrackIndex !== loadTrackIndex) return;

                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                const bufferUrl = URL.createObjectURL(blob);
                
                // CRITICAL: Track new blob URL
                this.resources.blobURLs.add(bufferUrl);
                
                this.elements.player.src = bufferUrl;
                this.elements.player.load();

                if (track.analysis?.silence?.start > 0.1) {
                    this.elements.player.currentTime = track.analysis.silence.start;
                }

                this.elements.player.play().catch(e => 
                    this.debugLog(`Playback failed: ${e.message}`, 'warning')
                );
                
                this.managers.audioBuffer.preloadUpcoming(loadTrackIndex);
            }).catch(err => {
                this.elements.player.src = track.audioURL;
                this.elements.player.load();
                
                this.elements.player.play().catch(e => 
                    this.debugLog(`Playback failed: ${e.message}`, 'warning')
                );
            });
        } else {
            this.elements.player.src = track.audioURL;
            this.elements.player.load();
            
            this.elements.player.play().catch(e => 
                this.debugLog(`Playback failed: ${e.message}`, 'warning')
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

    /**
     * CRITICAL NEW: Clean up resources from current track
     */
    cleanupCurrentTrack() {
        // Revoke current blob URL if it exists
        if (this.elements.player.src && this.elements.player.src.startsWith('blob:')) {
            this.revokeBlobURL(this.elements.player.src);
        }
    }

    /**
     * CRITICAL NEW: Revoke a single blob URL
     */
    revokeBlobURL(url) {
        if (url && url.startsWith('blob:')) {
            try {
                URL.revokeObjectURL(url);
                this.resources.blobURLs.delete(url);
                this.debugLog(`🧹 Revoked blob URL: ${url.substring(0, 50)}...`, 'info');
            } catch (error) {
                this.debugLog(`⚠️ Failed to revoke blob URL: ${error.message}`, 'warning');
            }
        }
    }

    /**
     * CRITICAL NEW: Revoke all blob URLs
     */
    revokeBlobURLs() {
        this.resources.blobURLs.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (error) {
                // Silent fail
            }
        });
        this.resources.blobURLs.clear();
        this.debugLog(`🧹 Revoked all blob URLs`, 'info');
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
                `${count} track${count !== 1 ? 's' : ''} loaded`;
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
            const trackId = `${track.metadata?.artist || 'Unknown'}_${track.metadata?.title || track.fileName}`;
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
        this.managers.ui?.showToast(`Shuffle ${this.state.isShuffled ? 'on' : 'off'}`, 'info');
    }

    cycleLoopMode() {
        const modes = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(this.state.loopMode);
        this.state.loopMode = modes[(currentIndex + 1) % modes.length];

        if (this.elements.loopButton) {
            this.elements.loopButton.classList.toggle('active', this.state.loopMode !== 'off');
        }

        this.managers.ui?.showToast(`Loop: ${this.state.loopMode}`, 'info');
    }

    clearPlaylist() {
        if (confirm('Clear playlist?')) {
            if (this.managers.fileLoading) {
                this.managers.fileLoading.cleanupPlaylist(this.state.playlist);
            }

            if (this.managers.audioBuffer) {
                this.managers.audioBuffer.clearAllBuffers();
            }

            // CRITICAL: Revoke all blob URLs
            this.revokeBlobURLs();

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
            this.elements.progressBar.style.width = `${percent}%`;
            this.elements.currentTimeDisplay.textContent = this.formatTime(this.elements.player.currentTime);
        }

        if (this.managers.lyrics && this.managers.performance?.shouldUpdate('lyrics') !== false) {
            this.managers.lyrics.update(
                this.elements.player.currentTime, 
                this.state.compactMode
            );
        }
        
        if (this.managers.visualizerUI) {
            this.managers.visualizerUI.onTimeUpdate();
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
        
        if (this.managers.visualizerUI) {
            this.managers.visualizerUI.onPlayStateChange();
        }
        
        // CRITICAL: Tell performance manager about play state
        if (this.managers.performance) {
            this.managers.performance.setPlayState(true);
        }
    }

    handlePause() {
        if (window.backgroundAudioHandler) {
            backgroundAudioHandler.updatePlaybackState('paused');
        }
        
        if (this.managers.visualizerUI) {
            this.managers.visualizerUI.onPlayStateChange();
        }
        
        // CRITICAL: Tell performance manager about play state
        if (this.managers.performance) {
            this.managers.performance.setPlayState(false);
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
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    debugLog(message, type = 'info') {
        if (!this.state.debugMode && type !== 'error') return;

        const prefix = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
        console.log(`${prefix} ${message}`);

        if (this.elements.debugPanel && this.state.debugMode) {
            const entry = document.createElement('div');
            entry.className = `debug-entry debug-${type}`;
            entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
            this.elements.debugPanel.appendChild(entry);

            while (this.elements.debugPanel.children.length > 100) {
                this.elements.debugPanel.removeChild(this.elements.debugPanel.firstChild);
            }
        }
    }
    
    // ========== CRITICAL: CLEANUP & DESTROY ==========
    
    /**
     * CRITICAL NEW: Destroy the app and clean up all resources
     */
    destroy() {
        if (this.state.destroyed) {
            this.debugLog('⚠️ App already destroyed', 'warning');
            return;
        }
        
        this.debugLog('🧹 Destroying MusicPlayerApp...', 'info');
        
        // Stop playback
        if (this.elements.player) {
            this.elements.player.pause();
            this.elements.player.src = '';
        }
        
        // Revoke all blob URLs
        this.revokeBlobURLs();
        
        // Clear all intervals
        this.resources.intervals.forEach(id => clearInterval(id));
        this.resources.intervals.clear();
        
        // Clear all timeouts
        this.resources.timeouts.forEach(id => clearTimeout(id));
        this.resources.timeouts.clear();
        
        // Remove all event listeners
        this.resources.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.resources.eventListeners = [];
        
        // Destroy all managers
        if (this.managers.performance && typeof this.managers.performance.destroy === 'function') {
            this.managers.performance.destroy();
        }
        
        if (this.managers.visualizer && typeof this.managers.visualizer.destroy === 'function') {
            this.managers.visualizer.destroy();
        }
        
        if (this.managers.audioBuffer && typeof this.managers.audioBuffer.destroy === 'function') {
            this.managers.audioBuffer.destroy();
        }
        
        // Clear caches
        if (this.colorCache) {
            this.colorCache.clear();
        }
        
        this.state.destroyed = true;
        this.state.initialized = false;
        
        this.debugLog('✅ MusicPlayerApp destroyed successfully', 'success');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Initializing - MEMORY LEAK FIXED v2.0');
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

console.log('✅ Script loaded - MEMORY LEAK FIXED v2.0 - All features integrated!');
