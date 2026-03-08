/* ============================================
   Ultimate Local Music Player — v5.1
   Fully resource-safe, bug-fixed, well-structured
   ============================================ */

// ─── Global Audio Chain Reconnect Helper ─────────────────────────────────────
// Chain: source → bass → mid → treble → volumeGain → compressor → makeupGain → destination
// NOTE: volumeGainNode / volumeCompressor / volumeMakeupGain are provided by VolumeControl.
window.reconnectAudioChainWithVolumeControl = function () {
    const required = [
        'sharedAudioSource', 'sharedBassFilter',
        'sharedMidFilter',   'sharedTrebleFilter', 'audioContext',
    ];
    const volumeNodes = ['volumeGainNode', 'volumeCompressor', 'volumeMakeupGain'];

    const missing = [...required, ...volumeNodes].filter(k => !window[k]);
    if (missing.length) {
        console.log('⏳ Audio chain reconnect: waiting for', missing.join(', '));
        return false;
    }

    try {
        const nodes = [
            window.sharedAudioSource, window.sharedBassFilter,
            window.sharedMidFilter,   window.sharedTrebleFilter,
            window.volumeGainNode,    window.volumeCompressor,
            window.volumeMakeupGain,
        ];
        // Splice in crossfade fade-gain node when CrossfadeManager has created it.
        if (window.crossfadeFadeGain) nodes.push(window.crossfadeFadeGain);

        nodes.forEach(n => { try { n.disconnect(); } catch (_) {} });
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        nodes[nodes.length - 1].connect(window.audioContext.destination);

        console.log('✅ Audio chain reconnected');
        return true;
    } catch (err) {
        console.error('❌ Audio chain reconnection failed:', err);
        return false;
    }
};

// ─── MusicPlayerApp ──────────────────────────────────────────────────────────

class MusicPlayerApp {

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTION
    // ═══════════════════════════════════════════════════════════

    constructor() {
        this.state = {
            playlist:                  [],
            currentTrackIndex:         -1,
            isShuffled:                false,
            shuffledPlaylist:          [],
            loopMode:                  'off',   // 'off' | 'all' | 'one'
            debugMode:                 false,
            isSeekingProg:             false,
            compactMode:               'full',  // 'full' | 'compact' | 'mini'
            folderHandle:              null,
            backgroundAnalysisRunning: false,
            initialized:               false,
            destroyed:                 false,
        };

        this.config = {
            SEEK_RESUME_DELAY_MS: 150,
        };

        this.managers   = {};
        this.elements   = {};
        this.colorCache = new Map();

        this.resources = {
            blobURLs:       new Set(),
            eventListeners: [],
            windowRefs:     new Set(),
        };

        // rAF state
        this._raf = {
            id:           null,
            lastProgress: 0,
            lastLyrics:   0,
            lastPercent:  -1,
        };
        this._boundRafTick = this._rafTick.bind(this);
    }

    // ═══════════════════════════════════════════════════════════
    // BOOTSTRAP
    // ═══════════════════════════════════════════════════════════

    async init() {
        if (this.state.initialized) {
            this.debugLog('⚠️ Already initialized', 'warning');
            return;
        }
        try {
            this._cacheElements();
            await this._initManagers();
            this._initAudio();
            this._setupEventListeners();
            this._setupKeyboardShortcuts();
            this._setupSidebarButtons();
            await this._restoreState();
            this._connectManagersToPerformance();
            this._setupFullscreenLyricsToggle();
            this._exposeGlobals();

            this.state.initialized = true;
            this.debugLog('✅ Music player initialized (v5.1)', 'success');
        } catch (err) {
            this.debugLog(`❌ Init error: ${err.message}`, 'error');
            console.error(err);
        }
    }

    /** Expose a minimal global API that other scripts (e.g. mobile.js) may call. */
    _exposeGlobals() {
        // Compact-mode setter — mobile.js uses this
        window.setCompactMode = mode => {
            this.state.compactMode = mode;
            this._applyViewMode(mode);
            localStorage.setItem('compactMode', mode);
        };
    }

    // ═══════════════════════════════════════════════════════════
    // ELEMENT CACHE
    // ═══════════════════════════════════════════════════════════

    _cacheElements() {
        const $ = id => document.getElementById(id);
        this.elements = {
            player:           $('audio-player'),
            playPauseButton:  $('play-pause-button'),
            loadButton:       $('load-button'),
            folderButton:     $('folder-button'),
            prevButton:       $('prev-button'),
            nextButton:       $('next-button'),
            shuffleButton:    $('shuffle-button'),
            loopButton:       $('loop-button'),
            clearButton:      $('clear-playlist'),
            playlistStatus:   $('playlist-status'),
            playlistItems:    $('playlist-items'),
            playlistSearch:   $('playlist-search'),
            jumpToCurrentBtn: $('jump-to-current'),
            coverArt:         $('cover-art'),
            coverPlaceholder: $('cover-placeholder'),
            trackTitle:       $('track-title'),
            trackArtist:      $('track-artist'),
            trackAlbum:       $('track-album'),
            progressContainer:  $('custom-progress-container'),
            progressBar:        $('progress-bar'),
            currentTimeDisplay: $('current-time'),
            durationDisplay:    $('duration'),
            lyricsDisplay:           $('lyrics-display'),
            exportLyricsButton:      $('export-lyrics-button'),
            fsLyricsContainer: $('fullscreen-lyrics'),
            fsLyricsContent:   $('fullscreen-lyrics-content'),
            fsLyricsToggle:    $('fullscreen-lyrics-toggle'),
            fsLyricsClose:     $('lyrics-close-btn'),
            fsLyricsPrev:      $('lyrics-prev-btn'),
            fsLyricsNext:      $('lyrics-next-btn'),
            eqBass:         $('eq-bass'),
            eqMid:          $('eq-mid'),
            eqTreble:       $('eq-treble'),
            bassValue:      $('bass-value'),
            midValue:       $('mid-value'),
            trebleValue:    $('treble-value'),
            eqResetBtn:     $('eq-reset'),
            debugToggle:  $('debug-toggle'),
            debugPanel:   $('debug-panel'),
            dropZone:     $('drop-zone'),
            mainContent:  $('main-content'),
            // View-mode sections
            sectionPlaylist: $('playlist-container'),
            sectionVolume:   $('volume-control'),
            sectionLyrics:   $('lyrics-display'),
            sectionEQ:       $('equalizer-control'),
            sectionDropZone: $('drop-zone'),
        };
    }

    // ═══════════════════════════════════════════════════════════
    // MANAGERS
    // ═══════════════════════════════════════════════════════════

