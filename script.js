/* ============================================
   Ultimate Local Music Player — Clean v4.0
   ============================================ */

// ─── Audio Chain Reconnection Helper ─────────────────────────────────────────
// Chain: source → bass → mid → treble → volumeGain → compressor → makeupGain → destination
window.reconnectAudioChainWithVolumeControl = function () {
    try {
        if (
            !window.sharedAudioSource  ||
            !window.sharedBassFilter   ||
            !window.sharedMidFilter    ||
            !window.sharedTrebleFilter ||
            !window.audioContext
        ) {
            console.log('⏳ Audio pipeline not ready for reconnection');
            return false;
        }
        if (!window.volumeGainNode || !window.volumeCompressor || !window.volumeMakeupGain) {
            console.log('⏳ Volume control nodes not ready');
            return false;
        }

        console.log('🔗 Reconnecting audio chain…');

        [
            window.sharedAudioSource,
            window.sharedBassFilter,
            window.sharedMidFilter,
            window.sharedTrebleFilter,
            window.volumeGainNode,
            window.volumeCompressor,
            window.volumeMakeupGain,
        ].forEach(n => { try { n.disconnect(); } catch (_) {} });

        window.sharedAudioSource.connect(window.sharedBassFilter);
        window.sharedBassFilter.connect(window.sharedMidFilter);
        window.sharedMidFilter.connect(window.sharedTrebleFilter);
        window.sharedTrebleFilter.connect(window.volumeGainNode);
        window.volumeGainNode.connect(window.volumeCompressor);
        window.volumeCompressor.connect(window.volumeMakeupGain);
        window.volumeMakeupGain.connect(window.audioContext.destination);

        console.log('✅ Audio chain reconnected');
        return true;
    } catch (err) {
        console.error('❌ Audio chain reconnection failed:', err);
        return false;
    }
};

// ─── MusicPlayerApp ──────────────────────────────────────────────────────────
class MusicPlayerApp {

