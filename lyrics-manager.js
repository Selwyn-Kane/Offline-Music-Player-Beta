/* ============================================
   LYRICS MANAGER v2.2
   High-performance synced lyrics display.
   ============================================ */

class LyricsManager {

    constructor(debugLog = console.log) {
        this._log = debugLog;

        // Core data
        this.cues            = [];
        this.currentTrackId  = null;
        this.currentCueIndex = -1;

        // Cached DOM line references — rebuilt on each render
        this._normalLines     = [];  // <div> refs for normal view
        this._fullscreenLines = [];  // <div> refs for fullscreen view

        // DOM refs set by init()
        this.elements = {
            lyricsDisplay:       null,
            exportButton:        null,
            fullscreenContainer: null,
            fullscreenContent:   null,
            fullscreenToggle:    null,
            player:              null,
        };

        // State
        this.state = {
            fullscreen:   false,
            mode:         this._loadDisplayMode(),
            autoScroll:   true,
            karaokeMode:  false,
            searchActive: false,
        };

        // Colors for fullscreen theming
        this.colors = {
            primary:    { r: 220, g:  53, b:  69 },
            secondary:  { r: 255, g: 119, b: 136 },
            background: { r:  10, g:  10, b:  10 },
            accent:     { r: 220, g:  53, b:  69 },
        };

        // Callbacks supplied by script.js
        this.onGetTrackInfo       = null;
        this.onNavigationRequest  = null;

        // Optional vttParser dependency — set via init() or directly
        this.vttParser = null;

        // Tracked handles for teardown
        this._listeners    = [];  // { element, event, handler }
        this._searchTimer  = null;

        this._initDatabase();
        this._log('✅ LyricsManager v2.2 initialized', 'success');
    }

    // ─── Database ─────────────────────────────────────────────────────────────