    async _initManagers() {
        const log = this.debugLog.bind(this);

        // Core utilities
        this._tryInitManager('worker',        () => typeof createMusicPlayerWorkerManager !== 'undefined'
            ? createMusicPlayerWorkerManager(log) : null);
        this._tryInitManager('ui',            () => typeof UIManager !== 'undefined'           ? new UIManager(log) : null);
        this._tryInitManager('performance',   () => typeof PerformanceManager !== 'undefined'  ? new PerformanceManager(log) : null);
        this._tryInitManager('imageOptimizer',() => typeof ImageOptimizer !== 'undefined'      ? new ImageOptimizer(log) : null);

        // Audio buffer manager
        if (typeof AudioBufferManager !== 'undefined') {
            const abm = new AudioBufferManager(log);
            abm.setPlaylist(this.state.playlist);
            abm.setCallbacks({
                onLoadStart:    (_i, name)          => this._setStatus(`Loading: ${name}`),
                onLoadProgress: (_i, name, lo, tot) => this._setStatus(`Loading: ${name} (${Math.round((lo/tot)*100)}%)`),
                onLoadComplete: ()                  => {},
                onLoadError:    (_i, name, err)     => {
                    this.debugLog(`❌ Buffer load failed: ${name} — ${err.message}`, 'error');
                    this.managers.ui?.showToast(`Failed to load: ${name}`, 'error');
                },
                onMemoryWarning: pct => this.debugLog(`⚠️ Buffer memory at ${pct.toFixed(1)}%`, 'warning'),
            });
            this.managers.audioBuffer = abm;
            this._setWindowRef('audioBufferManager', abm);
        }

        // Parsing & editing
        this._tryInitManager('metadata',       () => typeof MetadataParser    !== 'undefined' ? new MetadataParser(log) : null);
        this._tryInitManager('vtt',            () => typeof VTTParser         !== 'undefined' ? new VTTParser(log) : null);
        this._tryInitManager('errorRecovery',  () => typeof ErrorRecovery     !== 'undefined' ? new ErrorRecovery(log) : null);
        this._tryInitManager('analysisParser', () => typeof AnalysisTextParser!== 'undefined' ? new AnalysisTextParser(log) : null);
        this._tryInitManager('metadataEditor', () => typeof MetadataEditor    !== 'undefined' ? new MetadataEditor(log) : null);
        this._tryInitManager('analyzer',       () => typeof MusicAnalyzer     !== 'undefined' ? new MusicAnalyzer(log) : null);
        this._tryInitManager('customMetadata', () => typeof CustomMetadataStore!== 'undefined'? new CustomMetadataStore() : null);
        this._tryInitManager('folderPersistence',()=> typeof FolderPersistence !== 'undefined'? new FolderPersistence() : null);

        // File loading
        if (typeof EnhancedFileLoadingManager !== 'undefined') {
            const flm = new EnhancedFileLoadingManager(log);
            flm.init({
                metadataParser:      this.managers.metadata,
                vttParser:           this.managers.vtt,
                analysisParser:      this.managers.analysisParser,
                customMetadataStore: this.managers.customMetadata,
                analyzer:            this.managers.analyzer,
                workerManager:       this.managers.worker,
                imageOptimizer:      this.managers.imageOptimizer,
            });
            this.managers.fileLoading = flm;
            this._setWindowRef('fileLoadingManager', flm);
            this.debugLog('✅ FileLoadingManager initialized', 'success');
        }

        // Custom background
        if (typeof CustomBackgroundManager !== 'undefined') {
            this.managers.customBackground = new CustomBackgroundManager(log);
            this._setWindowRef('customBackground', this.managers.customBackground);
            this.debugLog('✅ CustomBackgroundManager initialized', 'success');
        }

        // Playlist renderer
        if (typeof EnhancedPlaylistRenderer !== 'undefined') {
            const pr = new EnhancedPlaylistRenderer(log);
            pr.init({
                playlistContainer: document.getElementById('playlist-container'),
                playlistItems:     this.elements.playlistItems,
                playlistSearch:    this.elements.playlistSearch,
                clearButton:       this.elements.clearButton,
                jumpToCurrentBtn:  this.elements.jumpToCurrentBtn,
            });
            pr.setCallbacks({
                onTrackClick: idx => this.loadTrack(idx),
                onEditClick:  idx => this._editTrackMetadata(idx),
            });
            this.managers.playlistRenderer = pr;
            this._setWindowRef('playlistRenderer', pr);
            this.debugLog('✅ PlaylistRenderer initialized', 'success');
        }

        // Lyrics
        if (typeof LyricsManager !== 'undefined') {
            const lm = new LyricsManager(log);
            lm.init({
                lyricsDisplay:       this.elements.lyricsDisplay,
                exportButton:        this.elements.exportLyricsButton,
                fullscreenToggle:    this.elements.fsLyricsToggle,
                fullscreenContainer: this.elements.fsLyricsContainer,
                fullscreenContent:   this.elements.fsLyricsContent,
                fullscreenCloseBtn:  this.elements.fsLyricsClose,
                fullscreenPrevBtn:   this.elements.fsLyricsPrev,
                fullscreenNextBtn:   this.elements.fsLyricsNext,
            }, this.elements.player);

            lm.onNavigationRequest = action => {
                if (action === 'previous') this.playPrevious();
                else if (action === 'next') this.playNext();
            };
            lm.onGetTrackInfo = () => {
                if (this.state.currentTrackIndex === -1) return {};
                const t = this.state.playlist[this.state.currentTrackIndex];
                return {
                    title:  t.metadata?.title  || t.fileName,
                    artist: t.metadata?.artist || 'Unknown Artist',
                };
            };

            this.managers.lyrics = lm;
            this._setWindowRef('lyricsManager', lm);
            this.debugLog('✅ LyricsManager initialized', 'success');
        }

        this.debugLog('✅ All managers initialized', 'success');
    }

    _tryInitManager(key, factory) {
        try {
            const m = factory();
            if (m) {
                this.managers[key] = m;
                this._setWindowRef(`${key}Manager`, m);
            }
        } catch (err) {
            this.debugLog(`⚠️ ${key} init failed: ${err.message}`, 'warning');
        }
    }

    _connectManagersToPerformance() {
        const pm = this.managers.performance;
        if (!pm) { this.debugLog('⚠️ No PerformanceManager', 'warning'); return; }

        ['audioBuffer', 'lyrics', 'audioPipeline', 'ui'].forEach(key => {
            if (this.managers[key]) pm.connectManager(key, this.managers[key]);
        });

        this.debugLog('✅ Managers connected to PerformanceManager', 'success');
    }

    // ═══════════════════════════════════════════════════════════
    // AUDIO INITIALISATION
    // ═══════════════════════════════════════════════════════════

    _initAudio() {
        try {
            if (typeof AudioPipeline !== 'undefined' && this.elements.player) {
                const ap = new AudioPipeline(this.debugLog.bind(this));
                ap.init(this.elements.player);
                this.managers.audioPipeline = ap;

                this._setWindowRef('audioPipeline',      ap);
                this._setWindowRef('audioContext',       ap.audioContext);
                this._setWindowRef('sharedAudioSource',  ap.audioSource);
                this._setWindowRef('sharedBassFilter',   ap.bassFilter);
                this._setWindowRef('sharedMidFilter',    ap.midFilter);
                this._setWindowRef('sharedTrebleFilter', ap.trebleFilter);

                // 'audioContextReady' is dispatched by AudioPipeline.init() — do not re-dispatch here.
                this.debugLog('✅ AudioPipeline initialized', 'success');
                this._initAudioSubManagers();
            }

            if (typeof VolumeControl !== 'undefined' && this.elements.player) {
                this.managers.volume = new VolumeControl(this.elements.player, this.debugLog.bind(this));
                this._setWindowRef('volumeControl', this.managers.volume);
            }

            if (typeof CrossfadeManager !== 'undefined') {
                this.managers.crossfade = new CrossfadeManager(this.elements.player, this.debugLog.bind(this));
                // Pre-create the gain node so it is available when VolumeControl
                // calls reconnectAudioChainWithVolumeControl().
                this.managers.crossfade.initNodes();
            }

            if (window.backgroundAudioHandler) this._initBackgroundAudio();

            this.debugLog('✅ Audio system initialized', 'success');
        } catch (err) {
            this.debugLog(`⚠️ Audio init: ${err.message}`, 'warning');
        }
    }

    _initAudioSubManagers() {
        const log = this.debugLog.bind(this);
        const ap  = this.managers.audioPipeline;
        if (!ap?.isInitialized) return;

        try {
            if (typeof AudioPresetsManager !== 'undefined') {
                const apm = new AudioPresetsManager(ap.bassFilter, ap.midFilter, ap.trebleFilter, log);
                this.managers.audioPresets = apm;
                this._setWindowRef('audioPresetsManager', apm);
                this._populateEQPresets();
                this._setupEQPresetSelector();
                apm.loadSavedPreset();
                this.debugLog('✅ AudioPresetsManager initialized', 'success');
            }

            if (typeof AutoEQManager !== 'undefined' && this.managers.audioPresets) {
                this.managers.autoEQ = new AutoEQManager(this.managers.audioPresets, log);
                this._setWindowRef('autoEQManager', this.managers.autoEQ);
                this.debugLog('✅ AutoEQManager initialized', 'success');
            }
        } catch (err) {
            this.debugLog(`⚠️ Audio sub-manager init: ${err.message}`, 'warning');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // EQ PRESETS
    // ═══════════════════════════════════════════════════════════

    _populateEQPresets() {
        const dd = document.getElementById('eq-preset-select');
        if (!dd || !this.managers.audioPresets) return;

        const presets = this.managers.audioPresets.getPresetList();
        while (dd.options.length > 1) dd.remove(1);
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value       = p.id;
            opt.textContent = p.name;
            opt.title       = `${p.description}\n${p.philosophy}`;
            dd.appendChild(opt);
        });
        this.debugLog(`✅ Populated ${presets.length} EQ presets`, 'info');
    }

    _setupEQPresetSelector() {
        const dd = document.getElementById('eq-preset-select');
        if (!dd || !this.managers.audioPresets) return;

        const handler = e => {
            const id = e.target.value;
            if (!id || !this.managers.audioPresets) return;

            const track = this.state.playlist[this.state.currentTrackIndex];
            this.managers.audioPresets.applyPreset(id, track?.analysis ?? null);
            this.managers.audioPresets.saveCurrentPreset();

            // Disable Auto-EQ when a manual preset is chosen
            if (this.managers.autoEQ?.isEnabled()) {
                this.managers.autoEQ.setEnabled(false);
                const btn = document.getElementById('auto-eq-button');
                if (btn) {
                    btn.classList.remove('active');
                    const lbl = btn.querySelector('.sidebar-label');
                    if (lbl) lbl.textContent = 'Auto-EQ Off';
                }
            }
            this.debugLog(`🎛️ Applied preset: ${id}`, 'success');
        };

        dd.addEventListener('change', handler);
        this.resources.eventListeners.push({ element: dd, event: 'change', handler });
    }