    constructor() {
        this.state = {
            playlist:                  [],
            currentTrackIndex:         -1,
            isShuffled:                false,
            loopMode:                  'off',
            debugMode:                 false,
            isSeekingProg:             false,
            compactMode:               'full',
            folderHandle:              null,
            backgroundAnalysisRunning: false,
            stickyMode:                false,
            initialized:               false,
            destroyed:                 false,
        };

        this.config = {
            SEEK_DEBOUNCE_DELAY_MS: 100,
        };

        this.managers  = {};
        this.elements  = {};
        this.colorCache = new Map();
        window.colorCache = this.colorCache;

        this.resources = {
            blobURLs:       new Set(),
            eventListeners: [],           // { element, event, handler }
            intervals:      new Set(),
            timeouts:       new Set(),
        };

        // rAF state — drives progress bar + lyrics while playing
        this._raf = {
            id:           null,
            lastProgress: 0,
            lastLyrics:   0,
            lastPercent:  -1,
        };
        this._boundRafTick = this._rafTick.bind(this);
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    async init() {
        if (this.state.initialized) {
            this.debugLog('⚠️ Already initialized', 'warning');
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
            this.connectManagersToPerformance();
            this.state.initialized = true;
            this.debugLog('✅ Music player initialized (Clean v4.0)', 'success');
        } catch (err) {
            this.debugLog(`❌ Init error: ${err.message}`, 'error');
            console.error(err);
        }
    }

    // ── Element cache ─────────────────────────────────────────────────────────

    cacheElements() {
        const $ = id => document.getElementById(id);

        this.elements = {
            // Core player
            player:           $('audio-player'),
            playPauseButton:  $('play-pause-button'),
            loadButton:       $('load-button'),
            folderButton:     $('folder-button'),
            prevButton:       $('prev-button'),
            nextButton:       $('next-button'),
            shuffleButton:    $('shuffle-button'),
            loopButton:       $('loop-button'),
            clearButton:      $('clear-playlist'),

            // Playlist
            playlistStatus:   $('playlist-status'),
            playlistItems:    $('playlist-items'),
            playlistSearch:   $('playlist-search'),
            jumpToCurrentBtn: $('jump-to-current'),

            // Now-playing metadata
            coverArt:         $('cover-art'),
            coverPlaceholder: $('cover-placeholder'),
            trackTitle:       $('track-title'),
            trackArtist:      $('track-artist'),
            trackAlbum:       $('track-album'),

            // Progress
            progressContainer:    $('custom-progress-container'),
            progressBar:          $('progress-bar'),
            currentTimeDisplay:   $('current-time'),
            durationDisplay:      $('duration'),

            // Lyrics
            lyricsDisplay:              $('lyrics-display'),
            exportLyricsButton:         $('export-lyrics-button'),
            fullscreenLyricsContainer:  $('fullscreen-lyrics'),
            fullscreenLyricsContent:    $('fullscreen-lyrics-content'),
            fullscreenLyricsToggle:     $('fullscreen-lyrics-toggle'),
            fullscreenLyricsCloseBtn:   $('lyrics-close-btn'),
            fullscreenLyricsPrevBtn:    $('lyrics-prev-btn'),
            fullscreenLyricsNextBtn:    $('lyrics-next-btn'),

            // EQ
            eqBassSlider:   $('eq-bass'),
            eqMidSlider:    $('eq-mid'),
            eqTrebleSlider: $('eq-treble'),
            bassValue:      $('bass-value'),
            midValue:       $('mid-value'),
            trebleValue:    $('treble-value'),
            eqResetBtn:     $('eq-reset'),

            // Misc
            debugToggle:       $('debug-toggle'),
            debugPanel:        $('debug-panel'),
            dropZone:          $('drop-zone'),
            metadataContainer: $('metadata-container'),
            mainContent:       $('main-content'),

            // ── Sections controlled by view-mode ─────────────────────────────
            // compact + full
            sectionPlaylist:   $('playlist-container'),
            sectionVolume:     $('volume-container'),
            // full only
            sectionLyrics:     $('lyrics-container'),
            sectionEQ:         $('eq-container'),
            sectionDropZone:   $('drop-zone'),          // alias for clarity
        };
    }

    // ── View mode ─────────────────────────────────────────────────────────────

    /**
     * Apply a view mode, showing/hiding sections accordingly.
     *
     *  mini    → metadata window only
     *  compact → mini + playlist + volume
     *  full    → everything
     */
    applyViewMode(mode) {
        if (!this.elements.mainContent) return;

        const compact = (mode === 'compact' || mode === 'full');
        const full    =  mode === 'full';

        // Compact-and-above sections
        this._setVisible(this.elements.sectionPlaylist, compact);
        this._setVisible(this.elements.sectionVolume,   compact);

        // Full-only sections
        this._setVisible(this.elements.sectionLyrics,   full);
        this._setVisible(this.elements.sectionEQ,       full);
        this._setVisible(this.elements.dropZone,        full);

        // CSS class hook for any supplementary stylesheet rules
        this.elements.mainContent.classList.remove('mode-full', 'mode-compact', 'mode-mini');
        this.elements.mainContent.classList.add(`mode-${mode}`);

        this.managers.performance?.setMode(mode);
        this.debugLog(`View mode → ${mode}`, 'info');
    }

    /** Null-safe show/hide helper. '' restores the element's natural display. */
    _setVisible(el, visible) {
        if (el) el.style.display = visible ? '' : 'none';
    }

    // ── rAF loop (progress bar + lyrics sync) ────────────────────────────────

    _rafStart() {
        if (this._raf.id !== null) return;
        this._raf.id = requestAnimationFrame(this._boundRafTick);
    }

    _rafStop() {
        if (this._raf.id !== null) {
            cancelAnimationFrame(this._raf.id);
            this._raf.id = null;
        }
    }

    _rafTick(ts) {
        // Hard stop conditions
        if (this.state.destroyed || !this.elements.player || this.elements.player.paused) {
            this._raf.id = null;
            return;
        }

        // ── Progress bar (capped at ~15 fps, skip tiny changes) ───────────────
        if (ts - this._raf.lastProgress >= 67) {
            this._raf.lastProgress = ts;
            this._renderProgress();
        }

        // ── Lyrics (capped at ~10 fps, only when lyrics section is visible) ───
        if (
            this.managers.lyrics &&
            this.state.compactMode === 'full' &&
            ts - this._raf.lastLyrics >= 100
        ) {
            this._raf.lastLyrics = ts;
            this.managers.lyrics.update(this.elements.player.currentTime, 'full');
        }

        this._raf.id = requestAnimationFrame(this._boundRafTick);
    }

    /** Write progress to DOM only when the value has changed meaningfully. */
    _renderProgress() {
        const dur = this.elements.player.duration;
        if (!isFinite(dur) || dur <= 0) return;

        const ct  = this.elements.player.currentTime;
        const pct = (ct / dur) * 100;

        if (Math.abs(pct - this._raf.lastPercent) < 0.05) return;
        this._raf.lastPercent = pct;

        this.elements.progressBar.style.width        = `${pct}%`;
        this.elements.currentTimeDisplay.textContent  = this.formatTime(ct);
    }

    // ── Manager initialisation ────────────────────────────────────────────────

    async initializeManagers() {
        const log = this.debugLog.bind(this);

        try {
            if (typeof createMusicPlayerWorkerManager !== 'undefined') {
                this.managers.worker = createMusicPlayerWorkerManager(log);
                window.workerManager = this.managers.worker;
            }

            if (typeof UIManager !== 'undefined') {
                this.managers.ui = new UIManager(log);
                window.uiManager = this.managers.ui;
            }

            if (typeof PerformanceManager !== 'undefined') {
                this.managers.performance = new PerformanceManager(log);
                window.perfManager = this.managers.performance;
            }

            if (typeof ImageOptimizer !== 'undefined') {
                this.managers.imageOptimizer = new ImageOptimizer(log);
            }

            if (typeof AudioBufferManager !== 'undefined') {
                this.managers.audioBuffer = new AudioBufferManager(log);
                this.managers.audioBuffer.setPlaylist(this.state.playlist);

                this.managers.audioBuffer.setCallbacks({
                    onLoadStart: (_i, name) => {
                        if (this.elements.playlistStatus)
                            this.elements.playlistStatus.textContent = `Loading: ${name}`;
                    },
                    onLoadProgress: (_i, name, loaded, total) => {
                        if (this.elements.playlistStatus) {
                            const pct = Math.round((loaded / total) * 100);
                            this.elements.playlistStatus.textContent =
                                `Loading: ${name} (${pct}%)`;
                        }
                    },
                    onLoadComplete: () => { /* reset by updatePlaylistStatus() */ },
                    onLoadError: (_i, name, err) => {
                        this.debugLog(`❌ Buffer load failed: ${name} — ${err.message}`, 'error');
                        this.managers.ui?.showToast(`Failed to load: ${name}`, 'error');
                    },
                    onMemoryWarning: pct => {
                        this.debugLog(`⚠️ Buffer memory at ${pct.toFixed(1)}%`, 'warning');
                    },
                });
            }

            if (typeof MetadataParser    !== 'undefined') this.managers.metadata      = new MetadataParser(log);
            if (typeof VTTParser         !== 'undefined') this.managers.vtt           = new VTTParser(log);
            if (typeof ErrorRecovery     !== 'undefined') this.managers.errorRecovery = new ErrorRecovery(log);
            if (typeof AnalysisTextParser!== 'undefined') this.managers.analysisParser= new AnalysisTextParser(log);
            if (typeof MetadataEditor    !== 'undefined') this.managers.metadataEditor= new MetadataEditor(log);
            if (typeof MusicAnalyzer     !== 'undefined') this.managers.analyzer      = new MusicAnalyzer(log);
            if (typeof CustomMetadataStore!=='undefined') this.managers.customMetadata= new CustomMetadataStore();
            if (typeof FolderPersistence !== 'undefined') this.managers.folderPersistence = new FolderPersistence();

            if (typeof EnhancedFileLoadingManager !== 'undefined') {
                this.managers.fileLoading = new EnhancedFileLoadingManager(log);
                this.managers.fileLoading.init({
                    metadataParser:      this.managers.metadata,
                    vttParser:           this.managers.vtt,
                    analysisParser:      this.managers.analysisParser,
                    customMetadataStore: this.managers.customMetadata,
                    analyzer:            this.managers.analyzer,
                    workerManager:       this.managers.worker,
                    imageOptimizer:      this.managers.imageOptimizer,
                });
                window.fileLoadingManager = this.managers.fileLoading;
                this.debugLog('✅ FileLoadingManager initialized', 'success');
            }

            if (typeof EnhancedPlaylistRenderer !== 'undefined') {
                this.managers.playlistRenderer = new EnhancedPlaylistRenderer(log);
                this.managers.playlistRenderer.init({
                    playlistContainer: document.getElementById('playlist-container'),
                    playlistItems:     this.elements.playlistItems,
                    playlistSearch:    this.elements.playlistSearch,
                    clearButton:       this.elements.clearButton,
                    jumpToCurrentBtn:  this.elements.jumpToCurrentBtn,
                });
                this.managers.playlistRenderer.setCallbacks({
                    onTrackClick: idx => this.loadTrack(idx),
                    onEditClick:  idx => this.editTrackMetadata(idx),
                });
                window.playlistRenderer = this.managers.playlistRenderer;
                this.debugLog('✅ PlaylistRenderer initialized', 'success');
            }

            if (typeof LyricsManager !== 'undefined') {
                this.managers.lyrics = new LyricsManager(log);
                this.managers.lyrics.init({
                    lyricsDisplay:       this.elements.lyricsDisplay,
                    exportButton:        this.elements.exportLyricsButton,
                    fullscreenToggle:    this.elements.fullscreenLyricsToggle,
                    fullscreenContainer: this.elements.fullscreenLyricsContainer,
                    fullscreenContent:   this.elements.fullscreenLyricsContent,
                    fullscreenCloseBtn:  this.elements.fullscreenLyricsCloseBtn,
                    fullscreenPrevBtn:   this.elements.fullscreenLyricsPrevBtn,
                    fullscreenNextBtn:   this.elements.fullscreenLyricsNextBtn,
                }, this.elements.player);

                this.managers.lyrics.onNavigationRequest = action => {
                    if (action === 'previous') this.playPrevious();
                    else if (action === 'next') this.playNext();
                };
                this.managers.lyrics.onGetTrackInfo = () => {
                    if (this.state.currentTrackIndex === -1) return {};
                    const t = this.state.playlist[this.state.currentTrackIndex];
                    return {
                        title:  t.metadata?.title  || t.fileName,
                        artist: t.metadata?.artist || 'Unknown Artist',
                    };
                };
                window.lyricsManager = this.managers.lyrics;
                this.debugLog('✅ LyricsManager initialized', 'success');
            }

            this.debugLog('✅ All managers initialized', 'success');
        } catch (err) {
            this.debugLog(`⚠️ Manager init warning: ${err.message}`, 'warning');
        }
    }

    connectManagersToPerformance() {
        const pm = this.managers.performance;
        if (!pm) { this.debugLog('⚠️ No performance manager', 'warning'); return; }

        if (this.managers.audioBuffer)  pm.connectManager('audioBuffer',  this.managers.audioBuffer);
        if (this.managers.lyrics)        pm.connectManager('lyrics',        this.managers.lyrics);
        if (this.managers.audioPipeline) pm.connectManager('audioPipeline', this.managers.audioPipeline);
        if (this.managers.ui)            pm.connectManager('ui',            this.managers.ui);

        this.debugLog('✅ Managers connected to performance manager', 'success');
    }

    // ── Audio initialisation ──────────────────────────────────────────────────

    initializeAudio() {
        try {
            if (typeof AudioPipeline !== 'undefined' && this.elements.player) {
                this.managers.audioPipeline = new AudioPipeline(this.debugLog.bind(this));
                this.managers.audioPipeline.init(this.elements.player);

                window.audioPipeline      = this.managers.audioPipeline;
                window.audioContext       = this.managers.audioPipeline.audioContext;
                window.sharedAudioSource  = this.managers.audioPipeline.audioSource;
                window.sharedBassFilter   = this.managers.audioPipeline.bassFilter;
                window.sharedMidFilter    = this.managers.audioPipeline.midFilter;
                window.sharedTrebleFilter = this.managers.audioPipeline.trebleFilter;

                document.dispatchEvent(new CustomEvent('audioContextReady'));
                this.debugLog('✅ AudioPipeline initialized', 'success');
                this.initializeAudioManagers();
            }

            if (typeof VolumeControl !== 'undefined' && this.elements.player) {
                this.managers.volume = new VolumeControl(
                    this.elements.player, this.debugLog.bind(this)
                );
                window.volumeControl = this.managers.volume;
            }

            if (typeof CrossfadeManager !== 'undefined') {
                this.managers.crossfade = new CrossfadeManager(
                    this.elements.player, this.debugLog.bind(this)
                );
            }

            if (window.backgroundAudioHandler) this.initializeBackgroundAudio();

            this.debugLog('✅ Audio system initialized', 'success');
        } catch (err) {
            this.debugLog(`⚠️ Audio init: ${err.message}`, 'warning');
        }
    }

    initializeAudioManagers() {
        const log = this.debugLog.bind(this);
        try {
            if (
                typeof AudioPresetsManager !== 'undefined' &&
                this.managers.audioPipeline?.isInitialized
            ) {
                this.managers.audioPresets = new AudioPresetsManager(
                    this.managers.audioPipeline.bassFilter,
                    this.managers.audioPipeline.midFilter,
                    this.managers.audioPipeline.trebleFilter,
                    log
                );
                window.audioPresetsManager = this.managers.audioPresets;

                this.populateEQPresetDropdown();
                this.setupEQPresetSelector();
                this.managers.audioPresets.loadSavedPreset();
                this.debugLog('✅ AudioPresetsManager initialized', 'success');
            }

            if (typeof AutoEQManager !== 'undefined' && this.managers.audioPresets) {
                this.managers.autoEQ = new AutoEQManager(this.managers.audioPresets, log);
                window.autoEQManager = this.managers.autoEQ;
                this.debugLog('✅ AutoEQManager initialized', 'success');
            }
        } catch (err) {
            this.debugLog(`⚠️ Audio manager init: ${err.message}`, 'warning');
            console.error(err);
        }
    }

    // ── EQ preset helpers ─────────────────────────────────────────────────────

    populateEQPresetDropdown() {
        const dd = document.getElementById('eq-preset-select');
        if (!dd || !this.managers.audioPresets) return;

        const presets = this.managers.audioPresets.getPresetList();
        while (dd.options.length > 1) dd.remove(1);

        presets.forEach(p => {
            const opt   = document.createElement('option');
            opt.value   = p.id;
            opt.textContent = p.name;
            opt.title   = `${p.description}\n${p.philosophy}`;
            dd.appendChild(opt);
        });

        this.debugLog(`✅ Populated ${presets.length} EQ presets`, 'info');
    }

    setupEQPresetSelector() {
        const dd = document.getElementById('eq-preset-select');
        if (!dd || !this.managers.audioPresets) return;

        const handler = e => {
            const id = e.target.value;
            if (!id) return;

            const track    = this.state.playlist[this.state.currentTrackIndex];
            const analysis = track?.analysis ?? null;
            this.managers.audioPresets.applyPreset(id, analysis);
            this.managers.audioPresets.saveCurrentPreset();

            if (this.managers.autoEQ?.isEnabled()) {
                this.managers.autoEQ.setEnabled(false);
                const btn = document.getElementById('auto-eq-button');
                if (btn) {
                    btn.classList.remove('active');
                    btn.querySelector('.sidebar-label').textContent = 'Auto-EQ Off';
                }
            }
            this.debugLog(`🎛️ Applied preset: ${id}`, 'success');
        };

        dd.addEventListener('change', handler);
        this.resources.eventListeners.push({ element: dd, event: 'change', handler });
    }

    // ── Sidebar buttons ───────────────────────────────────────────────────────

    setupSidebarButtons() {
        this.setupAutoEQButton();
        this.setupVolumeBoostButton();
        this.setupCrossfadeButton();
        this.setupDebugButton();
        this.setupCompactToggle();
        this.setupStickyToggle();
        this.setupStorageStatsButton();
        this.setupCustomBackgroundButton();
        this.setupClearCacheButton();
        this.debugLog('✅ Sidebar buttons configured', 'success');
    }

    setupAutoEQButton() {
        const btn = document.getElementById('auto-eq-button');
        if (!btn || !this.managers.autoEQ) return;

        if (localStorage.getItem('autoEQEnabled') === 'true') {
            this.managers.autoEQ.setEnabled(true);
            btn.classList.add('active');
            btn.querySelector('.sidebar-label').textContent = 'Auto-EQ On';
        }
        btn.disabled = false;

        const handler = () => {
            const on = this.managers.autoEQ.toggle();
            btn.classList.toggle('active', on);
            btn.querySelector('.sidebar-label').textContent = on ? 'Auto-EQ On' : 'Auto-EQ Off';
            localStorage.setItem('autoEQEnabled', on.toString());

            if (on && this.state.currentTrackIndex !== -1) {
                const t = this.state.playlist[this.state.currentTrackIndex];
                if (t) this.managers.autoEQ.applyAutoEQ(t);
            } else if (!on) {
                this.managers.audioPresets.reset();
                const dd = document.getElementById('eq-preset-select');
                if (dd) dd.value = 'flat';
            }
            this.managers.ui?.showToast(`Auto-EQ ${on ? 'enabled' : 'disabled'}`, on ? 'success' : 'info');
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupVolumeBoostButton() {
        const btn = document.getElementById('volume-boost-button');
        if (!btn || !this.managers.volume) return;

        if (this.managers.volume.isBoostEnabled()) {
            btn.classList.add('active');
            btn.querySelector('.sidebar-label').textContent = 'Boost On';
        }

        const handler = () => {
            const on = !this.managers.volume.isBoostEnabled();
            this.managers.volume.setBoost(on, 1.5);
            btn.classList.toggle('active', on);
            btn.querySelector('.sidebar-label').textContent = on ? 'Boost On' : 'Boost Off';
            this.managers.ui?.showToast(`Volume Boost ${on ? 'enabled' : 'disabled'}`, on ? 'success' : 'info');
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupCrossfadeButton() {
        const btn = document.getElementById('crossfade-button');
        if (!btn || !this.managers.crossfade) return;

        if (localStorage.getItem('crossfadeEnabled') === 'true') {
            this.managers.crossfade.setEnabled(true);
            btn.classList.add('active');
            btn.querySelector('.sidebar-label').textContent = 'Crossfade On';
        }
        btn.disabled = false;

        const handler = () => {
            const on = !this.managers.crossfade.enabled;
            this.managers.crossfade.setEnabled(on);
            btn.classList.toggle('active', on);
            btn.querySelector('.sidebar-label').textContent = on ? 'Crossfade On' : 'Crossfade Off';
            localStorage.setItem('crossfadeEnabled', on.toString());
            this.managers.ui?.showToast(`Crossfade ${on ? 'enabled' : 'disabled'}`, on ? 'success' : 'info');
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupDebugButton() {
        const btn = document.getElementById('debug-toggle');
        if (!btn) return;

        const handler = () => {
            this.state.debugMode = !this.state.debugMode;
            btn.classList.toggle('active', this.state.debugMode);
            this.elements.debugPanel?.classList.toggle('visible', this.state.debugMode);
            this.debugLog(`Debug mode: ${this.state.debugMode ? 'ON' : 'OFF'}`, 'info');
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupCompactToggle() {
        const btn = document.getElementById('compact-toggle');
        if (!btn) return;

        const saved = localStorage.getItem('compactMode') || 'full';
        this.state.compactMode = saved;
        this.applyViewMode(saved);

        const NAMES = { full: 'Full View', compact: 'Compact', mini: 'Mini' };

        const handler = () => {
            const modes = ['full', 'compact', 'mini'];
            const next  = modes[(modes.indexOf(this.state.compactMode) + 1) % modes.length];
            this.state.compactMode = next;
            this.applyViewMode(next);
            localStorage.setItem('compactMode', next);
            btn.querySelector('.sidebar-label').textContent = NAMES[next];
            this.managers.ui?.showToast(`View: ${NAMES[next]}`, 'info');
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupStickyToggle() {
        const btn = document.getElementById('sticky-toggle');
        if (!btn) return;

        if (localStorage.getItem('stickyMode') === 'true') {
            this.state.stickyMode = true;
            btn.classList.add('active');
            btn.querySelector('.sidebar-label').textContent = 'Sticky On';
            this.applyStickyMode(true);
        }

        const handler = () => {
            this.state.stickyMode = !this.state.stickyMode;
            btn.classList.toggle('active', this.state.stickyMode);
            btn.querySelector('.sidebar-label').textContent =
                this.state.stickyMode ? 'Sticky On' : 'Sticky Off';
            localStorage.setItem('stickyMode', this.state.stickyMode.toString());
            this.applyStickyMode(this.state.stickyMode);
            this.managers.ui?.showToast(
                `Sticky mode ${this.state.stickyMode ? 'enabled' : 'disabled'}`,
                this.state.stickyMode ? 'success' : 'info'
            );
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    applyStickyMode(enabled) {
        if (!this.elements.metadataContainer) return;
        this.elements.metadataContainer.classList.toggle('sticky-mode', enabled);
        const close = this.elements.metadataContainer.querySelector('.sticky-close');
        if (close) close.style.display = enabled ? 'block' : 'none';
    }

    setupStorageStatsButton() {
        const btn = document.getElementById('storage-stats-btn');
        if (!btn) return;

        const handler = async () => {
            try {
                let msg = '💾 Storage Information\n\n';

                if (navigator.storage?.estimate) {
                    const e   = await navigator.storage.estimate();
                    const usedMB  = (e.usage  / 1048576).toFixed(2);
                    const totalMB = (e.quota  / 1048576).toFixed(2);
                    const pct     = ((e.usage / e.quota) * 100).toFixed(1);
                    msg += `Used: ${usedMB} MB\nTotal: ${totalMB} MB\nUsage: ${pct}%\n\n`;
                }

                if (this.managers.audioBuffer) {
                    const s = this.managers.audioBuffer.getStats();
                    msg += `Audio Buffer:\n- Memory: ${s.memoryUsedMB}\n- Cached: ${s.cachedTracks} tracks\n- Hit rate: ${s.hitRate}\n\n`;
                }

                if (this.managers.performance) {
                    const p = this.managers.performance.getStatsDisplay();
                    msg += `Performance:\n- FPS: ${p.fps}\n- Memory: ${p.memory}\n- CPU: ${p.cpuLoad}\n`;
                    msg += `- Active: ${p.activeResources.intervals} intervals, ${p.activeResources.animations} animations\n\n`;
                }

                msg += `Blob URLs: ${this.resources.blobURLs.size}\n`;
                msg += `Event Listeners: ${this.resources.eventListeners.length}`;
                alert(msg);
            } catch (err) {
                this.debugLog(`Storage stats error: ${err.message}`, 'error');
                alert('Storage information not available');
            }
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupCustomBackgroundButton() {
        const btn = document.getElementById('custom-bg-button');
        if (!btn) return;

        const handler = () => {
            if (window.customBackground?.openPicker) {
                window.customBackground.openPicker();
            } else {
                this.managers.ui?.showToast('Background picker not available', 'error');
            }
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    setupClearCacheButton() {
        const btn = document.getElementById('clear-cache-btn');
        if (!btn) return;

        const handler = async () => {
            if (!confirm('Clear all cached data? This will not delete your playlist.')) return;
            try {
                this.revokeBlobURLs();
                this.managers.audioBuffer?.clearAllBuffers();
                this.colorCache?.clear();
                if ('caches' in window) {
                    const names = await caches.keys();
                    await Promise.all(names.map(n => caches.delete(n)));
                }
                this.managers.ui?.showToast('Cache cleared successfully', 'success');
                this.debugLog('✅ Cache cleared', 'success');
            } catch (err) {
                this.debugLog(`Cache clear error: ${err.message}`, 'error');
                this.managers.ui?.showToast('Error clearing cache', 'error');
            }
        };
        btn.addEventListener('click', handler);
        this.resources.eventListeners.push({ element: btn, event: 'click', handler });
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    setupKeyboardShortcuts() {
        const handler = e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault(); this.togglePlayPause(); break;

                case 'arrowright':
                    e.preventDefault();
                    e.shiftKey ? this.playNext() : this.seekForward(); break;

                case 'arrowleft':
                    e.preventDefault();
                    e.shiftKey ? this.playPrevious() : this.seekBackward(); break;

                case 'arrowup':
                    e.preventDefault(); this.managers.volume?.increaseVolume(0.1); break;

                case 'arrowdown':
                    e.preventDefault(); this.managers.volume?.decreaseVolume(0.1); break;

                case 'm': e.preventDefault(); this.managers.volume?.toggleMute(); break;
                case 's': e.preventDefault(); this.toggleShuffle(); break;
                case 'l': e.preventDefault(); this.cycleLoopMode(); break;

                case 'f':
                    if (this.managers.lyrics) {
                        e.preventDefault(); this.managers.lyrics.toggleFullscreen();
                    }
                    break;

                case 'd':
                    e.preventDefault();
                    this.state.debugMode = !this.state.debugMode;
                    document.getElementById('debug-toggle')
                        ?.classList.toggle('active', this.state.debugMode);
                    this.elements.debugPanel
                        ?.classList.toggle('visible', this.state.debugMode);
                    break;

                case 'c': {
                    e.preventDefault();
                    const modes = ['full', 'compact', 'mini'];
                    const next  = modes[(modes.indexOf(this.state.compactMode) + 1) % modes.length];
                    this.state.compactMode = next;
                    this.applyViewMode(next);
                    localStorage.setItem('compactMode', next);
                    break;
                }
            }
        };

        document.addEventListener('keydown', handler);
        this.resources.eventListeners.push({ element: document, event: 'keydown', handler });
        this.debugLog('✅ Keyboard shortcuts enabled', 'success');
    }

    // ── Playback helpers ──────────────────────────────────────────────────────

    togglePlayPause() {
        if (!this.elements.player) return;
        if (this.elements.player.paused) {
            this.elements.player.play()
                .catch(e => this.debugLog(`Play failed: ${e.message}`, 'error'));
        } else {
            this.elements.player.pause();
        }
    }

    seekForward() {
        if (!this.elements.player) return;
        this.elements.player.currentTime = Math.min(
            this.elements.player.currentTime + 5,
            this.elements.player.duration || 0
        );
    }

    seekBackward() {
        if (!this.elements.player) return;
        this.elements.player.currentTime = Math.max(
            this.elements.player.currentTime - 5, 0
        );
    }

    async initializeBackgroundAudio() {
        try {
            const ok = await backgroundAudioHandler.init({
                player:               this.elements.player,
                playlist:             () => this.state.playlist,
                getCurrentTrackIndex: () => this.state.currentTrackIndex,
                onMediaAction: {
                    previous: () => this.playPrevious(),
                    next:     () => this.playNext(),
                },
            });
            if (ok) this.debugLog('✅ Background audio activated', 'success');
        } catch (err) {
            this.debugLog(`⚠️ Background audio: ${err.message}`, 'warning');
        }
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    setupEventListeners() {
        // Convenience wire helper: attaches, tracks for cleanup, checks null
        const wire = (el, event, handler, opts) => {
            if (!el) return;
            el.addEventListener(event, handler, opts);
            this.resources.eventListeners.push({ element: el, event, handler });
        };

        // ── Audio element events ─────────────────────────────────────────────
        // NOTE: 'timeupdate' intentionally omitted — rAF loop handles DOM updates
        wire(this.elements.player, 'ended',          () => this.handleTrackEnded());
        wire(this.elements.player, 'loadedmetadata', () => this.handleMetadataLoaded());
        wire(this.elements.player, 'error',          e  => this.handlePlayerError(e));
        wire(this.elements.player, 'play',           () => this.handlePlay());
        wire(this.elements.player, 'pause',          () => this.handlePause());

        // seeked: update progress once when user seeks while paused
        wire(this.elements.player, 'seeked', () => {
            if (this.elements.player.paused) {
                this._renderProgress();
                if (this.managers.lyrics && this.state.compactMode === 'full') {
                    this.managers.lyrics.update(this.elements.player.currentTime, 'full');
                }
            }
        });

        // ── Transport buttons ─────────────────────────────────────────────────
        wire(this.elements.loadButton,     'click', () => this.loadFiles());
        wire(this.elements.folderButton,   'click', () => this.loadFromFolder());
        wire(this.elements.prevButton,     'click', () => this.playPrevious());
        wire(this.elements.nextButton,     'click', () => this.playNext());
        wire(this.elements.playPauseButton,'click', () => this.togglePlayPause());
        wire(this.elements.shuffleButton,  'click', () => this.toggleShuffle());
        wire(this.elements.loopButton,     'click', () => this.cycleLoopMode());
        wire(this.elements.clearButton,    'click', () => this.clearPlaylist());

        // ── Page visibility — stop rAF when tab is hidden ─────────────────────
        wire(document, 'visibilitychange', () => {
            if (document.hidden) {
                this._rafStop();
            } else if (!this.elements.player?.paused) {
                this._rafStart();
            }
        });

        if (this.elements.progressContainer) this.setupProgressBar();
        this.setupEqualizer();

        this.debugLog('✅ Event listeners registered', 'success');
    }

    setupProgressBar() {
        let seekDebounce = null;

        const mousedownHandler = () => {
            // Cancel any pending resume debounce
            if (seekDebounce !== null) {
                clearTimeout(seekDebounce);
                this.resources.timeouts.delete(seekDebounce);
                seekDebounce = null;
            }

            this.state.isSeekingProg = true;
            const wasPlaying = !this.elements.player.paused;
            this.elements.player.pause(); // also triggers _rafStop via 'pause' event

            seekDebounce = setTimeout(() => {
                this.resources.timeouts.delete(seekDebounce);
                seekDebounce = null;
                if (wasPlaying) {
                    this.elements.player.play()
                        .catch(e => this.debugLog(`Resume error: ${e.message}`, 'error'));
                }
            }, this.config.SEEK_DEBOUNCE_DELAY_MS);

            this.resources.timeouts.add(seekDebounce);
        };

        const mousemoveHandler = e => {
            if (!this.state.isSeekingProg) return;
            this._scrubProgress(e);
        };

        const mouseupHandler = e => {
            if (!this.state.isSeekingProg) return;
            this.state.isSeekingProg = false;
            const newTime = this._scrubProgress(e);
            if (newTime !== null && isFinite(newTime)) {
                try { this.elements.player.currentTime = newTime; }
                catch (err) { this.debugLog(`Seek failed: ${err.message}`, 'error'); }
            }
        };

        this.elements.progressContainer.addEventListener('mousedown', mousedownHandler);
        // passive: true — we never call preventDefault in these handlers
        document.addEventListener('mousemove', mousemoveHandler, { passive: true });
        document.addEventListener('mouseup',   mouseupHandler,   { passive: true });

        this.resources.eventListeners.push(
            { element: this.elements.progressContainer, event: 'mousedown', handler: mousedownHandler },
            { element: document, event: 'mousemove', handler: mousemoveHandler },
            { element: document, event: 'mouseup',   handler: mouseupHandler  }
        );
    }

    /** Compute and apply a scrub position from a mouse event. Returns new time. */
    _scrubProgress(e) {
        const rect    = this.elements.progressContainer.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = percent * this.elements.player.duration;

        this.elements.progressBar.style.width        = `${percent * 100}%`;
        this.elements.currentTimeDisplay.textContent  = this.formatTime(newTime);
        this._raf.lastPercent = percent * 100; // keep rAF in sync to avoid a jump

        return newTime;
    }

    setupEqualizer() {
        const sliders = [
            { slider: this.elements.eqBassSlider,   display: this.elements.bassValue,   type: 'bass'   },
            { slider: this.elements.eqMidSlider,    display: this.elements.midValue,    type: 'mid'    },
            { slider: this.elements.eqTrebleSlider, display: this.elements.trebleValue, type: 'treble' },
        ];

        sliders.forEach(({ slider, display, type }) => {
            if (!slider) return;
            const handler = e => {
                const v = parseFloat(e.target.value);
                if (display) display.textContent = `${v > 0 ? '+' : ''}${v} dB`;
                this.updateEqualizer(type, v);
            };
            slider.addEventListener('input', handler);
            this.resources.eventListeners.push({ element: slider, event: 'input', handler });
        });

        if (this.elements.eqResetBtn) {
            const handler = () => this.resetEqualizer();
            this.elements.eqResetBtn.addEventListener('click', handler);
            this.resources.eventListeners.push({ element: this.elements.eqResetBtn, event: 'click', handler });
        }
    }

    // ── File loading ──────────────────────────────────────────────────────────

    async loadFiles() {
        try {
            if (!this.managers.fileLoading) {
                this.managers.ui?.showToast('File loading not available', 'error'); return;
            }
            const result = await this.managers.fileLoading.createFileInput();
            if (result?.success && result.playlist.length > 0) {
                this._applyNewPlaylist(result.playlist);
            }
        } catch (err) {
            if (err.name !== 'AbortError') this.debugLog(`Error loading: ${err.message}`, 'error');
        }
    }

    async loadFromFolder() {
        try {
            if (!('showDirectoryPicker' in window)) {
                this.managers.ui?.showToast('Folder selection not supported', 'error'); return;
            }
            const dir = await window.showDirectoryPicker({ mode: 'read', startIn: 'music' });
            this.state.folderHandle = dir;
            if (!this.managers.fileLoading) return;

            const result = await this.managers.fileLoading.loadFromFolderHandle(dir);
            if (result?.success && result.playlist.length > 0) {
                this._applyNewPlaylist(result.playlist);

                if (this.managers.folderPersistence && result.stats) {
                    await this.managers.folderPersistence.updateMetadata({
                        trackCount:  result.stats.audioFiles,
                        hasLyrics:   result.stats.withLyrics   > 0,
                        hasAnalysis: result.stats.withAnalysis > 0,
                        totalSize:   result.stats.totalSize    || 0,
                    });
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') this.debugLog(`Error: ${err.message}`, 'error');
        }
    }

    /** Shared logic after any successful file load. */
    _applyNewPlaylist(playlist) {
        this.state.playlist          = playlist;
        this.state.currentTrackIndex = -1;
        this.managers.audioBuffer?.setPlaylist(this.state.playlist);
        this.updatePlaylist();
        this.savePlaylistToStorage();
        this.managers.ui?.showToast(`Loaded ${playlist.length} tracks`, 'success');
        this.startBackgroundAnalysis();
        this.loadTrack(0);
    }

    // ── Track loading ─────────────────────────────────────────────────────────

    async loadTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        this.cleanupCurrentTrack();
        this.managers.performance?.cleanupForTrackChange();

        this.state.currentTrackIndex = index;
        const track = this.state.playlist[index];

        this.debugLog(`Loading track ${index + 1}: ${track.fileName}`, 'info');

        if (track.metadata) {
            this.displayMetadata(track.metadata);
        } else {
            this.clearMetadata();
            this.elements.trackTitle.textContent = track.fileName;
        }

        // Per-track volume memory
        if (this.managers.volume && track.metadata) {
            const id      = `${track.metadata.artist || 'Unknown'}_${track.metadata.title || track.fileName}`;
            const applied = this.managers.volume.applyTrackVolume(id);
            if (!applied && track.analysis) {
                this.managers.volume.applyVolume(this.managers.volume.getVolume(), true, track.analysis);
            }
        }

        if (this.managers.autoEQ?.isEnabled() && track.analysis) {
            this.managers.autoEQ.applyAutoEQ(track);
        }

        // Audio source: buffered → direct URL fallback
        if (this.managers.audioBuffer && track.file) {
            const capturedIndex = index;

            this.managers.audioBuffer.getBuffer(capturedIndex).then(buffer => {
                if (this.state.currentTrackIndex !== capturedIndex) return;

                const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }));
                this.resources.blobURLs.add(url);
                this.elements.player.src = url;
                this.elements.player.load();

                if (track.analysis?.silence?.start > 0.1) {
                    this.elements.player.currentTime = track.analysis.silence.start;
                }

                this.elements.player.play()
                    .catch(e => this.debugLog(`Playback failed: ${e.message}`, 'warning'));

                this.managers.audioBuffer.preloadUpcoming(capturedIndex);
            }).catch(() => this._playFromURL(track));
        } else {
            this._playFromURL(track);
        }

        // Lyrics
        if (track.vtt && this.managers.vtt && this.managers.lyrics) {
            try {
                const cues = await this.managers.vtt.loadVTTFile(track.vtt);
                this.managers.lyrics.loadLyrics(cues);
            } catch {
                this.managers.lyrics.clearLyrics();
            }
        } else {
            this.managers.lyrics?.clearLyrics();
        }

        this.managers.playlistRenderer?.updateHighlight(this.state.currentTrackIndex);

        if (this.elements.prevButton) this.elements.prevButton.disabled = false;
        if (this.elements.nextButton) this.elements.nextButton.disabled = false;

        this.updateMediaSession();
    }

    _playFromURL(track) {
        this.elements.player.src = track.audioURL;
        this.elements.player.load();
        this.elements.player.play()
            .catch(e => this.debugLog(`Playback failed: ${e.message}`, 'warning'));
    }

    // ── Resource management ───────────────────────────────────────────────────

    cleanupCurrentTrack() {
        if (this.elements.player.src?.startsWith('blob:')) {
            this.revokeBlobURL(this.elements.player.src);
        }
    }

    revokeBlobURL(url) {
        if (!url?.startsWith('blob:')) return;
        try {
            URL.revokeObjectURL(url);
            this.resources.blobURLs.delete(url);
        } catch (err) {
            this.debugLog(`⚠️ Failed to revoke blob URL: ${err.message}`, 'warning');
        }
    }

    revokeBlobURLs() {
        this.resources.blobURLs.forEach(url => {
            try { URL.revokeObjectURL(url); } catch (_) {}
        });
        this.resources.blobURLs.clear();
        this.debugLog('🧹 Revoked all blob URLs', 'info');
    }

    // ── Metadata display ──────────────────────────────────────────────────────

    displayMetadata(metadata) {
        if (!metadata) return;

        this.elements.trackTitle.textContent  = metadata.title  || 'Unknown Title';
        this.elements.trackArtist.textContent = metadata.artist || 'Unknown Artist';
        this.elements.trackAlbum.textContent  = metadata.album  || 'Unknown Album';

        if (metadata.image) {
            this.elements.coverArt.src    = metadata.image;
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
        this.elements.trackTitle.textContent  = 'No track loaded';
        this.elements.trackArtist.textContent = '--';
        this.elements.trackAlbum.textContent  = '--';
        this.elements.coverArt.src = '';
        this.elements.coverArt.classList.remove('loaded');
        this.elements.coverPlaceholder.style.display = 'flex';
        this.managers.lyrics?.clearLyrics();
    }

    // ── Playlist helpers ──────────────────────────────────────────────────────

    updatePlaylist() {
        this.managers.playlistRenderer?.setPlaylist(this.state.playlist, this.state.currentTrackIndex);
        this.updatePlaylistStatus();
    }

    updatePlaylistStatus() {
        const n = this.state.playlist.length;
        if (this.elements.playlistStatus)
            this.elements.playlistStatus.textContent = `${n} track${n !== 1 ? 's' : ''} loaded`;

        if (this.elements.clearButton)   this.elements.clearButton.disabled   = n === 0;
        if (this.elements.shuffleButton) this.elements.shuffleButton.disabled = n === 0;
        if (this.elements.loopButton)    this.elements.loopButton.disabled    = n === 0;
    }

    updateMediaSession() {
        if (!('mediaSession' in navigator) || this.state.currentTrackIndex === -1) return;
        const track = this.state.playlist[this.state.currentTrackIndex];
        const meta  = track.metadata || {};

        navigator.mediaSession.metadata = new MediaMetadata({
            title:   meta.title  || track.fileName,
            artist:  meta.artist || 'Unknown Artist',
            album:   meta.album  || 'Unknown Album',
            artwork: meta.image  ? [{ src: meta.image, sizes: '512x512', type: 'image/png' }] : [],
        });

        window.backgroundAudioHandler?.updateMediaSessionMetadata();
    }

    // ── Playback controls ─────────────────────────────────────────────────────

    playNext() {
        if (this.state.playlist.length === 0) return;

        if (this.state.currentTrackIndex !== -1 && this.managers.volume) {
            const t  = this.state.playlist[this.state.currentTrackIndex];
            const id = `${t.metadata?.artist || 'Unknown'}_${t.metadata?.title || t.fileName}`;
            this.managers.volume.rememberTrackVolume(id, this.managers.volume.getVolume());
        }

        let next;
        if (this.state.isShuffled) {
            next = Math.floor(Math.random() * this.state.playlist.length);
        } else {
            next = this.state.currentTrackIndex + 1;
            if (next >= this.state.playlist.length) {
                if (this.state.loopMode === 'all') next = 0;
                else return;
            }
        }
        this.loadTrack(next);
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
        this._rafStop();
        if (this.state.loopMode === 'one') {
            this.elements.player.currentTime = 0;
            this.elements.player.play();
        } else {
            this.playNext();
        }
    }

    toggleShuffle() {
        this.state.isShuffled = !this.state.isShuffled;
        this.elements.shuffleButton?.classList.toggle('active', this.state.isShuffled);
        this.managers.audioBuffer?.setShuffleState(this.state.isShuffled);
        this.managers.ui?.showToast(`Shuffle ${this.state.isShuffled ? 'on' : 'off'}`, 'info');
    }

    cycleLoopMode() {
        const modes = ['off', 'all', 'one'];
        this.state.loopMode = modes[(modes.indexOf(this.state.loopMode) + 1) % modes.length];
        this.elements.loopButton?.classList.toggle('active', this.state.loopMode !== 'off');
        this.managers.ui?.showToast(`Loop: ${this.state.loopMode}`, 'info');
    }

    clearPlaylist() {
        if (!confirm('Clear playlist?')) return;

        this._rafStop();
        this.managers.fileLoading?.cleanupPlaylist(this.state.playlist);
        this.managers.audioBuffer?.clearAllBuffers();
        this.revokeBlobURLs();

        this.state.playlist          = [];
        this.state.currentTrackIndex = -1;

        this.elements.player.pause();
        this.elements.player.src = '';

        this.clearMetadata();
        this.updatePlaylist();

        // Reset progress display
        this._raf.lastPercent = -1;
        if (this.elements.progressBar)        this.elements.progressBar.style.width  = '0%';
        if (this.elements.currentTimeDisplay) this.elements.currentTimeDisplay.textContent = '0:00';
        if (this.elements.durationDisplay)    this.elements.durationDisplay.textContent    = '0:00';

        if (this.elements.prevButton) this.elements.prevButton.disabled = true;
        if (this.elements.nextButton) this.elements.nextButton.disabled = true;
    }

    // ── Audio event handlers ──────────────────────────────────────────────────

    handleMetadataLoaded() {
        if (!this.elements.durationDisplay) return;
        const dur = this.elements.player.duration;
        this.elements.durationDisplay.textContent = isFinite(dur) ? this.formatTime(dur) : '0:00';
    }

    handlePlay() {
        if (this.managers.audioPipeline?.isInitialized) {
            if (this.managers.audioPipeline.audioContext.state === 'suspended') {
                this.managers.audioPipeline.resume();
            }
        }
        window.backgroundAudioHandler?.updatePlaybackState('playing');
        this.managers.performance?.setPlayState(true);
        this._rafStart(); // ← begin progress + lyrics loop
    }

    handlePause() {
        window.backgroundAudioHandler?.updatePlaybackState('paused');
        this.managers.performance?.setPlayState(false);
        this._rafStop(); // ← end progress + lyrics loop
    }

    handlePlayerError(e) {
        if (this.state.currentTrackIndex === -1) return;
        const info = this.state.playlist[this.state.currentTrackIndex];
        this.managers.errorRecovery?.handleAudioError(this.elements.player, info);
    }

    // ── Equalizer ─────────────────────────────────────────────────────────────

    updateEqualizer(type, value) {
        if (!this.managers.audioPipeline?.isInitialized) return;
        const f = {
            bass:   this.managers.audioPipeline.bassFilter,
            mid:    this.managers.audioPipeline.midFilter,
            treble: this.managers.audioPipeline.trebleFilter,
        };
        if (f[type]) this.managers.audioPipeline.setGain(f[type], value);
    }

    resetEqualizer() {
        [
            [this.elements.eqBassSlider,   this.elements.bassValue  ],
            [this.elements.eqMidSlider,    this.elements.midValue   ],
            [this.elements.eqTrebleSlider, this.elements.trebleValue],
        ].forEach(([slider, display]) => {
            if (!slider) return;
            slider.value = 0;
            if (display) display.textContent = '0 dB';
        });

        const p = this.managers.audioPipeline;
        if (p?.bassFilter) {
            p.setGain(p.bassFilter,   0);
            p.setGain(p.midFilter,    0);
            p.setGain(p.trebleFilter, 0);
        }
    }

    // ── Background analysis ───────────────────────────────────────────────────

    async startBackgroundAnalysis() {
        if (this.state.backgroundAnalysisRunning || !this.managers.analyzer) return;
        this.state.backgroundAnalysisRunning = true;

        const pending = this.state.playlist
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => !track.analysis);

        if (pending.length === 0) {
            this.state.backgroundAnalysisRunning = false;
            return;
        }

        for (let i = 0; i < pending.length; i += 3) {
            if (this.state.destroyed || this.state.playlist.length === 0) break;

            await Promise.all(pending.slice(i, i + 3).map(async ({ track, index }) => {
                // Skip if the playlist slot has been replaced
                if (this.state.playlist[index] !== track) return;
                try {
                    const blob     = await (await fetch(track.audioURL)).blob();
                    const file     = new File([blob], track.fileName, { type: 'audio/mpeg' });
                    const analysis = await this.managers.analyzer.analyzeTrack(file, track.fileName);
                    this.state.playlist[index].analysis = analysis;
                } catch { /* best-effort, silent fail */ }
            }));

            this.updatePlaylist();
            await new Promise(r => setTimeout(r, 500));
        }

        this.state.backgroundAnalysisRunning = false;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    savePlaylistToStorage() {
        try {
            localStorage.setItem('savedPlaylist', JSON.stringify(
                this.state.playlist.map(t => ({
                    fileName: t.fileName,
                    metadata: t.metadata,
                    hasVTT:   !!t.vtt,
                    duration: t.duration,
                }))
            ));
        } catch { /* storage full, non-fatal */ }
    }

    async restoreState() {
        try {
            if (localStorage.getItem('crossfadeEnabled') === 'true')
                this.managers.crossfade?.setEnabled(true);
            if (localStorage.getItem('autoEQEnabled') === 'true')
                this.managers.autoEQ?.setEnabled(true);

            this.managers.audioBuffer?.setShuffleState(this.state.isShuffled);
        } catch { /* silent fail */ }
    }

    // ── Metadata editor ───────────────────────────────────────────────────────

    editTrackMetadata(index) {
        const track = this.state.playlist[index];
        if (!track || !this.managers.metadataEditor) return;

        this.managers.metadataEditor.openEditor(
            index,
            {
                title:  track.metadata?.title  || track.fileName,
                artist: track.metadata?.artist || 'Unknown Artist',
                album:  track.metadata?.album  || 'Unknown Album',
            },
            (trackIndex, newMeta) => {
                if (this.managers.customMetadata) {
                    this.managers.customMetadata.save(
                        this.state.playlist[trackIndex].fileName,
                        this.state.playlist[trackIndex].duration || 0,
                        newMeta
                    );
                }

                this.state.playlist[trackIndex].metadata = {
                    ...this.state.playlist[trackIndex].metadata,
                    ...newMeta,
                    hasMetadata: true,
                };

                this.updatePlaylist();
                if (trackIndex === this.state.currentTrackIndex)
                    this.displayMetadata(this.state.playlist[trackIndex].metadata);
            }
        );
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    debugLog(message, type = 'info') {
        if (!this.state.debugMode && type !== 'error') return;

        const prefix = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] ?? 'ℹ️';
        console.log(`${prefix} ${message}`);

        if (this.elements.debugPanel && this.state.debugMode) {
            const entry       = document.createElement('div');
            entry.className   = `debug-entry debug-${type}`;
            entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
            this.elements.debugPanel.appendChild(entry);
            while (this.elements.debugPanel.children.length > 100)
                this.elements.debugPanel.removeChild(this.elements.debugPanel.firstChild);
        }
    }

    // ── Destroy ───────────────────────────────────────────────────────────────

    destroy() {
        if (this.state.destroyed) {
            this.debugLog('⚠️ Already destroyed', 'warning');
            return;
        }

        this.debugLog('🧹 Destroying MusicPlayerApp…', 'info');

        this._rafStop();

        if (this.elements.player) {
            this.elements.player.pause();
            this.elements.player.src = '';
        }

        this.revokeBlobURLs();

        this.resources.intervals.forEach(id => clearInterval(id));
        this.resources.intervals.clear();

        this.resources.timeouts.forEach(id => clearTimeout(id));
        this.resources.timeouts.clear();

        this.resources.eventListeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this.resources.eventListeners = [];

        ['performance', 'audioBuffer', 'audioPipeline', 'lyrics', 'ui'].forEach(key => {
            const m = this.managers[key];
            if (m && typeof m.destroy === 'function') {
                try { m.destroy(); } catch (_) {}
            }
        });

        this.colorCache?.clear();

        // Release the full object graph
        this.managers = {};
        this.elements = {};

        this.state.destroyed   = true;
        this.state.initialized = false;

        this.debugLog('✅ Destroyed successfully', 'success');
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Initializing — Clean v4.0');
    window.musicPlayerApp = new MusicPlayerApp();
    window.musicPlayerApp.init();
});

console.log('✅ script.js loaded — Clean v4.0');