    _initDatabase() {
        try {
            const req = indexedDB.open('LyricsCache', 1);
            req.onerror         = () => this._log('⚠️ IndexedDB unavailable', 'warning');
            req.onsuccess       = (e) => { this._db = e.target.result; };
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('lyrics')) {
                    db.createObjectStore('lyrics', { keyPath: 'trackId' });
                }
            };
        } catch {
            this._log('⚠️ Database init failed', 'warning');
        }
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    init(elements, player) {
        this.elements = {
            lyricsDisplay:       elements.lyricsDisplay,
            exportButton:        elements.exportButton,
            fullscreenToggle:    elements.fullscreenToggle,
            fullscreenContainer: elements.fullscreenContainer,
            fullscreenContent:   elements.fullscreenContent,
            player,
        };

        this._setupControls();
        this._setupEventHandlers(elements);
        this._setupKeyboardShortcuts();
        this._restoreState();
        this._log('🎤 Lyrics UI initialized', 'success');
    }

    _wire(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler);
        this._listeners.push({ element, event, handler });
    }

    _setupControls() {
        if (!this.elements.lyricsDisplay) return;

        const panel = document.createElement('div');
        panel.className = 'lyrics-control-panel';
        panel.innerHTML = `
            <button id="lyrics-search-btn"   title="Search lyrics (Ctrl+F)">🔍</button>
            <button id="lyrics-mode-toggle"  title="Toggle display mode">📖</button>
            <button id="lyrics-auto-scroll"  class="active" title="Auto-scroll">📜</button>
            <button id="lyrics-karaoke-mode" title="Karaoke mode">🎤</button>
            <button id="lyrics-settings-btn" title="Settings">⚙️</button>
        `;

        if (this.elements.exportButton) {
            this.elements.lyricsDisplay.insertBefore(panel, this.elements.exportButton);
        } else {
            this.elements.lyricsDisplay.appendChild(panel);
        }

        this._createSearchOverlay();
    }

    _createSearchOverlay() {
        const overlay = document.createElement('div');
        overlay.id        = 'lyrics-search-overlay';
        overlay.className = 'lyrics-search-hidden';
        overlay.innerHTML = `
            <input type="text" id="lyrics-search-input" placeholder="Search lyrics...">
            <div id="lyrics-search-results"></div>
            <button id="lyrics-search-close">✕</button>
        `;
        this.elements.lyricsDisplay.appendChild(overlay);
    }

    _setupEventHandlers(elements) {
        const { lyricsDisplay } = this.elements;

        // Export button
        if (this.elements.exportButton) {
            this._wire(this.elements.exportButton, 'click', (e) => {
                if (e.ctrlKey) { e.preventDefault(); this.copyToClipboard(); }
                else           { this._showExportMenu(); }
            });
        }

        // Control panel buttons — use event delegation on the panel
        const panel = lyricsDisplay?.querySelector('.lyrics-control-panel');
        if (panel) {
            this._wire(panel, 'click', (e) => {
                const id = e.target.id;
                if (id === 'lyrics-search-btn')   this.toggleSearch();
                if (id === 'lyrics-mode-toggle')  this.cycleDisplayMode();
                if (id === 'lyrics-auto-scroll')  this.toggleAutoScroll();
                if (id === 'lyrics-karaoke-mode') this.toggleKaraokeMode();
                if (id === 'lyrics-settings-btn') this._showSettings();
            });
        }

        // Search
        const searchInput = document.getElementById('lyrics-search-input');
        const searchClose = document.getElementById('lyrics-search-close');
        if (searchInput) {
            this._wire(searchInput, 'input',   (e) => this._handleSearch(e.target.value));
            this._wire(searchInput, 'keydown', (e) => { if (e.key === 'Escape') this.toggleSearch(); });
        }
        if (searchClose) this._wire(searchClose, 'click', () => this.toggleSearch());

        // Fullscreen toggle
        if (this.elements.fullscreenToggle) {
            this._wire(this.elements.fullscreenToggle, 'click', () =>
                this.toggleFullscreen(!this.state.fullscreen)
            );
        }

        // Fullscreen navigation / close
        const fs = (id) => elements[id] || document.getElementById(id);
        if (elements.fullscreenCloseBtn)
            this._wire(elements.fullscreenCloseBtn, 'click', () => this.toggleFullscreen(false));
        if (elements.fullscreenPrevBtn)
            this._wire(elements.fullscreenPrevBtn, 'click', () => this.onNavigationRequest?.('previous'));
        if (elements.fullscreenNextBtn)
            this._wire(elements.fullscreenNextBtn, 'click', () => this.onNavigationRequest?.('next'));

        // Lyric line clicks — use event delegation on the containers
        if (lyricsDisplay) {
            this._wire(lyricsDisplay, 'click', (e) => {
                const line = e.target.closest('.lyric-line[data-start-time]');
                if (line && this.elements.player)
                    this.elements.player.currentTime = parseFloat(line.dataset.startTime);
            });
        }
        if (this.elements.fullscreenContent) {
            this._wire(this.elements.fullscreenContent, 'click', (e) => {
                const line = e.target.closest('.fullscreen-lyric-line[data-start-time]');
                if (line && this.elements.player)
                    this.elements.player.currentTime = parseFloat(line.dataset.startTime);
            });
        }
    }

    _setupKeyboardShortcuts() {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'f' && this.cues.length > 0) {
                e.preventDefault();
                this.toggleSearch();
            }
            if (e.key === 'Escape') {
                if (this.state.fullscreen)       this.toggleFullscreen(false);
                else if (this.state.searchActive) this.toggleSearch();
            }
            if ((e.key === 'k' || e.key === 'K') && this.state.fullscreen) {
                e.preventDefault();
                this.toggleKaraokeMode();
            }
        };
        this._wire(document, 'keydown', handler);
    }

    // ─── Color management ─────────────────────────────────────────────────────

    setDominantColor(color) {
        if (!color) {
            this.colors.primary    = { r: 220, g:  53, b:  69 };
            this.colors.secondary  = { r: 255, g: 119, b: 136 };
            this.colors.background = { r:  10, g:  10, b:  10 };
            this.colors.accent     = { r: 220, g:  53, b:  69 };
        } else {
            this.colors.primary = color;
            const hsl = this._rgbToHsl(color.r, color.g, color.b);
            this.colors.secondary  = this._hslToRgb(hsl.h, Math.min(100, hsl.s * 1.2), Math.min(90, hsl.l * 1.5));
            this.colors.accent     = this._hslToRgb(hsl.h, 100, Math.max(45, Math.min(65, hsl.l)));
            this.colors.background = this._hslToRgb(hsl.h, Math.max(30, hsl.s * 0.6), 18);
        }
        if (this.state.fullscreen) this._updateFullscreenBackground();
    }

    _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    _hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        if (s === 0) {
            const v = Math.round(l * 255);
            return { r: v, g: v, b: v };
        }
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return {
            r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
            g: Math.round(hue2rgb(p, q, h)       * 255),
            b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
        };
    }

    // ─── Lyrics loading ───────────────────────────────────────────────────────

    async loadLyrics(cues, trackId = null) {
        this.cues            = cues;
        this.currentTrackId  = trackId || this._makeTrackId();
        this.currentCueIndex = -1;

        if (this._db && trackId) {
            try {
                const tx    = this._db.transaction(['lyrics'], 'readwrite');
                const store = tx.objectStore('lyrics');
                store.put({ trackId, cues, timestamp: Date.now() });
            } catch { /* non-fatal */ }
        }

        this._renderNormalLyrics();
        if (this.state.fullscreen) this._renderFullscreenLyrics();

        this._log(`📝 Loaded ${cues.length} lyric cues`, 'success');
    }

    async loadCachedLyrics(trackId) {
        if (!this._db) return null;
        try {
            return new Promise((resolve) => {
                const tx    = this._db.transaction(['lyrics'], 'readonly');
                const store = tx.objectStore('lyrics');
                const req   = store.get(trackId);
                req.onsuccess = () => resolve(req.result?.cues ?? null);
                req.onerror   = () => resolve(null);
            });
        } catch { return null; }
    }

    clearLyrics() {
        this.cues            = [];
        this.currentTrackId  = null;
        this.currentCueIndex = -1;
        this._normalLines     = [];
        this._fullscreenLines = [];

        if (this.elements.lyricsDisplay) {
            const panel   = this.elements.lyricsDisplay.querySelector('.lyrics-control-panel');
            const overlay = this.elements.lyricsDisplay.querySelector('#lyrics-search-overlay');
            this.elements.lyricsDisplay.innerHTML = '';
            if (panel)                         this.elements.lyricsDisplay.appendChild(panel);
            if (overlay)                       this.elements.lyricsDisplay.appendChild(overlay);
            if (this.elements.exportButton)    this.elements.lyricsDisplay.appendChild(this.elements.exportButton);

            const placeholder = document.createElement('div');
            placeholder.className   = 'lyric-line';
            placeholder.textContent = 'Lyrics will appear here when a track is loaded.';
            this.elements.lyricsDisplay.appendChild(placeholder);
        }

        if (this.elements.exportButton) this.elements.exportButton.disabled = true;
        if (this.state.fullscreen)       this.toggleFullscreen(false);
    }

    _makeTrackId() {
        if (this.onGetTrackInfo) {
            const info = this.onGetTrackInfo();
            return `${info.artist}_${info.title}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        }
        return `track_${Date.now()}`;
    }

    // ─── Normal lyrics rendering ──────────────────────────────────────────────

    _renderNormalLyrics() {
        if (!this.elements.lyricsDisplay) return;

        // Remove only existing lyric lines — preserve control panel and search overlay
        this.elements.lyricsDisplay.querySelectorAll('.lyric-line').forEach(el => el.remove());
        this._normalLines = [];

        if (this.cues.length === 0) {
            const p = document.createElement('div');
            p.className   = 'lyric-line';
            p.textContent = 'No lyrics available for this track.';
            this.elements.lyricsDisplay.appendChild(p);
            if (this.elements.exportButton) this.elements.exportButton.disabled = true;
            return;
        }

        const fragment = document.createDocumentFragment();
        this.cues.forEach((cue, index) => {
            const line = document.createElement('div');
            line.className          = 'lyric-line';
            line.textContent        = cue.text.replace(/\r?\n|\r/g, ' ');
            line.dataset.index      = index;
            line.dataset.startTime  = cue.startTime;
            fragment.appendChild(line);
            this._normalLines.push(line);
        });
        this.elements.lyricsDisplay.appendChild(fragment);

        if (this.elements.exportButton) this.elements.exportButton.disabled = false;
        this._applyDisplayMode();
    }

    updateNormalHighlight(currentTime, compactMode) {
        if (compactMode === 'mini' || compactMode === 'compact') return;
        if (!this._normalLines.length) return;

        let activeIndex = -1;
        for (let i = 0; i < this.cues.length; i++) {
            if (currentTime >= this.cues[i].startTime && currentTime < this.cues[i].endTime) {
                activeIndex = i; break;
            }
        }

        if (activeIndex === this.currentCueIndex) return;

        // Remove active from old line
        if (this.currentCueIndex >= 0 && this._normalLines[this.currentCueIndex]) {
            this._normalLines[this.currentCueIndex].classList.remove('active');
        }

        this.currentCueIndex = activeIndex;

        if (activeIndex >= 0 && this._normalLines[activeIndex]) {
            const line = this._normalLines[activeIndex];
            line.classList.add('active');
            if (this.state.autoScroll && !this.state.searchActive) {
                this._scrollIntoView(line, this.elements.lyricsDisplay);
            }
        }
    }

    _scrollIntoView(line, container) {
        if (!line || !container) return;
        const lr = line.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        if (lr.top < cr.top || lr.bottom > cr.bottom) {
            container.scrollTo({
                top:      Math.max(0, line.offsetTop - container.clientHeight / 2 + line.offsetHeight / 2),
                behavior: 'smooth',
            });
        }
    }

    // ─── Fullscreen lyrics ────────────────────────────────────────────────────

    toggleFullscreen(show) {
        if (!this.elements.fullscreenContainer) return;

        if (show && this.cues.length === 0) {
            this._log('⚠️ No lyrics available for fullscreen view', 'warning');
            return;
        }

        this.state.fullscreen = show;

        if (show) {
            this.elements.fullscreenContainer.classList.remove('fullscreen-lyrics-hidden');
            this.elements.fullscreenContainer.classList.add('show');
            this._renderFullscreenLyrics();
            this._updateFullscreenBackground();
            if (this.elements.fullscreenToggle) {
                this.elements.fullscreenToggle.classList.add('active');
                this.elements.fullscreenToggle.textContent = '🎤 Exit Lyrics';
            }
        } else {
            this.elements.fullscreenContainer.classList.add('fullscreen-lyrics-hidden');
            this.elements.fullscreenContainer.classList.remove('show');
            if (this.elements.fullscreenToggle) {
                this.elements.fullscreenToggle.classList.remove('active');
                this.elements.fullscreenToggle.textContent = '🎤 Fullscreen Lyrics';
            }
        }

        this._saveState();
    }

    _renderFullscreenLyrics() {
        if (!this.elements.fullscreenContent) return;
        this.elements.fullscreenContent.innerHTML = '';
        this._fullscreenLines = [];

        if (this.cues.length === 0) {
            this.elements.fullscreenContent.innerHTML = '<div class="fullscreen-lyrics-empty">No lyrics available</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        this.cues.forEach((cue, index) => {
            const line = document.createElement('div');
            line.className         = 'fullscreen-lyric-line';
            line.textContent       = cue.text.replace(/\r?\n|\r/g, ' ');
            line.dataset.index     = index;
            line.dataset.startTime = cue.startTime;
            const alpha            = 0.4 + (index / this.cues.length) * 0.2;
            line.style.color       = `rgba(255,255,255,${alpha})`;
            fragment.appendChild(line);
            this._fullscreenLines.push(line);
        });
        this.elements.fullscreenContent.appendChild(fragment);
    }

    updateFullscreenHighlight(currentTime) {
        if (!this.state.fullscreen || !this._fullscreenLines.length) return;

        let activeIndex = -1;
        for (let i = 0; i < this.cues.length; i++) {
            if (currentTime >= this.cues[i].startTime && currentTime < this.cues[i].endTime) {
                activeIndex = i; break;
            }
        }

        if (activeIndex === this._fsCueIndex && !this.state.karaokeMode) return;

        // Reset previously active line
        if (this._fsCueIndex >= 0 && this._fsCueIndex !== activeIndex) {
            const prev = this._fullscreenLines[this._fsCueIndex];
            if (prev) {
                const alpha = 0.4 + (this._fsCueIndex / this.cues.length) * 0.2;
                prev.classList.remove('active');
                prev.style.color      = `rgba(255,255,255,${alpha})`;
                prev.style.textShadow = 'none';
                prev.style.transform  = 'scale(1)';
                prev.textContent      = this.cues[this._fsCueIndex].text.replace(/\r?\n|\r/g, ' ');
            }
        }

        this._fsCueIndex = activeIndex;

        if (activeIndex >= 0) {
            const line   = this._fullscreenLines[activeIndex];
            const accent = this.colors.accent;
            line.classList.add('active');
            line.style.color      = `rgb(${accent.r},${accent.g},${accent.b})`;
            line.style.textShadow = `0 0 30px rgba(${accent.r},${accent.g},${accent.b},0.8)`;
            line.style.transform  = 'scale(1.05)';
            line.style.transition = 'all 0.4s cubic-bezier(0.175,0.885,0.32,1.275)';

            if (this.state.karaokeMode) this._applyKaraokeEffect(line, currentTime);

            if (this.state.autoScroll) {
                this._scrollIntoView(line, this.elements.fullscreenContent);
            }
        }
    }

    _applyKaraokeEffect(line, currentTime) {
        const cue = this.cues[parseInt(line.dataset.index)];
        if (!cue || cue.endTime <= cue.startTime) return;

        const progress    = Math.max(0, Math.min(1, (currentTime - cue.startTime) / (cue.endTime - cue.startTime)));
        const text        = cue.text;
        const revealLen   = Math.floor(text.length * progress);
        const accent      = this.colors.accent;

        // Use textContent for each span to avoid injection — rebuild via DOM
        line.innerHTML = '';   // clear first

        const revealed = document.createElement('span');
        revealed.style.color = `rgb(${accent.r},${accent.g},${accent.b})`;
        revealed.textContent = text.substring(0, revealLen);

        const remaining = document.createElement('span');
        remaining.style.opacity = '0.5';
        remaining.textContent   = text.substring(revealLen);

        line.appendChild(revealed);
        line.appendChild(remaining);
    }

    _updateFullscreenBackground() {
        if (!this.elements.fullscreenContainer) return;
        const { primary: p, background: bg, secondary: s } = this.colors;
        this.elements.fullscreenContainer.style.background = `
            radial-gradient(
                ellipse at center,
                rgba(${p.r},${p.g},${p.b},0.25)  0%,
                rgba(${bg.r},${bg.g},${bg.b},0.95) 40%,
                rgba(${s.r},${s.g},${s.b},0.15)  70%,
                rgba(0,0,0,1) 100%
            )
        `;
        this.elements.fullscreenContainer.style.transition = 'background 0.8s ease';
    }

    // ─── Display modes ────────────────────────────────────────────────────────

    cycleDisplayMode() {
        const modes = ['default', 'compact', 'large'];
        this.state.mode = modes[(modes.indexOf(this.state.mode) + 1) % modes.length];
        this._applyDisplayMode();
        this._saveDisplayMode();
        this._log(`📖 Display mode: ${this.state.mode}`, 'info');
    }

    _applyDisplayMode() {
        if (!this.elements.lyricsDisplay) return;
        this.elements.lyricsDisplay.classList.remove('lyrics-compact', 'lyrics-large');
        if (this.state.mode === 'compact') this.elements.lyricsDisplay.classList.add('lyrics-compact');
        if (this.state.mode === 'large')   this.elements.lyricsDisplay.classList.add('lyrics-large');
    }

    toggleAutoScroll() {
        this.state.autoScroll = !this.state.autoScroll;
        document.getElementById('lyrics-auto-scroll')?.classList.toggle('active', this.state.autoScroll);
        this._saveState();
    }

    toggleKaraokeMode() {
        this.state.karaokeMode = !this.state.karaokeMode;
        document.getElementById('lyrics-karaoke-mode')?.classList.toggle('active', this.state.karaokeMode);
        this._saveState();
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    toggleSearch() {
        this.state.searchActive = !this.state.searchActive;
        const overlay = document.getElementById('lyrics-search-overlay');
        const input   = document.getElementById('lyrics-search-input');
        overlay?.classList.toggle('lyrics-search-hidden', !this.state.searchActive);
        if (this.state.searchActive) {
            setTimeout(() => input?.focus(), 100);
        } else {
            if (input) input.value = '';
            this._clearSearchResults();
        }
    }

    _handleSearch(query) {
        clearTimeout(this._searchTimer);
        if (!query || query.length < 2) { this._clearSearchResults(); return; }
        this._searchTimer = setTimeout(() => this._performSearch(query), 200);
    }

    _performSearch(query) {
        // Escape special regex characters so user input is treated as a literal string
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re      = new RegExp(escaped, 'gi');
        const results = this.cues
            .map((cue, index) => ({ index, cue }))
            .filter(({ cue }) => cue.text.toLowerCase().includes(query.toLowerCase()));
        this._displaySearchResults(results, re);
    }

    _displaySearchResults(results, re) {
        const div = document.getElementById('lyrics-search-results');
        if (!div) return;
        div.innerHTML = '';

        if (!results.length) {
            const msg = document.createElement('div');
            msg.className   = 'search-no-results';
            msg.textContent = 'No results found';
            div.appendChild(msg);
            return;
        }

        results.forEach(({ cue }) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';

            const timeSpan = document.createElement('span');
            timeSpan.className   = 'search-result-time';
            timeSpan.textContent = this._formatTime(cue.startTime);

            const textSpan = document.createElement('span');
            textSpan.className = 'search-result-text';

            // Build highlighted text safely — no innerHTML with raw cue text
            const raw   = cue.text;
            let   last  = 0;
            let   match;
            re.lastIndex = 0;
            while ((match = re.exec(raw)) !== null) {
                if (match.index > last) {
                    textSpan.appendChild(document.createTextNode(raw.slice(last, match.index)));
                }
                const mark = document.createElement('mark');
                mark.textContent = match[0];
                textSpan.appendChild(mark);
                last = re.lastIndex;
            }
            if (last < raw.length) textSpan.appendChild(document.createTextNode(raw.slice(last)));

            item.appendChild(timeSpan);
            item.appendChild(textSpan);
            item.addEventListener('click', () => {
                if (this.elements.player) this.elements.player.currentTime = cue.startTime;
                this.toggleSearch();
            });
            div.appendChild(item);
        });
    }

    _clearSearchResults() {
        const div = document.getElementById('lyrics-search-results');
        if (div) div.innerHTML = '';
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    _showExportMenu() {
        const menu = document.createElement('div');
        menu.className = 'lyrics-export-menu';

        const actions = [
            { label: '💾 Text File (.txt)',     action: () => this.exportToFile('txt') },
            { label: '🎵 LRC File (.lrc)',       action: () => this.exportToFile('lrc') },
            { label: '📹 SRT File (.srt)',        action: () => this.exportToFile('srt') },
            { label: '📋 Copy to Clipboard',     action: () => this.copyToClipboard()   },
        ];

        actions.forEach(({ label, action }) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.addEventListener('click', () => { action(); menu.remove(); });
            menu.appendChild(btn);
        });

        const rect = this.elements.exportButton.getBoundingClientRect();
        menu.style.cssText = `position:absolute;top:${rect.bottom + 5}px;right:20px`;
        document.body.appendChild(menu);

        const close = (e) => {
            if (!menu.contains(e.target) && e.target !== this.elements.exportButton) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 100);
    }

    exportToFile(format = 'txt') {
        if (!this.cues.length) return;
        let trackName = 'Unknown Track', artist = 'Unknown Artist';
        if (this.onGetTrackInfo) {
            const info = this.onGetTrackInfo();
            trackName  = info.title  || trackName;
            artist     = info.artist || artist;
        }

        const map = {
            txt: { content: () => this._genText(trackName, artist), ext: `${trackName} - Lyrics.txt` },
            lrc: { content: () => this._genLRC(trackName, artist),  ext: `${trackName}.lrc` },
            srt: { content: () => this._genSRT(),                   ext: `${trackName}.srt` },
        };
        const { content, ext } = map[format] ?? map.txt;

        const a    = Object.assign(document.createElement('a'), {
            href:     URL.createObjectURL(new Blob([content()], { type: 'text/plain;charset=utf-8' })),
            download: ext,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        this._log(`💾 Exported as ${format.toUpperCase()}`, 'success');
    }

    _genText(trackName, artist) {
        const sep  = '='.repeat(50);
        const body = this.cues.map(c => `[${this._formatTime(c.startTime)}] ${c.text}`).join('\n');
        return `${trackName}\nArtist: ${artist}\n${sep}\n\n${body}\n\n${sep}\nExported ${new Date().toLocaleString()}\n`;
    }

    _genLRC(trackName, artist) {
        const body = this.cues.map(c => `[${this._formatLRCTime(c.startTime)}]${c.text}`).join('\n');
        return `[ti:${trackName}]\n[ar:${artist}]\n[by:Local Music Player]\n\n${body}\n`;
    }

    _genSRT() {
        return this.cues.map((c, i) =>
            `${i + 1}\n${this._formatSRTTime(c.startTime)} --> ${this._formatSRTTime(c.endTime)}\n${c.text}\n`
        ).join('\n');
    }

    copyToClipboard() {
        if (!this.cues.length) return;
        navigator.clipboard.writeText(this.cues.map(c => c.text).join('\n')).then(() => {
            this._log('📋 Copied to clipboard', 'success');
            if (this.elements.exportButton) {
                const orig = this.elements.exportButton.textContent;
                this.elements.exportButton.textContent = '✓ Copied!';
                setTimeout(() => { this.elements.exportButton.textContent = orig; }, 2000);
            }
        }).catch(err => this._log(`Failed to copy: ${err.message}`, 'error'));
    }

    // ─── Settings modal ───────────────────────────────────────────────────────

    _showSettings() {
        const modal = document.createElement('div');
        modal.className = 'lyrics-settings-modal';
        modal.innerHTML = `
            <div class="lyrics-settings-content">
                <h3>Lyrics Settings</h3>
                <div class="settings-group">
                    <label><input type="checkbox" id="setting-auto-scroll" ${this.state.autoScroll   ? 'checked' : ''}> Auto-scroll</label>
                    <label><input type="checkbox" id="setting-karaoke"     ${this.state.karaokeMode  ? 'checked' : ''}> Karaoke mode</label>
                </div>
                <div class="settings-group">
                    <label>Display Mode:
                        <select id="setting-display-mode">
                            <option value="default" ${this.state.mode === 'default' ? 'selected' : ''}>Default</option>
                            <option value="compact" ${this.state.mode === 'compact' ? 'selected' : ''}>Compact</option>
                            <option value="large"   ${this.state.mode === 'large'   ? 'selected' : ''}>Large</option>
                        </select>
                    </label>
                </div>
                <button id="settings-clear-cache">🗑️ Clear Lyrics Cache</button>
                <button id="settings-close">Close</button>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#setting-auto-scroll').onchange = (e) => {
            this.state.autoScroll = e.target.checked; this._saveState();
        };
        modal.querySelector('#setting-karaoke').onchange = (e) => {
            this.state.karaokeMode = e.target.checked; this._saveState();
        };
        modal.querySelector('#setting-display-mode').onchange = (e) => {
            this.state.mode = e.target.value; this._applyDisplayMode(); this._saveDisplayMode();
        };
        modal.querySelector('#settings-clear-cache').onclick = () => {
            this._clearCache();
            this._log('🗑️ Lyrics cache cleared', 'success');
        };
        modal.querySelector('#settings-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    async _clearCache() {
        if (this._db) {
            try {
                const tx = this._db.transaction(['lyrics'], 'readwrite');
                tx.objectStore('lyrics').clear();
            } catch { this._log('Failed to clear DB cache', 'error'); }
        }
    }

    // ─── DB helpers (public API for script.js) ────────────────────────────────

    async saveLyricsToDB(trackId, lyrics) {
        if (!this._db) return;
        try {
            let cues = lyrics;
            if (typeof lyrics === 'string') {
                if (!this.vttParser) {
                    this._log('⚠️ saveLyricsToDB: vttParser not set — cannot convert LRC string', 'warning');
                    return;
                }
                cues = this.vttParser.parseVTTContent(this.vttParser.convertLRCToVTT(lyrics));
            }
            const tx = this._db.transaction(['lyrics'], 'readwrite');
            tx.objectStore('lyrics').put({ trackId, cues, timestamp: Date.now() });
        } catch (err) {
            this._log(`Failed to save lyrics: ${err.message}`, 'error');
        }
    }

    getLyricsFromDB(trackId) {
        return this.loadCachedLyrics(trackId);
    }

    async fetchLyricsOnline(artist, title) {
        try {
            const url      = `https://lrclib.net/api/get?artist=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.syncedLyrics ?? null;
        } catch (err) {
            this._log(`❌ Online lyrics fetch failed: ${err.message}`, 'error');
            return null;
        }
    }

    // ─── State persistence ────────────────────────────────────────────────────

    _loadDisplayMode() {
        try { return localStorage.getItem('lyricsDisplayMode') || 'default'; }
        catch { return 'default'; }
    }

    _saveDisplayMode() {
        try { localStorage.setItem('lyricsDisplayMode', this.state.mode); }
        catch { this._log('Failed to save display mode', 'warning'); }
    }

    _restoreState() {
        try {
            const saved = localStorage.getItem('lyricsState');
            if (saved) {
                const s = JSON.parse(saved);
                this.state.autoScroll  = s.autoScroll  !== false;
                this.state.karaokeMode = s.karaokeMode || false;
            }
        } catch { /* non-fatal */ }
    }

    _saveState() {
        try {
            localStorage.setItem('lyricsState', JSON.stringify({
                autoScroll:  this.state.autoScroll,
                karaokeMode: this.state.karaokeMode,
            }));
        } catch { this._log('Failed to save state', 'warning'); }
    }

    // ─── Main update (called from script.js) ─────────────────────────────────

    update(currentTime, compactMode) {
        if (compactMode !== 'mini' && compactMode !== 'compact') {
            this.updateNormalHighlight(currentTime, compactMode);
        }
        if (this.state.fullscreen) {
            this.updateFullscreenHighlight(currentTime);
        }
    }

    // ─── Formatting ───────────────────────────────────────────────────────────

    _formatTime(s) {
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    }

    _formatLRCTime(s) {
        const m  = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = Math.floor(s % 60).toString().padStart(2, '0');
        const ms = Math.floor((s % 1) * 100).toString().padStart(2, '0');
        return `${m}:${ss}.${ms}`;
    }

    _formatSRTTime(s) {
        const h  = Math.floor(s / 3600).toString().padStart(2, '0');
        const m  = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        const ss = Math.floor(s % 60).toString().padStart(2, '0');
        const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
        return `${h}:${m}:${ss},${ms}`;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    hasCues()           { return this.cues.length > 0; }
    getCues()           { return this.cues; }
    isFullscreenActive(){ return this.state.fullscreen; }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;

        this._listeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this._listeners = [];

        if (this._db) { this._db.close(); this._db = null; }

        this._normalLines     = [];
        this._fullscreenLines = [];

        this._log('🎤 LyricsManager destroyed', 'info');
    }

    /** Alias for callers using the old name. */
    dispose() { this.destroy(); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = LyricsManager;
if (typeof window !== 'undefined')                   window.LyricsManager = LyricsManager;