    // ═══════════════════════════════════════════════════════════
    // VIEW MODE
    // ═══════════════════════════════════════════════════════════

    _applyViewMode(mode) {
        if (!this.elements.mainContent) return;

        const showPlaylistVolume = (mode === 'compact' || mode === 'full');
        const showFull           =  mode === 'full';

        this._setVisible(this.elements.sectionPlaylist, showPlaylistVolume);
        this._setVisible(this.elements.sectionVolume,   showPlaylistVolume);
        this._setVisible(this.elements.sectionLyrics,   showFull);
        this._setVisible(this.elements.sectionEQ,       showFull);
        this._setVisible(this.elements.sectionDropZone, showFull);

        this.elements.mainContent.classList.remove('mode-full', 'mode-compact', 'mode-mini');
        this.elements.mainContent.classList.add(`mode-${mode}`);

        this.managers.performance?.setMode(mode);
        this.debugLog(`View mode → ${mode}`, 'info');
    }

    // Kept as public so external callers (mobile.js, tests) can use it
    applyViewMode(mode) { this._applyViewMode(mode); }

    _setVisible(el, visible) {
        if (el) el.style.display = visible ? '' : 'none';
    }

    // ═══════════════════════════════════════════════════════════
    // rAF LOOP
    // ═══════════════════════════════════════════════════════════

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
        if (this.state.destroyed || !this.elements.player || this.elements.player.paused) {
            this._raf.id = null;
            return;
        }

        if (ts - this._raf.lastProgress >= 67) { // ~15 fps for progress bar
            this._raf.lastProgress = ts;
            this._renderProgress();
        }

        if (this.managers.lyrics &&
            (this.state.compactMode === 'full' || this.managers.lyrics.isFullscreenActive()) &&
            ts - this._raf.lastLyrics >= 100) {
            this._raf.lastLyrics = ts;
            this.managers.lyrics.update(this.elements.player.currentTime, this.state.compactMode);
        }

