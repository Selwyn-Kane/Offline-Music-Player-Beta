/* ============================================
   Ultimate Local Music Player - Complete Refactored Version
   ============================================ */

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
            this.debugLog('✅ Music player initialized', 'success');
        } catch (error) {
            this.debugLog(`❌ Init error: ${error.message}`, 'error');
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
            dropZone: document.getElementById('drop-zone')
        };

        if (this.elements.canvas) {
            this.elements.canvasCtx = this.elements.canvas.getContext('2d');
        }
    }

    async initializeManagers() {
        const debugLog = this.debugLog.bind(this);

        try {
            // Core managers
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
            }

            if (typeof ImageOptimizer !== 'undefined') {
                this.managers.imageOptimizer = new ImageOptimizer(debugLog);
            }

            if (typeof AudioBufferManager !== 'undefined') {
                this.managers.audioBuffer = new AudioBufferManager(debugLog);
            }

            // Parsers
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

            // Editors and analyzers
            if (typeof MetadataEditor !== 'undefined') {
                this.managers.metadataEditor = new MetadataEditor(debugLog);
            }

            if (typeof MusicAnalyzer !== 'undefined') {
                this.managers.analyzer = new MusicAnalyzer(debugLog);
            }

            // Storage
            if (typeof CustomMetadataStore !== 'undefined') {
                this.managers.customMetadata = new CustomMetadataStore();
            }

            if (typeof FolderPersistence !== 'undefined') {
                this.managers.folderPersistence = new FolderPersistence();
            }

            // File loading (CRITICAL)
            if (typeof EnhancedFileLoadingManager !== 'undefined') {
                this.managers.fileLoading = new EnhancedFileLoadingManager(debugLog);
                window.fileLoadingManager = this.managers.fileLoading;
            }

            // Playlist renderer (CRITICAL)
            if (typeof PlaylistRenderer !== 'undefined') {
                this.managers.playlistRenderer = new PlaylistRenderer({
                    playlistItems: this.elements.playlistItems,
                    onTrackClick: (index) => this.loadTrack(index),
                    onEditMetadata: (index) => this.editTrackMetadata(index),
                    debugLog
                });
            }

            // Lyrics manager (CRITICAL)
            if (typeof LyricsManager !== 'undefined') {
                this.managers.lyrics = new LyricsManager(
                    this.elements.lyricsDisplay,
                    this.elements.player,
                    debugLog
                );
                window.lyricsManager = this.managers.lyrics;
            }

            this.debugLog('✅ All managers initialized', 'success');
        } catch (error) {
            this.debugLog(`⚠️ Manager init warning: ${error.message}`, 'warning');
        }
    }

    initializeAudio() {
        try {
            if (typeof AudioPipeline !== 'undefined') {
                this.managers.audioPipeline = new AudioPipeline(this.debugLog.bind(this));
                window.audioPipeline = this.managers.audioPipeline;
            }

            if (typeof VolumeControl !== 'undefined' && this.elements.player) {
                this.managers.volume = new VolumeControl(this.elements.player, this.debugLog.bind(this));
                window.volumeControlInitialized = true;
            }

            if (typeof VisualizerManager !== 'undefined') {
                this.managers.visualizer = new VisualizerManager();
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
            this.debugLog(`⚠️ Audio init warning: ${error.message}`, 'warning');
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
            this.debugLog(`⚠️ Background audio error: ${error.message}`, 'warning');
        }
    }

    setupEventListeners() {
        // Player events
        this.elements.player.addEventListener('ended', () => this.handleTrackEnded());
        this.elements.player.addEventListener('timeupdate', () => this.handleTimeUpdate());
        this.elements.player.addEventListener('loadedmetadata', () => this.handleMetadataLoaded());
        this.elements.player.addEventListener('error', (e) => this.handlePlayerError(e));
        this.elements.player.addEventListener('play', () => this.handlePlay());
        this.elements.player.addEventListener('pause', () => this.handlePause());

        // Control buttons
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

        // Progress bar
        if (this.elements.progressContainer) {
            this.setupProgressBar();
        }

        // Equalizer
        this.setupEqualizer();

        // Debug toggle
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
                        this.debugLog(`Resume error: ${err.message}`, 'error')
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
                    this.debugLog(`Seek failed: ${err.message}`, 'error');
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
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (display) display.textContent = `${value > 0 ? '+' : ''}${value} dB`;
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
                this.managers.ui?.showToast('File loading manager not available', 'error');
                return;
            }

            // Use the file loading manager's method
            const result = await this.managers.fileLoading.loadFiles();
            
            if (result && result.success && result.playlist.length > 0) {
                this.state.playlist = result.playlist;
                this.state.currentTrackIndex = -1;
                
                this.updatePlaylist();
                this.savePlaylistToStorage();
                
                this.managers.ui?.showToast(`Loaded ${result.playlist.length} tracks`, 'success');
                this.debugLog(`✅ Loaded ${result.playlist.length} tracks`, 'success');

                // Start background analysis
                this.startBackgroundAnalysis();

                // Auto-play first track if configured
                if (result.playlist.length > 0) {
                    this.loadTrack(0);
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(`❌ Error loading files: ${error.message}`, 'error');
                this.managers.ui?.showToast('Error loading files', 'error');
            }
        }
    }

    async loadFromFolder() {
        try {
            if (!('showDirectoryPicker' in window)) {
                this.debugLog('Folder selection not supported', 'error');
                this.managers.ui?.showToast('Folder selection not supported', 'error');
                return;
            }

            const dirHandle = await window.showDirectoryPicker({
                mode: 'read',
                startIn: 'music'
            });

            this.state.folderHandle = dirHandle;
            this.debugLog(`Folder selected: ${dirHandle.name}`, 'success');

            if (!this.managers.fileLoading) {
                this.debugLog('File loading manager not available', 'error');
                return;
            }

            // Use fileLoadingManager to scan and load the folder
            const result = await this.managers.fileLoading.loadFromFolderHandle(dirHandle);

            if (result && result.success && result.playlist.length > 0) {
                this.state.playlist = result.playlist;
                this.state.currentTrackIndex = -1;

                this.updatePlaylist();
                this.savePlaylistToStorage();

                // Update folder persistence
                if (this.managers.folderPersistence && result.stats) {
                    await this.managers.folderPersistence.updateMetadata({
                        trackCount: result.stats.audioFiles,
                        hasLyrics: result.stats.withLyrics > 0,
                        hasAnalysis: result.stats.withAnalysis > 0,
                        totalSize: result.stats.totalSize || 0
                    });
                }

                this.managers.ui?.showToast(`Loaded ${result.playlist.length} tracks`, 'success');
                this.debugLog(`✅ Loaded ${result.playlist.length} tracks from folder`, 'success');

                // Start background analysis
                this.startBackgroundAnalysis();

                // Auto-play first track
                if (result.playlist.length > 0) {
                    this.loadTrack(0);
                }
            } else {
                this.managers.ui?.showToast('No audio files found', 'warning');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.debugLog(`❌ Error loading folder: ${error.message}`, 'error');
                this.managers.ui?.showToast(`Error loading folder: ${error.message}`, 'error');
            }
        }
    }

    async loadTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        this.state.currentTrackIndex = index;
        const track = this.state.playlist[index];

        this.debugLog(`Loading track ${index + 1}: ${track.fileName}`, 'info');

        // Display metadata
        if (track.metadata) {
            this.displayMetadata(track.metadata);
        } else {
            this.clearMetadata();
            this.elements.trackTitle.textContent = track.fileName;
        }

        // Apply track volume
        if (this.managers.volume && track.metadata) {
            const trackId = `${track.metadata.artist || 'Unknown'}_${track.metadata.title || track.fileName}`;
            const hasAppliedSaved = this.managers.volume.applyTrackVolume(trackId);
            if (!hasAppliedSaved && track.analysis) {
                this.managers.volume.applyVolume(this.managers.volume.getVolume(), true, track.analysis);
            }
        }

        // Apply Auto-EQ
        if (this.managers.autoEQ && this.managers.autoEQ.enabled && track.analysis) {
            this.managers.autoEQ.applyAutoEQ(track);
        }

        // Update visualizer
        if (this.managers.visualizer) {
            if (track.analysis) {
                this.managers.visualizer.setTrackAnalysis(track.analysis);
                this.debugLog(`🎨 Enhanced visualizer: BPM=${track.analysis.bpm}, Energy=${(track.analysis.energy * 100).toFixed(0)}%`, 'success');
            } else {
                this.managers.visualizer.clearTrackAnalysis();
            }
        }

        // Load audio
        if (this.managers.audioBuffer) {
            const loadTrackIndex = index;
            
            // Clear previous buffer URL
            if (this.elements.player.src && this.elements.player.src.startsWith('blob:')) {
                URL.revokeObjectURL(this.elements.player.src);
            }

            this.managers.audioBuffer.getBuffer(loadTrackIndex).then(buffer => {
                if (this.state.currentTrackIndex !== loadTrackIndex) {
                    this.debugLog('Track changed during load, ignoring', 'warning');
                    return;
                }

                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                const bufferUrl = URL.createObjectURL(blob);
                this.elements.player.src = bufferUrl;
                this.elements.player.load();

                // Skip initial silence if detected
                if (track.analysis?.silence?.start > 0.1) {
                    const skipTime = track.analysis.silence.start;
                    this.elements.player.currentTime = skipTime;
                    this.debugLog(`⏭️ Skipped ${skipTime.toFixed(2)}s of silence`, 'success');
                }

                this.elements.player.play().catch(e => 
                    this.debugLog(`Playback failed: ${e.message}`, 'warning')
                );
                
                this.managers.audioBuffer.preloadUpcoming(loadTrackIndex);
            }).catch(err => {
                this.debugLog(`Buffer load failed, using direct URL: ${err.message}`, 'warning');
                this.elements.player.src = track.audioURL;
                this.elements.player.load();
                this.elements.player.play().catch(e => 
                    this.debugLog(`Direct playback failed: ${e.message}`, 'warning')
                );
            });
        } else {
            this.elements.player.src = track.audioURL;
            this.elements.player.load();
            this.elements.player.play().catch(e => 
                this.debugLog(`Playback failed: ${e.message}`, 'warning')
            );
        }

        // Load lyrics (VTT)
        if (track.vtt && this.managers.vtt && this.managers.lyrics) {
            this.debugLog(`Loading VTT: ${track.vtt.name}`, 'info');
            
            try {
                const parsedCues = await this.managers.vtt.loadVTTFile(track.vtt);
                this.managers.lyrics.loadLyrics(parsedCues);
            } catch (err) {
                this.debugLog(`VTT load failed: ${err.message}`, 'error');
                this.managers.lyrics.clearLyrics();
            }
        } else if (this.managers.lyrics) {
            this.managers.lyrics.clearLyrics();
            this.debugLog(`No VTT file for ${track.fileName}`, 'warning');
        }

        // Update playlist highlight
        if (this.managers.playlistRenderer) {
            this.managers.playlistRenderer.updateHighlight(this.state.currentTrackIndex);
        }

        // Enable controls
        if (this.elements.prevButton) this.elements.prevButton.disabled = false;
        if (this.elements.nextButton) this.elements.nextButton.disabled = false;

        // Update Media Session
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

        if (this.managers.visualizer) {
            this.managers.visualizer.clearTrackAnalysis();
        }
    }

    updatePlaylist() {
        if (this.managers.playlistRenderer) {
            this.managers.playlistRenderer.setPlaylist(this.state.playlist, this.state.currentTrackIndex);
            this.managers.playlistRenderer.render();
        }

        this.updatePlaylistStatus();
    }

    updatePlaylistStatus() {
        const count = this.state.playlist.length;
        if (this.elements.playlistStatus) {
            this.elements.playlistStatus.textContent = 
                `${count} track${count !== 1 ? 's' : ''} loaded ${this.state.isShuffled ? '(Shuffled)' : ''}`;
        }

        if (this.elements.clearButton) {
            this.elements.clearButton.disabled = count === 0;
        }
        if (this.elements.shuffleButton) {
            this.elements.shuffleButton.disabled = count === 0;
        }
        if (this.elements.loopButton) {
            this.elements.loopButton.disabled = count === 0;
        }
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
                backgroundAudioHandler.updateNowPlaying(metadata);
            }
        }
    }

    playNext() {
        if (this.state.playlist.length === 0) return;

        // Remember volume for current track
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
                    this.debugLog('Playlist finished', 'info');
                    return;
                }
            }
        }

        this.loadTrack(nextIndex);
    }

    playPrevious() {
        if (this.state.playlist.length === 0) return;

        // Remember volume for current track
        if (this.state.currentTrackIndex !== -1 && this.managers.volume) {
            const track = this.state.playlist[this.state.currentTrackIndex];
            const trackId = `${track.metadata?.artist || 'Unknown'}_${track.metadata?.title || track.fileName}`;
            this.managers.volume.rememberTrackVolume(trackId, this.managers.volume.getVolume());
        }

        if (this.state.currentTrackIndex > 0) {
            this.loadTrack(this.state.currentTrackIndex - 1);
        } else if (this.state.loopMode === 'all') {
            this.loadTrack(this.state.playlist.length - 1);
        }
    }

    handleTrackEnded() {
        if (this.state.loopMode === 'one') {
            this.debugLog('Looping current track', 'info');
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
        
        const status = this.state.isShuffled ? 'on' : 'off';
        this.managers.ui?.showToast(`Shuffle ${status}`, 'info');
        this.debugLog(`🔀 Shuffle ${status}`, 'info');
        this.updatePlaylistStatus();
    }

    cycleLoopMode() {
        const modes = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(this.state.loopMode);
        this.state.loopMode = modes[(currentIndex + 1) % modes.length];

        const icons = { off: '🔁', all: '🔁', one: '🔂' };
        if (this.elements.loopButton) {
            const iconSpan = this.elements.loopButton.querySelector('.control-icon');
            const labelSpan = this.elements.loopButton.querySelector('.control-label');
            
            if (iconSpan) iconSpan.textContent = icons[this.state.loopMode];
            if (labelSpan) {
                const labels = { off: 'Loop Off', all: 'Loop All', one: 'Loop One' };
                labelSpan.textContent = labels[this.state.loopMode];
            }
            
            this.elements.loopButton.classList.toggle('active', this.state.loopMode !== 'off');
        }

        this.managers.ui?.showToast(`Loop: ${this.state.loopMode}`, 'info');
    }

    clearPlaylist() {
        if (confirm('Clear entire playlist?')) {
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

            this.debugLog('Playlist cleared', 'warning');
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
            const lyricsSettings = this.managers.performance?.getLyricsSettings() || {};
            this.managers.lyrics.update(this.elements.player.currentTime, this.state.compactMode, lyricsSettings);
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

        if (this.managers.performance) {
            this.managers.performance.setPlayState(true);
        }

        this.updateMediaSession();
    }

    handlePause() {
        if (this.managers.audioPipeline?.isInitialized) {
            if (this.managers.audioPipeline.audioContext.state === 'running') {
                this.managers.audioPipeline.suspend();
            }
        }

        if (window.backgroundAudioHandler) {
            backgroundAudioHandler.updatePlaybackState('paused');
        }

        if (this.managers.performance) {
            this.managers.performance.setPlayState(false);
        }

        if (this.managers.crossfade) {
            this.managers.crossfade.cancelFade();
        }

        this.updateMediaSession();
    }

    handlePlayerError(e) {
        if (this.state.currentTrackIndex === -1 || !this.state.playlist[this.state.currentTrackIndex]) return;

        const trackInfo = this.state.playlist[this.state.currentTrackIndex];
        
        if (this.managers.errorRecovery) {
            const errorInfo = this.managers.errorRecovery.handleAudioError(this.elements.player, trackInfo);
            
            if (errorInfo && !errorInfo.hasRecovery) {
                alert(`Cannot play this track: ${errorInfo.errorMessage}`);
            }
        } else {
            this.debugLog(`Player error: ${e.target.error?.message || 'Unknown'}`, 'error');
        }
    }

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

        if (this.managers.audioPipeline?.filters) {
            const { bass, mid, treble } = this.managers.audioPipeline.filters;
            if (bass) bass.gain.value = 0;
            if (mid) mid.gain.value = 0;
            if (treble) treble.gain.value = 0;
        }

        this.managers.ui?.showToast('Equalizer reset', 'info');
    }

    async startBackgroundAnalysis() {
        if (this.state.backgroundAnalysisRunning || this.state.playlist.length === 0) return;
        if (!this.managers.analyzer || typeof this.managers.analyzer.analyzeTrack !== 'function') {
            this.debugLog('⚠️ Analyzer not available', 'warning');
            return;
        }

        this.state.backgroundAnalysisRunning = true;
        this.debugLog('🔍 Starting background analysis...', 'info');

        const needsAnalysis = this.state.playlist
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => !track.hasDeepAnalysis && !track.analysis);

        if (needsAnalysis.length === 0) {
            this.state.backgroundAnalysisRunning = false;
            return;
        }

        const batchSize = 3;
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
            this.updatePlaylist();
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (analyzedCount > 0 && typeof this.managers.analyzer.saveAnalysesToStorage === 'function') {
            try {
                this.managers.analyzer.saveAnalysesToStorage();
                this.debugLog(`✅ Analyzed ${analyzedCount} tracks`, 'success');
            } catch (error) {
                this.debugLog(`⚠️ Could not save analyses: ${error.message}`, 'warning');
            }
        }

        this.state.backgroundAnalysisRunning = false;
    }

    savePlaylistToStorage() {
        try {
            const playlistData = this.state.playlist.map(track => ({
                fileName: track.fileName,
                metadata: track.metadata,
                hasVTT: !!track.vtt,
                duration: track.duration
            }));

            localStorage.setItem('savedPlaylist', JSON.stringify(playlistData));
            localStorage.setItem('playlistTimestamp', Date.now().toString());
            this.debugLog(`Playlist saved: ${playlistData.length} tracks`, 'info');
        } catch (error) {
            this.debugLog(`Failed to save playlist: ${error.message}`, 'error');
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

            this.debugLog('✅ State restored', 'success');
        } catch (error) {
            this.debugLog(`⚠️ State restoration error: ${error.message}`, 'warning');
        }
    }

    editTrackMetadata(index) {
        const track = this.state.playlist[index];
        if (!track || !this.managers.metadataEditor || !this.managers.customMetadata) return;

        const currentMetadata = {
            title: track.metadata?.title || track.fileName,
            artist: track.metadata?.artist || 'Unknown Artist',
            album: track.metadata?.album || 'Unknown Album'
        };

        this.managers.metadataEditor.openEditor(index, currentMetadata, (trackIndex, newMetadata) => {
            const file = this.state.playlist[trackIndex].fileName;
            const size = this.state.playlist[trackIndex].duration || 0;

            this.managers.customMetadata.save(file, size, newMetadata);

            this.state.playlist[trackIndex].metadata = {
                ...this.state.playlist[trackIndex].metadata,
                ...newMetadata,
                hasMetadata: true
            };

            this.updatePlaylist();

            if (trackIndex === this.state.currentTrackIndex) {
                this.displayMetadata(this.state.playlist[trackIndex].metadata);
            }

            this.savePlaylistToStorage();
            this.debugLog(`✅ Metadata updated for track ${trackIndex + 1}`, 'success');
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

        const prefix = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type] || 'ℹ️';

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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.musicPlayerApp = new MusicPlayerApp();
    window.musicPlayerApp.init();
});

// Expose helper for visualizer
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