        this._raf.id = requestAnimationFrame(this._boundRafTick);
    }

    _renderProgress() {
        const p = this.elements.player;
        if (!p || !this.elements.progressBar) return;
        const dur = p.duration;
        if (!isFinite(dur) || dur <= 0) return;

        const pct = (p.currentTime / dur) * 100;
        if (Math.abs(pct - this._raf.lastPercent) < 0.05) return;
        this._raf.lastPercent = pct;

        this.elements.progressBar.style.width = `${pct}%`;
        if (this.elements.currentTimeDisplay)
            this.elements.currentTimeDisplay.textContent = this.formatTime(p.currentTime);
    }

    // ═══════════════════════════════════════════════════════════
    // SIDEBAR BUTTONS
    // ═══════════════════════════════════════════════════════════

    _setupSidebarButtons() {
        this._setupAutoEQButton();
        this._setupVolumeBoostButton();
        this._setupCrossfadeButton();
        this._setupDebugButton();
        this._setupCompactToggle();
        this._setupStorageStatsButton();
        this._setupCustomBackgroundButton();
        this._setupClearCacheButton();
        this._setupDeepAnalysisButton();
        this._setupLyricsFetcherButton();
        this.debugLog('✅ Sidebar buttons configured', 'success');
    }

    _setupAutoEQButton() {
        const btn = document.getElementById('auto-eq-button');
        if (!btn || !this.managers.autoEQ) return;

        const lbl = btn.querySelector('.sidebar-label');
        if (localStorage.getItem('autoEQEnabled') === 'true') {
            this.managers.autoEQ.setEnabled(true);
            btn.classList.add('active');
            if (lbl) lbl.textContent = 'Auto-EQ On';
        }
        btn.disabled = false;

        const handler = () => {
            if (!this.managers.autoEQ) return;
            const on = this.managers.autoEQ.toggle();
            btn.classList.toggle('active', on);
            if (lbl) lbl.textContent = on ? 'Auto-EQ On' : 'Auto-EQ Off';
            localStorage.setItem('autoEQEnabled', String(on));

            if (on && this.state.currentTrackIndex !== -1) {
                this.managers.autoEQ.applyAutoEQ(this.state.playlist[this.state.currentTrackIndex]);
            } else if (!on) {
                this.managers.audioPresets?.reset();
                const dd = document.getElementById('eq-preset-select');
                if (dd) dd.value = 'flat';
            }
            this.managers.ui?.showToast(`Auto-EQ ${on ? 'enabled' : 'disabled'}`, on ? 'success' : 'info');
        };
        this._wire(btn, 'click', handler);
    }

    _setupVolumeBoostButton() {
        const btn = document.getElementById('volume-boost-button');
        if (!btn || !this.managers.volume) return;

        const lbl = btn.querySelector('.sidebar-label');
        if (this.managers.volume.isBoostEnabled()) {
            btn.classList.add('active');
            if (lbl) lbl.textContent = 'Boost On';
        }

        const handler = () => {
            const on = !this.managers.volume.isBoostEnabled();
            this.managers.volume.setBoost(on, 1.5);
            btn.classList.toggle('active', on);
            if (lbl) lbl.textContent = on ? 'Boost On' : 'Boost Off';
            this.managers.ui?.showToast(`Volume Boost ${on ? 'enabled' : 'disabled'}`, on ? 'success' : 'info');
        };
        this._wire(btn, 'click', handler);
    }

    _setupCrossfadeButton() {
        const btn = document.getElementById('crossfade-button');
        if (!btn || !this.managers.crossfade) return;

        const lbl = btn.querySelector('.sidebar-label');
        if (localStorage.getItem('crossfadeEnabled') === 'true') {
            this.managers.crossfade.setEnabled(true);
            btn.classList.add('active');
            if (lbl) lbl.textContent = 'Crossfade On';
        }
        btn.disabled = false;

        const handler = () => {
            const on = !this.managers.crossfade.enabled;
            this.managers.crossfade.setEnabled(on);
            btn.classList.toggle('active', on);
            if (lbl) lbl.textContent = on ? 'Crossfade On' : 'Crossfade Off';
            localStorage.setItem('crossfadeEnabled', String(on));
            this.managers.ui?.showToast(`Crossfade ${on ? 'enabled' : 'disabled'}`, on ? 'success' : 'info');
        };
        this._wire(btn, 'click', handler);
    }

    _setupDebugButton() {
        const btn = document.getElementById('debug-toggle');
        if (!btn) return;
        const handler = () => {
            this.state.debugMode = !this.state.debugMode;
            btn.classList.toggle('active', this.state.debugMode);
            this.elements.debugPanel?.classList.toggle('visible', this.state.debugMode);
            this.debugLog(`Debug mode: ${this.state.debugMode ? 'ON' : 'OFF'}`, 'info');
        };
        this._wire(btn, 'click', handler);
    }

    _setupCompactToggle() {
        const btn = document.getElementById('compact-toggle');
        if (!btn) return;

        const MODES = ['full', 'compact', 'mini'];
        const NAMES = { full: 'Full View', compact: 'Compact', mini: 'Mini' };
        const saved = localStorage.getItem('compactMode') || 'full';

        this.state.compactMode = saved;
        this._applyViewMode(saved);

        const handler = () => {
            const next = MODES[(MODES.indexOf(this.state.compactMode) + 1) % MODES.length];
            this.state.compactMode = next;
            this._applyViewMode(next);
            localStorage.setItem('compactMode', next);
            const lbl = btn.querySelector('.sidebar-label');
            if (lbl) lbl.textContent = NAMES[next];
            this.managers.ui?.showToast(`View: ${NAMES[next]}`, 'info');
        };
        this._wire(btn, 'click', handler);
    }

    _setupStorageStatsButton() {
        const btn = document.getElementById('storage-stats-btn');
        if (!btn) return;
        const handler = async () => {
            try {
                let msg = '💾 Storage Information\n\n';
                if (navigator.storage?.estimate) {
                    const e = await navigator.storage.estimate();
                    const usedMB  = (e.usage  / 1048576).toFixed(2);
                    const totalMB = (e.quota  / 1048576).toFixed(2);
                    const pct     = ((e.usage / e.quota) * 100).toFixed(1);
                    msg += `Used: ${usedMB} MB / ${totalMB} MB (${pct}%)\n\n`;
                }
                if (this.managers.audioBuffer) {
                    const s = this.managers.audioBuffer.getStats();
                    msg += `Audio Buffer:\n- Memory: ${s.memoryUsedMB}\n- Cached: ${s.cachedTracks} tracks\n- Hit rate: ${s.hitRate}\n\n`;
                }
                if (this.managers.performance) {
                    const p = this.managers.performance.getStatsDisplay();
                    msg += `Performance:\n- FPS: ${p.fps}  Memory: ${p.memory}  CPU: ${p.cpuLoad}\n`;
                    msg += `- Active: ${p.activeResources.intervals} intervals, ${p.activeResources.animations} animations\n\n`;
                }
                msg += `Blob URLs: ${this.resources.blobURLs.size}\n`;
                msg += `Event listeners: ${this.resources.eventListeners.length}`;
                alert(msg);
            } catch (err) {
                this.debugLog(`Storage stats error: ${err.message}`, 'error');
                alert('Storage information not available');
            }
        };
        this._wire(btn, 'click', handler);
    }

    _setupCustomBackgroundButton() {
        const btn = document.getElementById('custom-bg-button');
        if (!btn) return;
        const handler = () => {
            if (this.managers.customBackground) this.managers.customBackground.showModal();
            else this.managers.ui?.showToast('Background picker not available', 'error');
        };
        this._wire(btn, 'click', handler);
    }

    _setupClearCacheButton() {
        const btn = document.getElementById('clear-cache-btn');
        if (!btn) return;
        const handler = async () => {
            if (!confirm('Clear all cached data? Your playlist will not be affected.')) return;
            try {
                this._revokeBlobURLs();
                this.managers.audioBuffer?.clearAllBuffers();
                this.colorCache.clear();
                if ('caches' in window) {
                    const names = await caches.keys();
                    await Promise.all(names.map(n => caches.delete(n)));
                }
                this.managers.ui?.showToast('Cache cleared', 'success');
                this.debugLog('✅ Cache cleared', 'success');
            } catch (err) {
                this.debugLog(`Cache clear error: ${err.message}`, 'error');
                this.managers.ui?.showToast('Error clearing cache', 'error');
            }
        };
        this._wire(btn, 'click', handler);
    }

    _setupDeepAnalysisButton() {
        const btn = document.getElementById('deep-analysis-btn');
        if (!btn) return;
        this._wire(btn, 'click', () =>
            window.open('deep-music-analysis.html', '_blank', 'width=1200,height=800')
        );
    }

    _setupLyricsFetcherButton() {
        const btn = document.getElementById('auto-lyrics-btn');
        if (!btn) return;
        this._wire(btn, 'click', () =>
            window.open('lyrics-fetcher.html', '_blank', 'width=1000,height=700')
        );
    }

    // ═══════════════════════════════════════════════════════════
    // FULLSCREEN LYRICS TOGGLE
    // ═══════════════════════════════════════════════════════════

    _setupFullscreenLyricsToggle() {
        const toggle = this.elements.fsLyricsToggle;
        if (!toggle || !this.managers.lyrics) return;

        // Single listener — LyricsManager owns all panel state; delegate entirely to it.
        // This prevents the double-listener race where script.js and LyricsManager each
        // registered a handler that fired in opposite directions on the same click.
        this._wire(toggle, 'click', () => {
            this.managers.lyrics.toggleFullscreen(!this.managers.lyrics.isFullscreenActive());
        });

        if (this.elements.fsLyricsClose) {
            this._wire(this.elements.fsLyricsClose, 'click', () => {
                this.managers.lyrics.toggleFullscreen(false);
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════════════════════════

    _setupKeyboardShortcuts() {
        const handler = e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key.toLowerCase()) {
                case ' ':           e.preventDefault(); this.togglePlayPause(); break;
                case 'arrowright':  e.preventDefault(); e.shiftKey ? this._seekForward()   : this.playNext();     break;
                case 'arrowleft':   e.preventDefault(); e.shiftKey ? this._seekBackward()  : this.playPrevious(); break;
                case 'arrowup':     e.preventDefault(); this.managers.volume?.increaseVolume(0.1); break;
                case 'arrowdown':   e.preventDefault(); this.managers.volume?.decreaseVolume(0.1); break;
                case 'm':           e.preventDefault(); this.managers.volume?.toggleMute(); break;
                case 's':           e.preventDefault(); this.toggleShuffle(); break;
                case 'l':           e.preventDefault(); this.cycleLoopMode(); break;
                case 'f':           if (this.managers.lyrics) { e.preventDefault(); this.managers.lyrics.toggleFullscreen(!this.managers.lyrics.isFullscreenActive()); } break;
                case 'd':           e.preventDefault(); this._toggleDebug(); break;
                case 'c': {
                    e.preventDefault();
                    const MODES = ['full', 'compact', 'mini'];
                    const next  = MODES[(MODES.indexOf(this.state.compactMode) + 1) % MODES.length];
                    this.state.compactMode = next;
                    this._applyViewMode(next);
                    localStorage.setItem('compactMode', next);
                    break;
                }
            }
        };

        this._wire(document, 'keydown', handler);
        this.debugLog('✅ Keyboard shortcuts enabled', 'success');
    }

    _toggleDebug() {
        this.state.debugMode = !this.state.debugMode;
        document.getElementById('debug-toggle')?.classList.toggle('active', this.state.debugMode);
        this.elements.debugPanel?.classList.toggle('visible', this.state.debugMode);
    }

    // ═══════════════════════════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════

    _setupEventListeners() {
        const p = this.elements.player;

        this._wire(p, 'ended',          () => this._handleTrackEnded());
        this._wire(p, 'loadedmetadata', () => this._handleMetadataLoaded());
        this._wire(p, 'error',          e  => this._handlePlayerError(e));
        this._wire(p, 'play',           () => this._handlePlay());
        this._wire(p, 'pause',          () => this._handlePause());
        this._wire(p, 'seeked',         () => {
            if (p.paused) {
                this._renderProgress();
                if (this.managers.lyrics &&
                    (this.state.compactMode === 'full' || this.managers.lyrics.isFullscreenActive()))
                    this.managers.lyrics.update(p.currentTime, this.state.compactMode);
            }
        });

        this._wire(this.elements.loadButton,      'click', () => this.loadFiles());
        this._wire(this.elements.folderButton,    'click', () => this.loadFromFolder());
        this._wire(this.elements.prevButton,      'click', () => this.playPrevious());
        this._wire(this.elements.nextButton,      'click', () => this.playNext());
        this._wire(this.elements.playPauseButton, 'click', () => this.togglePlayPause());
        this._wire(this.elements.shuffleButton,   'click', () => this.toggleShuffle());
        this._wire(this.elements.loopButton,      'click', () => this.cycleLoopMode());
        this._wire(this.elements.clearButton,     'click', () => this.clearPlaylist());

        // Pause rAF when tab is hidden, resume when visible again
        this._wire(document, 'visibilitychange', () => {
            if (document.hidden) this._rafStop();
            else if (p && !p.paused) this._rafStart();
        });

        if (this.elements.progressContainer) this._setupProgressBar();
        this._setupEqualizer();

        // Hide folder button on unsupported browsers
        // Hide folder button only when neither the native bridge nor the
        // directory picker API is available (e.g. Firefox desktop, old Safari)
        if (this.elements.folderButton &&
            !window.NativeBridge?.isNative() &&
            !('showDirectoryPicker' in window)) {
            this.elements.folderButton.style.display = 'none';
        }

        this.debugLog('✅ Event listeners registered', 'success');
    }

    // ─── Progress bar ─────────────────────────────────────────────────────────

    _setupProgressBar() {
        const container = this.elements.progressContainer;
        const player    = this.elements.player;
        if (!container || !player) return;

        let wasPlaying    = false;
        let resumeTimeout = null;

        const scheduleResume = () => {
            clearTimeout(resumeTimeout);
            resumeTimeout = setTimeout(() => {
                resumeTimeout = null;
                if (wasPlaying && !this.state.isSeekingProg) {
                    player.play().catch(e => this.debugLog(`Resume error: ${e.message}`, 'error'));
                }
            }, this.config.SEEK_RESUME_DELAY_MS);
        };

        const onMouseDown = () => {
            this.state.isSeekingProg = true;
            clearTimeout(resumeTimeout);
            wasPlaying = !player.paused;
            if (wasPlaying) player.pause();
        };

        const onMouseMove = e => {
            if (this.state.isSeekingProg) this._scrubProgress(e);
        };

        const onMouseUp = e => {
            if (!this.state.isSeekingProg) return;
            const newTime = this._scrubProgress(e);
            if (newTime !== null && isFinite(newTime)) {
                try { player.currentTime = newTime; } catch (_) {}
            }
            this.state.isSeekingProg = false;
            scheduleResume();
        };

        container.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove, { passive: true });
        document.addEventListener('mouseup',   onMouseUp,   { passive: true });

        this.resources.eventListeners.push(
            { element: container, event: 'mousedown', handler: onMouseDown },
            { element: document,  event: 'mousemove', handler: onMouseMove },
            { element: document,  event: 'mouseup',   handler: onMouseUp  }
        );
    }

    _scrubProgress(e) {
        const container = this.elements.progressContainer;
        const player    = this.elements.player;
        if (!container || !player) return null;

        const rect    = container.getBoundingClientRect();
        const pct     = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = pct * player.duration;

        if (this.elements.progressBar)
            this.elements.progressBar.style.width = `${pct * 100}%`;
        if (this.elements.currentTimeDisplay)
            this.elements.currentTimeDisplay.textContent = this.formatTime(newTime);

        this._raf.lastPercent = pct * 100;
        return newTime;
    }

    // ─── Equalizer ────────────────────────────────────────────────────────────

    _setupEqualizer() {
        [
            { slider: this.elements.eqBass,   display: this.elements.bassValue,   type: 'bass'   },
            { slider: this.elements.eqMid,    display: this.elements.midValue,    type: 'mid'    },
            { slider: this.elements.eqTreble, display: this.elements.trebleValue, type: 'treble' },
        ].forEach(({ slider, display, type }) => {
            if (!slider) return;
            const handler = e => {
                const v = parseFloat(e.target.value);
                if (display) display.textContent = `${v > 0 ? '+' : ''}${v} dB`;
                this._updateEQ(type, v);
            };
            this._wire(slider, 'input', handler);
        });

        if (this.elements.eqResetBtn)
            this._wire(this.elements.eqResetBtn, 'click', () => this._resetEQ());
    }

    _updateEQ(type, value) {
        const ap = this.managers.audioPipeline;
        if (!ap?.isInitialized) return;
        const filter = { bass: ap.bassFilter, mid: ap.midFilter, treble: ap.trebleFilter }[type];
        if (filter) ap.setGain(filter, value);
    }

    _resetEQ() {
        [
            [this.elements.eqBass,   this.elements.bassValue  ],
            [this.elements.eqMid,    this.elements.midValue   ],
            [this.elements.eqTreble, this.elements.trebleValue],
        ].forEach(([sl, disp]) => {
            if (!sl) return;
            sl.value = 0;
            if (disp) disp.textContent = '0 dB';
        });

        const ap = this.managers.audioPipeline;
        if (ap?.bassFilter) {
            ap.setGain(ap.bassFilter,   0);
            ap.setGain(ap.midFilter,    0);
            ap.setGain(ap.trebleFilter, 0);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FILE / FOLDER LOADING
    // ═══════════════════════════════════════════════════════════

    async loadFiles() {
        if (!this.managers.fileLoading) {
            this.managers.ui?.showToast('File loading not available', 'error');
            return;
        }

        // ── Native Android path ──────────────────────────────────────────────
        // Use the library browser instead of the system file picker so the user
        // can select individual songs without loading everything into RAM at once.
        if (window.NativeBridge?.isNative()) {
            return this._nativeBrowseAndLoad();
        }

        // ── Browser path (unchanged) ─────────────────────────────────────────
        try {
            const result = await this.managers.fileLoading.createFileInput();
            if (result?.success && result.playlist.length > 0) this._applyNewPlaylist(result.playlist);
        } catch (err) {
            if (err.name !== 'AbortError') this.debugLog(`Error loading files: ${err.message}`, 'error');
        }
    }

    async loadFromFolder(existingHandle = null) {
        // ── Native Android path ──────────────────────────────────────────────
        // showDirectoryPicker doesn't exist in WebView. Route through the
        // library browser instead — same permission check, no file picker crash.
        if (window.NativeBridge?.isNative()) {
            return this._nativeBrowseAndLoad();
        }

        // ── Browser path (unchanged) ─────────────────────────────────────────
        try {
            let dir = existingHandle;
            if (!dir) {
                if (!('showDirectoryPicker' in window)) {
                    this.managers.ui?.showToast('Folder selection not supported in this browser', 'error');
                    return;
                }
                dir = await window.showDirectoryPicker({ mode: 'read', startIn: 'music' });
            }

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
            if (err.name !== 'AbortError') this.debugLog(`Error loading folder: ${err.message}`, 'error');
        }
    }

    /**
     * Shared native-only flow used by both loadFiles() and loadFromFolder().
     * 1. Checks / requests the media permission.
     * 2. Opens the NativeFileBrowser so the user can pick individual songs.
     * 3. Passes only the selected descriptors to loadFromNativeDescriptors()
     *    which reads binary data in small batches — never all at once.
     */
    async _nativeBrowseAndLoad() {
        if (!this.managers.fileLoading) {
            this.managers.ui?.showToast('File loading not available', 'error');
            return;
        }

        try {
            // ── 1. Permission ────────────────────────────────────────────────
            const permState = await window.NativeBridge.checkMediaPermission();

            if (permState === 'denied') {
                this.managers.ui?.showToast(
                    'Music access is denied. Enable it in Android Settings → App Permissions.',
                    'error'
                );
                return;
            }

            if (permState !== 'granted') {
                const granted = await window.NativeBridge.requestMediaPermission();
                if (!granted) {
                    this.managers.ui?.showToast('Music access is required to load songs.', 'warning');
                    return;
                }
            }

            // ── 2. Open the library browser ──────────────────────────────────
            if (typeof NativeFileBrowser === 'undefined') {
                this.debugLog('NativeFileBrowser not loaded — falling back to file picker', 'warning');
                return this.managers.fileLoading.createFileInput();
            }

            const browser     = new NativeFileBrowser(this.debugLog.bind(this));
            const descriptors = await browser.open();   // rejects with AbortError on cancel

            if (!descriptors?.length) return;

            // ── 3. Load selected files in batches ────────────────────────────
            const result = await this.managers.fileLoading.loadFromNativeDescriptors(descriptors);
            if (result?.success && result.playlist.length > 0) {
                this._applyNewPlaylist(result.playlist);
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                this.debugLog(`Native browse error: ${err.message}`, 'error');
            }
        }
    }

    _applyNewPlaylist(playlist) {
        this.state.playlist          = playlist;
        this.state.currentTrackIndex = -1;
        this.state.shuffledPlaylist  = [];

        this.managers.audioBuffer?.setPlaylist(playlist);
        this._updatePlaylist();
        this._savePlaylistToStorage();
        this.managers.ui?.showToast(`Loaded ${playlist.length} track${playlist.length !== 1 ? 's' : ''}`, 'success');
        this._startBackgroundAnalysis();
        this.loadTrack(0);
    }

    // ═══════════════════════════════════════════════════════════
    // TRACK LOADING
    // ═══════════════════════════════════════════════════════════

    async loadTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        // Cancel any in-progress crossfade so manual track changes are instant.
        this.managers.crossfade?.cancelFade();

        this._cleanupCurrentTrack();
        this.managers.performance?.cleanupForTrackChange();

        this.state.currentTrackIndex = index;
        this.managers.audioBuffer?.setCurrentIndex(index);
        const track = this.state.playlist[index];

        this.debugLog(`Loading track ${index + 1}: ${track.fileName}`, 'info');

        if (track.metadata) {
            this._displayMetadata(track.metadata);
        } else {
            this._clearMetadata();
            if (this.elements.trackTitle) this.elements.trackTitle.textContent = track.fileName;
        }

        // Per-track volume memory
        if (this.managers.volume && track.metadata) {
            const id = `${track.metadata.artist || 'Unknown'}_${track.metadata.title || track.fileName}`;
            if (!this.managers.volume.applyTrackVolume(id) && track.analysis) {
                this.managers.volume.applyVolume(this.managers.volume.getVolume(), true, track.analysis);
            }
        }

        if (this.managers.autoEQ?.isEnabled() && track.analysis) {
            this.managers.autoEQ.applyAutoEQ(track);
        }

        // Audio source — prefer pre-buffered; fall back to direct URL
        const capturedIdx = index;

        if (this.managers.audioBuffer && track.file) {
            this.managers.audioBuffer.getBuffer(capturedIdx)
                .then(buffer => {
                    if (this.state.currentTrackIndex !== capturedIdx || !this.elements.player) return;
                    const mime = track.file.type || 'audio/mpeg';
                    const url  = URL.createObjectURL(new Blob([buffer], { type: mime }));
                    this.resources.blobURLs.add(url);
                    this._setPlayerSrc(url, track);
                    this.managers.audioBuffer.preloadUpcoming(capturedIdx);
                })
                .catch(() => this._playFromURL(track));
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

        this.managers.playlistRenderer?.updateHighlight(index);

        if (this.elements.prevButton) this.elements.prevButton.disabled = false;
        if (this.elements.nextButton) this.elements.nextButton.disabled = false;

        this._updateMediaSession();
    }

    _setPlayerSrc(src, track) {
        const player = this.elements.player;
        if (!player) return;
        player.src = src;
        player.load();
        if (track.analysis?.silence?.start > 0.1)
            player.currentTime = track.analysis.silence.start;
        player.play().catch(e => this.debugLog(`Playback failed: ${e.message}`, 'warning'));
    }

    _playFromURL(track) {
        if (!track) return;

        // Create a fresh blob URL from the raw File object if available
        if (track.file) {
            if (track.audioURL?.startsWith('blob:')) {
                this._revokeBlobURL(track.audioURL);
            }
            track.audioURL = URL.createObjectURL(track.file);
            this.resources.blobURLs.add(track.audioURL);
        }

        if (!track.audioURL) {
            this.debugLog('No audio URL available for track', 'error');
            return;
        }

        this._setPlayerSrc(track.audioURL, track);
    }

    // ═══════════════════════════════════════════════════════════
    // BLOB URL MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    _cleanupCurrentTrack() {
        // Only revoke if it's a buffer-generated blob, not the track's own audioURL
        const src = this.elements.player?.src;
        if (src?.startsWith('blob:') && !this._isTrackAudioURL(src)) {
            this._revokeBlobURL(src);
        }
    }

    /** Returns true if the given URL is the audioURL of any track (should not be revoked). */
    _isTrackAudioURL(url) {
        return this.state.playlist.some(t => t.audioURL === url);
    }

    _revokeBlobURL(url) {
        if (!url?.startsWith('blob:')) return;
        try { URL.revokeObjectURL(url); } catch (_) {}
        this.resources.blobURLs.delete(url);
    }

    _revokeBlobURLs() {
        this.resources.blobURLs.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
        this.resources.blobURLs.clear();
    }

    // ═══════════════════════════════════════════════════════════
    // METADATA DISPLAY
    // ═══════════════════════════════════════════════════════════

    _displayMetadata(metadata) {
        if (!metadata) return;

        if (this.elements.trackTitle)  this.elements.trackTitle.textContent  = metadata.title  || 'Unknown Title';
        if (this.elements.trackArtist) this.elements.trackArtist.textContent = metadata.artist || 'Unknown Artist';
        if (this.elements.trackAlbum)  this.elements.trackAlbum.textContent  = metadata.album  || 'Unknown Album';

        if (metadata.image && this.elements.coverArt) {
            this.elements.coverArt.src = metadata.image;
            this.elements.coverArt.onload = () => {
                this.elements.coverArt.classList.add('loaded');
                if (this.elements.coverPlaceholder) this.elements.coverPlaceholder.style.display = 'none';
                this._applyAlbumColor(this._extractAlbumColor(this.elements.coverArt));
            };
            this.elements.coverArt.onerror = () => {
                this.elements.coverArt.src = '';
                this.elements.coverArt.classList.remove('loaded');
                if (this.elements.coverPlaceholder) this.elements.coverPlaceholder.style.display = 'flex';
                this._applyAlbumColor(null);
            };
        } else if (this.elements.coverArt) {
            this.elements.coverArt.src = '';
            this.elements.coverArt.classList.remove('loaded');
            if (this.elements.coverPlaceholder) this.elements.coverPlaceholder.style.display = 'flex';
            this._applyAlbumColor(null);
        }
    }

    _clearMetadata() {
        if (this.elements.trackTitle)  this.elements.trackTitle.textContent  = 'No track loaded';
        if (this.elements.trackArtist) this.elements.trackArtist.textContent = '--';
        if (this.elements.trackAlbum)  this.elements.trackAlbum.textContent  = '--';
        if (this.elements.coverArt) {
            this.elements.coverArt.src = '';
            this.elements.coverArt.classList.remove('loaded');
        }
        if (this.elements.coverPlaceholder) this.elements.coverPlaceholder.style.display = 'flex';
        this.managers.lyrics?.clearLyrics();
        this._applyAlbumColor(null);
    }

    // ═══════════════════════════════════════════════════════════
    // ALBUM COLOR EXTRACTION
    // ═══════════════════════════════════════════════════════════

    _extractAlbumColor(imgEl) {
        if (!imgEl?.complete || !imgEl.naturalWidth) return null;

        const cacheKey = imgEl.src;
        if (this.colorCache.has(cacheKey)) return this.colorCache.get(cacheKey);

        try {
            const SIZE   = 50;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = SIZE;
            const ctx  = canvas.getContext('2d');
            ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);

            const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
            let r = 0, g = 0, b = 0, count = 0;

            for (let i = 0; i < data.length; i += 4) {
                const lum = (data[i] + data[i+1] + data[i+2]) / 3;
                if (lum > 20 && lum < 235) {
                    r += data[i]; g += data[i+1]; b += data[i+2];
                    count++;
                }
            }
            if (!count) return null;

            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            const color = {
                r, g, b,
                rgb:     `rgb(${r},${g},${b})`,
                rgba:    a  => `rgba(${r},${g},${b},${a})`,
                darken:  d  => `rgb(${Math.max(0,r-d)},${Math.max(0,g-d)},${Math.max(0,b-d)})`,
                lighten: d  => `rgb(${Math.min(255,r+d)},${Math.min(255,g+d)},${Math.min(255,b+d)})`,
            };

            this.colorCache.set(cacheKey, color);
            return color;
        } catch (err) {
            this.debugLog(`Color extraction failed: ${err.message}`, 'warning');
            return null;
        }
    }

    _applyAlbumColor(color) {
        this._setWindowRef('albumColors', color || null);

        if (this.managers.lyrics) this.managers.lyrics.setDominantColor?.(color);

        const mc = this.elements.metadataContainer || document.getElementById('metadata-container');

        if (!color) {
            if (mc) {
                mc.style.background  = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)';
                mc.style.boxShadow   = '0 8px 32px rgba(220,53,69,0.2)';
                mc.style.border      = '';
            }
            if (!document.body.classList.contains('custom-bg')) {
                document.body.style.backgroundImage = `
                    radial-gradient(circle at top right, rgba(220,53,69,0.05), transparent 40%),
                    radial-gradient(circle at bottom left, rgba(0,123,255,0.05), transparent 40%)`;
            }
            return;
        }

        if (mc) {
            mc.style.background  = `linear-gradient(135deg, ${color.darken(40)} 0%, ${color.darken(60)} 100%)`;
            mc.style.boxShadow   = `0 8px 32px ${color.rgba(0.4)}`;
            mc.style.border      = `1px solid ${color.rgba(0.3)}`;
        }

        if (!document.body.classList.contains('custom-bg')) {
            document.body.style.backgroundImage = `
                radial-gradient(circle at top right, ${color.rgba(0.15)}, transparent 40%),
                radial-gradient(circle at bottom left, ${color.rgba(0.1)}, transparent 40%)`;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PLAYLIST HELPERS
    // ═══════════════════════════════════════════════════════════

    _updatePlaylist() {
        this.managers.playlistRenderer?.setPlaylist(this.state.playlist, this.state.currentTrackIndex);
        this._updatePlaylistStatus();
    }

    _updatePlaylistStatus() {
        const n = this.state.playlist.length;
        this._setStatus(`${n} track${n !== 1 ? 's' : ''} loaded`);
        if (this.elements.clearButton)   this.elements.clearButton.disabled   = n === 0;
        if (this.elements.shuffleButton) this.elements.shuffleButton.disabled = n === 0;
        if (this.elements.loopButton)    this.elements.loopButton.disabled    = n === 0;
    }

    _setStatus(text) {
        if (this.elements.playlistStatus) this.elements.playlistStatus.textContent = text;
    }

    _updateMediaSession() {
        if (!('mediaSession' in navigator) || this.state.currentTrackIndex === -1) return;
        const track = this.state.playlist[this.state.currentTrackIndex];
        const meta  = track.metadata || {};
        navigator.mediaSession.metadata = new MediaMetadata({
            title:   meta.title  || track.fileName,
            artist:  meta.artist || 'Unknown Artist',
            album:   meta.album  || 'Unknown Album',
            artwork: meta.image  ? [{ src: meta.image, sizes: '512x512', type: 'image/png' }] : [],
        });
        window.backgroundAudioHandler?.updateMediaSessionMetadata?.();
    }

    // ═══════════════════════════════════════════════════════════
    // PLAYBACK CONTROLS
    // ═══════════════════════════════════════════════════════════

    togglePlayPause() {
        const p = this.elements.player;
        if (!p) return;
        if (p.paused) p.play().catch(e => this.debugLog(`Play failed: ${e.message}`, 'error'));
        else          p.pause();
    }

    _seekForward()  { const p = this.elements.player; if (p) p.currentTime = Math.min(p.currentTime + 5, p.duration || 0); }
    _seekBackward() { const p = this.elements.player; if (p) p.currentTime = Math.max(p.currentTime - 5, 0); }

    playNext() {
        if (this.state.playlist.length === 0) return;
        this._rememberCurrentVolume();

        let next;
        if (this.state.isShuffled && this.state.shuffledPlaylist.length > 0) {
            const pos = this.state.shuffledPlaylist.indexOf(this.state.currentTrackIndex);
            const nxt = pos + 1;
            if (nxt >= this.state.shuffledPlaylist.length) {
                if (this.state.loopMode === 'all') next = this.state.shuffledPlaylist[0];
                else return;
            } else {
                next = this.state.shuffledPlaylist[nxt];
            }
        } else {
            next = this.state.currentTrackIndex + 1;
            if (next >= this.state.playlist.length) {
                if (this.state.loopMode === 'all') next = 0;
                else return;
            }
        }

        if (next >= 0 && next < this.state.playlist.length) this.loadTrack(next);
    }

    playPrevious() {
        if (this.state.playlist.length === 0) return;

        if (this.state.isShuffled && this.state.shuffledPlaylist.length > 0) {
            const pos = this.state.shuffledPlaylist.indexOf(this.state.currentTrackIndex);

            if (pos === -1) {
                // Current track not in shuffle list — just go to adjacent
                if (this.state.currentTrackIndex > 0) this.loadTrack(this.state.currentTrackIndex - 1);
                else if (this.state.loopMode === 'all') this.loadTrack(this.state.playlist.length - 1);
                return;
            }

            const prevPos = pos - 1;
            if (prevPos < 0) {
                if (this.state.loopMode === 'all') {
                    const last = this.state.shuffledPlaylist[this.state.shuffledPlaylist.length - 1];
                    if (last !== undefined) this.loadTrack(last);
                }
                return;
            }

            const prev = this.state.shuffledPlaylist[prevPos];
            if (prev !== undefined) this.loadTrack(prev);
        } else {
            if (this.state.currentTrackIndex > 0)
                this.loadTrack(this.state.currentTrackIndex - 1);
            else if (this.state.loopMode === 'all')
                this.loadTrack(this.state.playlist.length - 1);
        }
    }

    _rememberCurrentVolume() {
        if (this.state.currentTrackIndex === -1 || !this.managers.volume) return;
        const t  = this.state.playlist[this.state.currentTrackIndex];
        const id = `${t.metadata?.artist || 'Unknown'}_${t.metadata?.title || t.fileName}`;
        this.managers.volume.rememberTrackVolume?.(id, this.managers.volume.getVolume());
    }

    toggleShuffle() {
        this.state.isShuffled = !this.state.isShuffled;
        this.elements.shuffleButton?.classList.toggle('active', this.state.isShuffled);

        if (this.state.isShuffled) {
            // Build index array and Fisher-Yates shuffle
            const arr = [...Array(this.state.playlist.length).keys()];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            // Ensure current track is first so "next" doesn't repeat it
            const ci = arr.indexOf(this.state.currentTrackIndex);
            if (ci !== -1) { arr.splice(ci, 1); arr.unshift(this.state.currentTrackIndex); }
            this.state.shuffledPlaylist = arr;
        } else {
            this.state.shuffledPlaylist = [];
        }

        this.managers.audioBuffer?.setShuffleState(this.state.isShuffled);
        this.managers.ui?.showToast(`Shuffle ${this.state.isShuffled ? 'on' : 'off'}`, 'info');
    }

    cycleLoopMode() {
        const MODES = ['off', 'all', 'one'];
        const LABELS = { off: 'Loop Off', all: 'Loop All', one: 'Loop One' };
        this.state.loopMode = MODES[(MODES.indexOf(this.state.loopMode) + 1) % MODES.length];

        const btn = this.elements.loopButton;
        if (btn) {
            btn.classList.toggle('active',   this.state.loopMode !== 'off');
            btn.classList.toggle('loop-one', this.state.loopMode === 'one');
            const lbl = btn.querySelector('.control-label');
            if (lbl) lbl.textContent = LABELS[this.state.loopMode];
        }

        this.managers.ui?.showToast(`Loop: ${this.state.loopMode}`, 'info');
    }

    clearPlaylist() {
        if (!confirm('Clear playlist?')) return;

        this.managers.crossfade?.cancelFade();
        this._rafStop();
        this.managers.fileLoading?.cleanupPlaylist(this.state.playlist);
        this.managers.audioBuffer?.clearAllBuffers();
        this._revokeBlobURLs();

        this.state.playlist          = [];
        this.state.currentTrackIndex = -1;
        this.state.shuffledPlaylist  = [];

        const p = this.elements.player;
        if (p) { p.pause(); p.src = ''; }

        this._clearMetadata();
        this._updatePlaylist();

        this._raf.lastPercent = -1;
        if (this.elements.progressBar)        this.elements.progressBar.style.width            = '0%';
        if (this.elements.currentTimeDisplay) this.elements.currentTimeDisplay.textContent = '0:00';
        if (this.elements.durationDisplay)    this.elements.durationDisplay.textContent    = '0:00';

        if (this.elements.prevButton) this.elements.prevButton.disabled = true;
        if (this.elements.nextButton) this.elements.nextButton.disabled = true;
    }

    // ═══════════════════════════════════════════════════════════
    // AUDIO EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════

    _handleMetadataLoaded() {
        if (!this.elements.durationDisplay || !this.elements.player) return;
        const dur = this.elements.player.duration;
        this.elements.durationDisplay.textContent = isFinite(dur) ? this.formatTime(dur) : '0:00';
        // Now that player.duration is available, schedule the crossfade point.
        this._startCrossfadeMonitoring();
    }

    _handlePlay() {
        const ap = this.managers.audioPipeline;
        if (ap?.isInitialized && ap.audioContext.state === 'suspended') ap.resume();
        window.backgroundAudioHandler?.updatePlaybackState?.('playing');
        this.managers.performance?.setPlayState(true);
        this._rafStart();
    }

    _handlePause() {
        window.backgroundAudioHandler?.updatePlaybackState?.('paused');
        this.managers.performance?.setPlayState(false);
        this._rafStop();
    }

    _handleTrackEnded() {
        this._rafStop();
        if (this.state.loopMode === 'one' && this.elements.player) {
            this.elements.player.currentTime = 0;
            this.elements.player.play().catch(() => {});
        } else {
            this.playNext();
        }
    }

    _handlePlayerError(e) {
        if (this.state.currentTrackIndex === -1) return;
        this.managers.errorRecovery?.handleAudioError(
            this.elements.player,
            this.state.playlist[this.state.currentTrackIndex]
        );
    }

    // ─── Crossfade helpers ────────────────────────────────────────────────────────

    /**
     * Returns the playlist index of the next track based on the current
     * shuffle/loop state, or -1 when there is no next track.
     */
    _nextTrackIndex() {
        const { playlist, currentTrackIndex, isShuffled, shuffledPlaylist, loopMode } = this.state;
        if (playlist.length === 0) return -1;

        if (isShuffled && shuffledPlaylist.length > 0) {
            const pos = shuffledPlaylist.indexOf(currentTrackIndex);
            const nxt = pos + 1;
            if (nxt >= shuffledPlaylist.length) {
                return loopMode === 'all' ? shuffledPlaylist[0] : -1;
            }
            return shuffledPlaylist[nxt];
        }

        const next = currentTrackIndex + 1;
        if (next >= playlist.length) {
            return loopMode === 'all' ? 0 : -1;
        }
        return next;
    }

    /**
     * Wire CrossfadeManager.startMonitoring() for the current track.
     * Called from _handleMetadataLoaded() once player.duration is available.
     * Silently exits when crossfade/gapless are both disabled or no next track exists.
     */
    _startCrossfadeMonitoring() {
        const cf = this.managers.crossfade;
        if (!cf) return;
        if (!cf.enabled && !cf.gaplessEnabled) return;
        if (this.state.currentTrackIndex === -1) return;

        const nextIdx = this._nextTrackIndex();
        if (nextIdx === -1) return;

        const currentTrack = this.state.playlist[this.state.currentTrackIndex];
        const nextTrack    = this.state.playlist[nextIdx];

        cf.startMonitoring(
            this.elements.player,
            currentTrack,
            nextTrack,
            (payload) => this._loadTrackViaCrossfade(nextIdx, payload),
        );
    }

    /**
     * Loads a track as initiated by the CrossfadeManager callback.
     *
     * Deliberately skips cancelFade() and _cleanupCurrentTrack() so the
     * fade-out in progress continues uninterrupted. Everything else mirrors
     * loadTrack() to keep the UI fully consistent.
     *
     * @param {number} index   - Playlist index of the track to load.
     * @param {object} payload - { track, startTime, preloadedURL } from CrossfadeManager
     */
    _loadTrackViaCrossfade(index, { startTime = 0, preloadedURL = null } = {}) {
        if (index < 0 || index >= this.state.playlist.length) return;

        this.managers.performance?.cleanupForTrackChange();

        this.state.currentTrackIndex = index;
        this.managers.audioBuffer?.setCurrentIndex(index);
        const track = this.state.playlist[index];

        this.debugLog(`Crossfade switching to track ${index + 1}: ${track.fileName}`, 'info');

        if (track.metadata) {
            this._displayMetadata(track.metadata);
        } else {
            this._clearMetadata();
            if (this.elements.trackTitle) this.elements.trackTitle.textContent = track.fileName;
        }

        if (this.managers.volume && track.metadata) {
            const id = `${track.metadata.artist || 'Unknown'}_${track.metadata.title || track.fileName}`;
            if (!this.managers.volume.applyTrackVolume(id) && track.analysis) {
                this.managers.volume.applyVolume(this.managers.volume.getVolume(), true, track.analysis);
            }
        }
        if (this.managers.autoEQ?.isEnabled() && track.analysis) {
            this.managers.autoEQ.applyAutoEQ(track);
        }

        // Resolve audio source: prefer preloaded blob URL, then fall back
        const player = this.elements.player;
        let src = preloadedURL;
        if (!src) {
            if (track.file) {
                src = URL.createObjectURL(track.file);
                this.resources.blobURLs.add(src);
            } else if (track.audioURL) {
                src = track.audioURL;
            }
        }

        if (src) {
            player.src = src;
            player.load();
            if (startTime > 0) {
                try { player.currentTime = startTime; } catch (_) {}
            }
            player.play().catch(e => this.debugLog(`Crossfade playback failed: ${e.message}`, 'warning'));
        } else {
            this.debugLog('No audio source for crossfade target track', 'error');
        }

        // Lyrics
        if (track.vtt && this.managers.vtt && this.managers.lyrics) {
            this.managers.vtt.loadVTTFile(track.vtt)
                .then(cues => this.managers.lyrics.loadLyrics(cues))
                .catch(() => this.managers.lyrics?.clearLyrics());
        } else {
            this.managers.lyrics?.clearLyrics();
        }

        this.managers.playlistRenderer?.updateHighlight(index);
        if (this.elements.prevButton) this.elements.prevButton.disabled = false;
        if (this.elements.nextButton) this.elements.nextButton.disabled = false;
        this._updateMediaSession();
    }

    // ═══════════════════════════════════════════════════════════
    // BACKGROUND ANALYSIS
    // ═══════════════════════════════════════════════════════════

    async _startBackgroundAnalysis() {
        if (this.state.backgroundAnalysisRunning || !this.managers.analyzer) return;
        this.state.backgroundAnalysisRunning = true;

        const pending = this.state.playlist
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => !track.analysis && track.file);

        for (let i = 0; i < pending.length; i += 3) {
            if (this.state.destroyed || this.state.playlist.length === 0) break;

            await Promise.all(pending.slice(i, i + 3).map(async ({ track, index }) => {
                if (this.state.playlist[index] !== track) return;
                try {
                    // Use the raw File object — never rely on blob URLs that may be revoked
                    const analysis = await this.managers.analyzer.analyzeTrack(track.file, track.fileName);
                    this.state.playlist[index].analysis = analysis;
                } catch { /* best-effort */ }
            }));

            this._updatePlaylist();
            await new Promise(r => setTimeout(r, 500));
        }

        this.state.backgroundAnalysisRunning = false;
    }

    // ═══════════════════════════════════════════════════════════
    // PERSISTENCE
    // ═══════════════════════════════════════════════════════════

    _savePlaylistToStorage() {
        try {
            localStorage.setItem('savedPlaylist', JSON.stringify(
                this.state.playlist.map(t => ({
                    fileName: t.fileName,
                    metadata: t.metadata,
                    hasVTT:   !!t.vtt,
                    duration: t.duration,
                }))
            ));
        } catch (e) {
            this.debugLog(`Could not save playlist: ${e.message}`, 'warning');
        }
    }

    async _restoreState() {
        try {
            if (localStorage.getItem('crossfadeEnabled') === 'true') this.managers.crossfade?.setEnabled(true);
            if (localStorage.getItem('autoEQEnabled')    === 'true') this.managers.autoEQ?.setEnabled(true);
            this.managers.audioBuffer?.setShuffleState(this.state.isShuffled);
        } catch (e) {
            this.debugLog(`Restore state error: ${e.message}`, 'warning');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // METADATA EDITOR
    // ═══════════════════════════════════════════════════════════

    _editTrackMetadata(index) {
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
                this.managers.customMetadata?.save(
                    this.state.playlist[trackIndex].fileName,
                    this.state.playlist[trackIndex].duration || 0,
                    newMeta
                );

                this.state.playlist[trackIndex].metadata = {
                    ...this.state.playlist[trackIndex].metadata,
                    ...newMeta,
                    hasMetadata: true,
                };

                this._updatePlaylist();
                if (trackIndex === this.state.currentTrackIndex)
                    this._displayMetadata(this.state.playlist[trackIndex].metadata);
            }
        );
    }

    // ═══════════════════════════════════════════════════════════
    // BACKGROUND AUDIO (Media Session)
    // ═══════════════════════════════════════════════════════════

    async _initBackgroundAudio() {
        try {
            const ok = await window.backgroundAudioHandler.init({
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

    // ═══════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════

    /** Register an event listener and track it for cleanup. */
    _wire(el, event, handler, opts) {
        if (!el) return;
        el.addEventListener(event, handler, opts);
        this.resources.eventListeners.push({ element: el, event, handler });
    }

    _setWindowRef(key, value) {
        window[key] = value;
        this.resources.windowRefs.add(key);
    }

    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    debugLog(message, type = 'info') {
        const PREFIXES = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const prefix   = PREFIXES[type] ?? 'ℹ️';

        if (type === 'error') console.error(`${prefix} ${message}`);
        else if (this.state.debugMode) console.log(`${prefix} ${message}`);

        if (this.elements.debugPanel && this.state.debugMode) {
            const entry       = document.createElement('div');
            entry.className   = `debug-entry debug-${type}`;
            entry.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
            this.elements.debugPanel.appendChild(entry);
            while (this.elements.debugPanel.children.length > 100)
                this.elements.debugPanel.removeChild(this.elements.debugPanel.firstChild);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DESTROY
    // ═══════════════════════════════════════════════════════════

    destroy() {
        if (this.state.destroyed) return;
        this.debugLog('🧹 Destroying MusicPlayerApp…', 'info');

        this._rafStop();

        const p = this.elements.player;
        if (p) { p.pause(); p.src = ''; }

        this._revokeBlobURLs();

        this.resources.eventListeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this.resources.eventListeners = [];

        const MANAGERS = [
            'performance', 'audioBuffer', 'audioPipeline', 'lyrics', 'ui',
            'volume', 'crossfade', 'metadata', 'vtt', 'errorRecovery',
            'analysisParser', 'metadataEditor', 'analyzer', 'customMetadata',
            'folderPersistence', 'fileLoading', 'customBackground',
            'playlistRenderer', 'audioPresets', 'autoEQ', 'worker', 'imageOptimizer',
        ];
        MANAGERS.forEach(key => {
            try { this.managers[key]?.destroy?.(); } catch (e) {
                this.debugLog(`⚠️ Failed to destroy ${key}: ${e.message}`, 'warning');
            }
        });

        this.colorCache.clear();

        this.resources.windowRefs.forEach(key => { try { delete window[key]; } catch (_) {} });
        this.resources.windowRefs.clear();

        this.managers = {};
        this.elements = {};
        this.state.destroyed   = true;
        this.state.initialized = false;

        console.log('✅ MusicPlayerApp destroyed');
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Initializing — v5.1');
    window.musicPlayerApp = new MusicPlayerApp();
    window.musicPlayerApp.init();
});

console.log('✅ script.js v5.1 loaded');