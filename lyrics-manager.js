/* ============================================
   Optimized Lyrics Manager v2.1
   High-performance lyrics without visualizer
   ============================================ */

class LyricsManager {
    constructor(debugLog) {
        this.debugLog = debugLog;
        
        // Core data
        this.cues = [];
        this.currentTrackId = null;
        this.currentCueIndex = -1;
        
        // DOM references
        this.elements = {
            lyricsDisplay: null,
            exportButton: null,
            fullscreenContainer: null,
            fullscreenCanvas: null,
            fullscreenContent: null,
            fullscreenToggle: null,
            player: null
        };
        
        // State management
        this.state = {
            fullscreen: false,
            mode: this.loadDisplayMode(),
            autoScroll: true,
            karaokeMode: false,
            searchActive: false,
            isVisible: true
        };
        
        // Performance optimization
        this.cache = new Map();
        
        // Color system
        this.colors = {
            primary: { r: 220, g: 53, b: 69 },
            secondary: { r: 255, g: 119, b: 136 },
            background: { r: 10, g: 10, b: 10 },
            text: { r: 255, g: 255, b: 255 },
            accent: { r: 220, g: 53, b: 69 }
        };
        
        // Callbacks
        this.onGetTrackInfo = null;
        this.onNavigationRequest = null;
        
        // Throttling
        this.lastUpdate = 0;
        this.updateInterval = 100; // ms between updates
        
        this.initDatabase();
        this.debugLog('✅ Optimized LyricsManager v2.1 initialized', 'success');
    }
    
    // ============================================
    // INITIALIZATION
    // ============================================
    
    async initDatabase() {
        try {
            const request = indexedDB.open('LyricsCache', 1);
            
            request.onerror = () => {
                this.debugLog('⚠️ IndexedDB unavailable', 'warning');
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.debugLog('💾 Database initialized', 'success');
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('lyrics')) {
                    db.createObjectStore('lyrics', { keyPath: 'trackId' });
                }
            };
        } catch (e) {
            this.debugLog('⚠️ Database init failed', 'warning');
        }
    }
    
    init(elements, player) {
        this.elements = {
            lyricsDisplay: elements.lyricsDisplay,
            exportButton: elements.exportButton,
            fullscreenToggle: elements.fullscreenToggle,
            fullscreenContainer: elements.fullscreenContainer,
            fullscreenCanvas: elements.fullscreenCanvas,
            fullscreenContent: elements.fullscreenContent,
            player: player
        };
        
        this.setupControls();
        this.setupEventHandlers(elements);
        this.setupKeyboardShortcuts();
        this.restoreState();
        
        this.debugLog('🎤 Lyrics UI initialized', 'success');
    }
    
    setupControls() {
        if (!this.elements.lyricsDisplay) return;
        
        const controlPanel = document.createElement('div');
        controlPanel.className = 'lyrics-control-panel';
        controlPanel.innerHTML = `
            <button id="lyrics-search-btn" title="Search lyrics (Ctrl+F)">🔍</button>
            <button id="lyrics-mode-toggle" title="Toggle display mode">📖</button>
            <button id="lyrics-auto-scroll" class="active" title="Auto-scroll">📜</button>
            <button id="lyrics-karaoke-mode" title="Karaoke mode">🎤</button>
            <button id="lyrics-settings-btn" title="Settings">⚙️</button>
        `;
        
        if (this.elements.exportButton) {
            this.elements.lyricsDisplay.insertBefore(controlPanel, this.elements.exportButton);
        } else {
            this.elements.lyricsDisplay.appendChild(controlPanel);
        }
        
        this.createSearchOverlay();
    }
    
    createSearchOverlay() {
        const searchOverlay = document.createElement('div');
        searchOverlay.id = 'lyrics-search-overlay';
        searchOverlay.className = 'lyrics-search-hidden';
        searchOverlay.innerHTML = `
            <input type="text" id="lyrics-search-input" placeholder="Search lyrics...">
            <div id="lyrics-search-results"></div>
            <button id="lyrics-search-close">✕</button>
        `;
        this.elements.lyricsDisplay.appendChild(searchOverlay);
    }
    
    setupEventHandlers(elements) {
        // Export button
        if (this.elements.exportButton) {
            this.elements.exportButton.onclick = (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.copyToClipboard();
                } else {
                    this.showExportMenu();
                }
            };
        }
        
        // Control buttons
        const handlers = {
            'lyrics-search-btn': () => this.toggleSearch(),
            'lyrics-mode-toggle': () => this.cycleDisplayMode(),
            'lyrics-auto-scroll': () => this.toggleAutoScroll(),
            'lyrics-karaoke-mode': () => this.toggleKaraokeMode(),
            'lyrics-settings-btn': () => this.showSettings()
        };
        
        Object.entries(handlers).forEach(([id, handler]) => {
            const btn = document.getElementById(id);
            if (btn) btn.onclick = handler;
        });
        
        // Search
        const searchInput = document.getElementById('lyrics-search-input');
        const searchClose = document.getElementById('lyrics-search-close');
        
        if (searchInput) {
            searchInput.oninput = (e) => this.handleSearch(e.target.value);
            searchInput.onkeydown = (e) => {
                if (e.key === 'Escape') this.toggleSearch();
            };
        }
        if (searchClose) searchClose.onclick = () => this.toggleSearch();
        
        // Fullscreen
        if (this.elements.fullscreenToggle) {
            this.elements.fullscreenToggle.onclick = () => {
                this.toggleFullscreen(!this.state.fullscreen);
            };
        }
        
        const closeBtn = elements.fullscreenCloseBtn;
        if (closeBtn) {
            closeBtn.onclick = () => this.toggleFullscreen(false);
        }
        
        // Navigation
        if (elements.fullscreenPrevBtn) {
            elements.fullscreenPrevBtn.onclick = () => {
                if (this.onNavigationRequest) this.onNavigationRequest('previous');
            };
        }
        
        if (elements.fullscreenNextBtn) {
            elements.fullscreenNextBtn.onclick = () => {
                if (this.onNavigationRequest) this.onNavigationRequest('next');
            };
        }
        
        // Visibility change
        document.addEventListener('visibilitychange', () => {
            this.state.isVisible = !document.hidden;
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'f' && this.cues.length > 0) {
                e.preventDefault();
                this.toggleSearch();
            }
            
            if (e.key === 'Escape') {
                if (this.state.fullscreen) {
                    this.toggleFullscreen(false);
                } else if (this.state.searchActive) {
                    this.toggleSearch();
                }
            }
            
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                this.toggleFullscreen(!this.state.fullscreen);
            }
            
            if ((e.key === 'k' || e.key === 'K') && this.state.fullscreen) {
                e.preventDefault();
                this.toggleKaraokeMode();
            }
        });
    }
    
    // ============================================
    // COLOR MANAGEMENT
    // ============================================
    
    setDominantColor(color) {
        if (!color) return;
        
        this.colors.primary = color;
        
        // Generate vibrant palette
        const hsl = this.rgbToHsl(color.r, color.g, color.b);
        
        this.colors.secondary = this.hslToRgb(
            hsl.h,
            Math.min(100, hsl.s * 1.2),
            Math.min(90, hsl.l * 1.5)
        );
        
        this.colors.accent = this.hslToRgb(
            hsl.h,
            100,
            Math.max(45, Math.min(65, hsl.l))
        );
        
        // Fixed: Use vibrant background colors instead of washing them out
        this.colors.background = this.hslToRgb(
            hsl.h,
            Math.max(30, hsl.s * 0.6), // More saturation
            18  // Much lighter than before (was 8)
        );
        
        // Update fullscreen background
        if (this.state.fullscreen) {
            this.updateFullscreenBackground();
        }
        
        this.debugLog(`🎨 Color updated: RGB(${color.r}, ${color.g}, ${color.b})`, 'info');
    }
    
    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
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
    
    hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    // ============================================
    // LYRICS LOADING
    // ============================================
    
    async loadLyrics(cues, trackId = null) {
        this.cues = cues;
        this.currentTrackId = trackId || this.generateTrackId();
        this.currentCueIndex = -1;
        
        // Cache lyrics
        if (this.db && trackId) {
            try {
                const transaction = this.db.transaction(['lyrics'], 'readwrite');
                const store = transaction.objectStore('lyrics');
                store.put({
                    trackId: trackId,
                    cues: cues,
                    timestamp: Date.now()
                });
            } catch (e) {
                // Silent fail
            }
        }
        
        this.renderNormalLyrics();
        
        if (this.state.fullscreen) {
            this.renderFullscreenLyrics();
        }
        
        this.debugLog(`📝 Loaded ${cues.length} lyric cues`, 'success');
    }
    
    async loadCachedLyrics(trackId) {
        if (!this.db) return null;
        
        try {
            return new Promise((resolve) => {
                const transaction = this.db.transaction(['lyrics'], 'readonly');
                const store = transaction.objectStore('lyrics');
                const request = store.get(trackId);
                
                request.onsuccess = () => {
                    resolve(request.result ? request.result.cues : null);
                };
                
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }
    
    clearLyrics() {
        this.cues = [];
        this.currentTrackId = null;
        this.currentCueIndex = -1;
        this.cache.clear();
        
        if (this.elements.lyricsDisplay) {
            const controlPanel = this.elements.lyricsDisplay.querySelector('.lyrics-control-panel');
            const searchOverlay = this.elements.lyricsDisplay.querySelector('#lyrics-search-overlay');
            
            this.elements.lyricsDisplay.innerHTML = '';
            
            if (controlPanel) this.elements.lyricsDisplay.appendChild(controlPanel);
            if (searchOverlay) this.elements.lyricsDisplay.appendChild(searchOverlay);
            if (this.elements.exportButton) this.elements.lyricsDisplay.appendChild(this.elements.exportButton);
            
            const placeholder = document.createElement('div');
            placeholder.className = 'lyric-line';
            placeholder.textContent = 'Lyrics will appear here when a track is loaded.';
            this.elements.lyricsDisplay.appendChild(placeholder);
        }
        
        if (this.elements.exportButton) {
            this.elements.exportButton.disabled = true;
        }
        
        if (this.state.fullscreen) {
            this.toggleFullscreen(false);
        }
    }
    
    generateTrackId() {
        if (this.onGetTrackInfo) {
            const info = this.onGetTrackInfo();
            return `${info.artist}_${info.title}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        }
        return `track_${Date.now()}`;
    }
    
    // ============================================
    // NORMAL LYRICS RENDERING
    // ============================================
    
    renderNormalLyrics() {
        if (!this.elements.lyricsDisplay) return;
        
        const existingLines = this.elements.lyricsDisplay.querySelectorAll('.lyric-line');
        existingLines.forEach(line => line.remove());
        
        if (this.cues.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'lyric-line';
            placeholder.textContent = 'No lyrics available for this track.';
            this.elements.lyricsDisplay.appendChild(placeholder);
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        this.cues.forEach((cue, index) => {
            const line = this.createLyricLine(cue, index);
            fragment.appendChild(line);
        });
        
        this.elements.lyricsDisplay.appendChild(fragment);
        
        if (this.elements.exportButton) {
            this.elements.exportButton.disabled = false;
        }
        
        this.applyDisplayMode();
    }
    
    createLyricLine(cue, index) {
        const line = document.createElement('div');
        line.className = 'lyric-line';
        line.textContent = cue.text.replace(/\r?\n|\r/g, ' ');
        line.dataset.index = index;
        line.dataset.startTime = cue.startTime;
        
        line.onclick = () => {
            if (this.elements.player) {
                this.elements.player.currentTime = cue.startTime;
            }
        };
        
        return line;
    }
    
    updateNormalHighlight(currentTime, compactMode) {
        if (compactMode === 'mini' || compactMode === 'compact') return;
        if (this.cues.length === 0) return;
        
        // Find active cue
        let activeIndex = -1;
        for (let i = 0; i < this.cues.length; i++) {
            const cue = this.cues[i];
            if (currentTime >= cue.startTime && currentTime < cue.endTime) {
                activeIndex = i;
                break;
            }
        }
        
        if (activeIndex === this.currentCueIndex) return;
        this.currentCueIndex = activeIndex;
        
        const lines = this.elements.lyricsDisplay.querySelectorAll('.lyric-line');
        
        lines.forEach((line, index) => {
            if (index === activeIndex) {
                line.classList.add('active');
                
                if (this.state.autoScroll && !this.state.searchActive) {
                    this.smoothScrollToLine(line);
                }
            } else {
                line.classList.remove('active');
            }
        });
    }
    
    smoothScrollToLine(line) {
        if (!line || !this.elements.lyricsDisplay) return;
        
        const lineRect = line.getBoundingClientRect();
        const containerRect = this.elements.lyricsDisplay.getBoundingClientRect();
        
        if (lineRect.top < containerRect.top || lineRect.bottom > containerRect.bottom) {
            const targetScroll = line.offsetTop - (this.elements.lyricsDisplay.clientHeight / 2) + (line.offsetHeight / 2);
            
            this.elements.lyricsDisplay.scrollTo({
                top: Math.max(0, targetScroll),
                behavior: 'smooth'
            });
        }
    }
    
    // ============================================
    // FULLSCREEN LYRICS
    // ============================================
    
    toggleFullscreen(show) {
        if (!this.elements.fullscreenContainer) return;
        
        this.state.fullscreen = show;
        
        if (show) {
            if (this.cues.length === 0) {
                alert('No lyrics available for this track!');
                return;
            }
            
            this.elements.fullscreenContainer.classList.remove('fullscreen-lyrics-hidden');
            this.elements.fullscreenContainer.classList.add('show');
            
            this.renderFullscreenLyrics();
            this.updateFullscreenBackground();
            
            if (this.elements.fullscreenToggle) {
                this.elements.fullscreenToggle.classList.add('active');
                this.elements.fullscreenToggle.textContent = '🎤 Exit Lyrics';
            }
            
            this.debugLog('🎤 Fullscreen lyrics activated', 'success');
        } else {
            this.elements.fullscreenContainer.classList.add('fullscreen-lyrics-hidden');
            this.elements.fullscreenContainer.classList.remove('show');
            
            if (this.elements.fullscreenToggle) {
                this.elements.fullscreenToggle.classList.remove('active');
                this.elements.fullscreenToggle.textContent = '🎤 Fullscreen Lyrics';
            }
            
            this.debugLog('Fullscreen lyrics deactivated', 'info');
        }
        
        this.saveState();
    }
    
    renderFullscreenLyrics() {
        if (!this.elements.fullscreenContent) return;
        
        this.elements.fullscreenContent.innerHTML = '';
        
        if (this.cues.length === 0) {
            this.elements.fullscreenContent.innerHTML = '<div class="fullscreen-lyrics-empty">No lyrics available</div>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        this.cues.forEach((cue, index) => {
            const line = document.createElement('div');
            line.className = 'fullscreen-lyric-line';
            line.textContent = cue.text.replace(/\r?\n|\r/g, ' ');
            line.dataset.index = index;
            line.dataset.startTime = cue.startTime;
            
            const alpha = 0.4 + (index / this.cues.length) * 0.2;
            line.style.color = `rgba(255, 255, 255, ${alpha})`;
            
            line.onclick = () => {
                if (this.elements.player) {
                    this.elements.player.currentTime = cue.startTime;
                }
            };
            
            fragment.appendChild(line);
        });
        
        this.elements.fullscreenContent.appendChild(fragment);
    }
    
    updateFullscreenHighlight(currentTime) {
        if (!this.state.fullscreen || !this.elements.fullscreenContent) return;
        
        const lines = this.elements.fullscreenContent.querySelectorAll('.fullscreen-lyric-line');
        let activeIndex = -1;
        
        for (let i = 0; i < this.cues.length; i++) {
            const cue = this.cues[i];
            if (currentTime >= cue.startTime && currentTime < cue.endTime) {
                activeIndex = i;
                break;
            }
        }
        
        const accent = this.colors.accent;
        
        lines.forEach((line, index) => {
            if (index === activeIndex) {
                line.classList.add('active');
                
                if (this.state.karaokeMode) {
                    this.applyKaraokeEffect(line, currentTime);
                }
                
                line.style.color = `rgb(${accent.r}, ${accent.g}, ${accent.b})`;
                line.style.textShadow = `0 0 30px rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.8)`;
                line.style.transform = 'scale(1.05)';
                line.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                
                if (this.state.autoScroll) {
                    const lineRect = line.getBoundingClientRect();
                    const containerRect = this.elements.fullscreenContent.getBoundingClientRect();
                    
                    if (lineRect.top < containerRect.top || lineRect.bottom > containerRect.bottom) {
                        const targetScroll = line.offsetTop - (this.elements.fullscreenContent.clientHeight / 2) + (line.offsetHeight / 2);
                        
                        this.elements.fullscreenContent.scrollTo({
                            top: Math.max(0, targetScroll),
                            behavior: 'smooth'
                        });
                    }
                }
            } else {
                line.classList.remove('active');
                const alpha = 0.4 + (index / this.cues.length) * 0.2;
                line.style.color = `rgba(255, 255, 255, ${alpha})`;
                line.style.textShadow = 'none';
                line.style.transform = 'scale(1)';
            }
        });
    }
    
    applyKaraokeEffect(line, currentTime) {
        const cue = this.cues[parseInt(line.dataset.index)];
        if (!cue) return;
        
        const progress = (currentTime - cue.startTime) / (cue.endTime - cue.startTime);
        const text = cue.text;
        const revealLength = Math.floor(text.length * progress);
        
        const accent = this.colors.accent;
        
        line.innerHTML = `
            <span style="color: rgb(${accent.r}, ${accent.g}, ${accent.b})">
                ${text.substring(0, revealLength)}
            </span>
            <span style="opacity: 0.5">
                ${text.substring(revealLength)}
            </span>
        `;
    }
    
    updateFullscreenBackground() {
        if (!this.elements.fullscreenContainer) return;
        
        const bg = this.colors.background;
        const primary = this.colors.primary;
        const secondary = this.colors.secondary;
        
        // Create vibrant gradient background
        this.elements.fullscreenContainer.style.background = `
            radial-gradient(
                ellipse at top left,
                rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.3) 0%,
                rgba(${bg.r}, ${bg.g}, ${bg.b}, 1) 50%,
                rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0.2) 100%
            )
        `;
    }
    
    // ============================================
    // DISPLAY MODES & FEATURES
    // ============================================
    
    cycleDisplayMode() {
        const modes = ['default', 'compact', 'large'];
        const currentIndex = modes.indexOf(this.state.mode);
        this.state.mode = modes[(currentIndex + 1) % modes.length];
        
        this.applyDisplayMode();
        this.saveDisplayMode();
        
        this.debugLog(`📖 Display mode: ${this.state.mode}`, 'info');
    }
    
    applyDisplayMode() {
        if (!this.elements.lyricsDisplay) return;
        
        this.elements.lyricsDisplay.classList.remove('lyrics-compact', 'lyrics-large');
        
        if (this.state.mode === 'compact') {
            this.elements.lyricsDisplay.classList.add('lyrics-compact');
        } else if (this.state.mode === 'large') {
            this.elements.lyricsDisplay.classList.add('lyrics-large');
        }
    }
    
    toggleAutoScroll() {
        this.state.autoScroll = !this.state.autoScroll;
        
        const btn = document.getElementById('lyrics-auto-scroll');
        if (btn) {
            btn.classList.toggle('active', this.state.autoScroll);
        }
        
        this.saveState();
        this.debugLog(`📜 Auto-scroll: ${this.state.autoScroll ? 'ON' : 'OFF'}`, 'info');
    }
    
    toggleKaraokeMode() {
        this.state.karaokeMode = !this.state.karaokeMode;
        
        const btn = document.getElementById('lyrics-karaoke-mode');
        if (btn) {
            btn.classList.toggle('active', this.state.karaokeMode);
        }
        
        this.saveState();
        this.debugLog(`🎤 Karaoke mode: ${this.state.karaokeMode ? 'ON' : 'OFF'}`, 'info');
    }
    
    // ============================================
    // SEARCH FUNCTIONALITY
    // ============================================
    
    toggleSearch() {
        this.state.searchActive = !this.state.searchActive;
        
        const overlay = document.getElementById('lyrics-search-overlay');
        const input = document.getElementById('lyrics-search-input');
        
        if (overlay) {
            overlay.classList.toggle('lyrics-search-hidden', !this.state.searchActive);
        }
        
        if (this.state.searchActive && input) {
            setTimeout(() => input.focus(), 100);
        } else if (input) {
            input.value = '';
            this.clearSearchResults();
        }
    }
    
    handleSearch(query) {
        if (!query || query.length < 2) {
            this.clearSearchResults();
            return;
        }
        
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, 200);
    }
    
    performSearch(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        this.cues.forEach((cue, index) => {
            if (cue.text.toLowerCase().includes(lowerQuery)) {
                results.push({ index, cue });
            }
        });
        
        this.displaySearchResults(results, query);
    }
    
    displaySearchResults(results, query) {
        const resultsDiv = document.getElementById('lyrics-search-results');
        if (!resultsDiv) return;
        
        resultsDiv.innerHTML = '';
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="search-no-results">No results found</div>';
            return;
        }
        
        results.forEach(({ index, cue }) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            const text = cue.text.replace(
                new RegExp(query, 'gi'),
                match => `<mark>${match}</mark>`
            );
            
            item.innerHTML = `
                <span class="search-result-time">${this.formatTime(cue.startTime)}</span>
                <span class="search-result-text">${text}</span>
            `;
            
            item.onclick = () => {
                if (this.elements.player) {
                    this.elements.player.currentTime = cue.startTime;
                }
                this.toggleSearch();
            };
            
            resultsDiv.appendChild(item);
        });
    }
    
    clearSearchResults() {
        const resultsDiv = document.getElementById('lyrics-search-results');
        if (resultsDiv) {
            resultsDiv.innerHTML = '';
        }
    }
    
    // ============================================
    // EXPORT FUNCTIONALITY
    // ============================================
    
    showExportMenu() {
        const menu = document.createElement('div');
        menu.className = 'lyrics-export-menu';
        menu.innerHTML = `
            <button onclick="lyricsManager.exportToFile('txt')">💾 Text File (.txt)</button>
            <button onclick="lyricsManager.exportToFile('lrc')">🎵 LRC File (.lrc)</button>
            <button onclick="lyricsManager.exportToFile('srt')">📹 SRT File (.srt)</button>
            <button onclick="lyricsManager.copyToClipboard()">📋 Copy to Clipboard</button>
        `;
        
        const rect = this.elements.exportButton.getBoundingClientRect();
        menu.style.position = 'absolute';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = '20px';
        
        document.body.appendChild(menu);
        
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== this.elements.exportButton) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }
    
    exportToFile(format = 'txt') {
        if (this.cues.length === 0) return;
        
        let content = '';
        let filename = '';
        
        let trackName = 'Unknown Track';
        let artist = 'Unknown Artist';
        
        if (this.onGetTrackInfo) {
            const info = this.onGetTrackInfo();
            trackName = info.title || trackName;
            artist = info.artist || artist;
        }
        
        switch(format) {
            case 'txt':
                content = this.generateTextExport(trackName, artist);
                filename = `${trackName} - Lyrics.txt`;
                break;
            case 'lrc':
                content = this.generateLRCExport(trackName, artist);
                filename = `${trackName}.lrc`;
                break;
            case 'srt':
                content = this.generateSRTExport();
                filename = `${trackName}.srt`;
                break;
        }
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.debugLog(`💾 Exported as ${format.toUpperCase()}`, 'success');
    }
    
    generateTextExport(trackName, artist) {
        let text = `${trackName}\n`;
        text += `Artist: ${artist}\n`;
        text += `${'='.repeat(50)}\n\n`;
        
        this.cues.forEach((cue) => {
            text += `[${this.formatTime(cue.startTime)}] ${cue.text}\n`;
        });
        
        text += `\n${'='.repeat(50)}\n`;
        text += `Exported from Ultimate Local Music Player\n`;
        text += `${new Date().toLocaleString()}\n`;
        
        return text;
    }
    
    generateLRCExport(trackName, artist) {
        let lrc = `[ti:${trackName}]\n`;
        lrc += `[ar:${artist}]\n`;
        lrc += `[by:Ultimate Local Music Player]\n\n`;
        
        this.cues.forEach((cue) => {
            const time = this.formatLRCTime(cue.startTime);
            lrc += `[${time}]${cue.text}\n`;
        });
        
        return lrc;
    }
    
    generateSRTExport() {
        let srt = '';
        
        this.cues.forEach((cue, index) => {
            srt += `${index + 1}\n`;
            srt += `${this.formatSRTTime(cue.startTime)} --> ${this.formatSRTTime(cue.endTime)}\n`;
            srt += `${cue.text}\n\n`;
        });
        
        return srt;
    }
    
    copyToClipboard() {
        if (this.cues.length === 0) return;
        
        const text = this.cues.map(cue => cue.text).join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            this.debugLog('📋 Copied to clipboard', 'success');
            
            if (this.elements.exportButton) {
                const originalText = this.elements.exportButton.textContent;
                this.elements.exportButton.textContent = '✓ Copied!';
                setTimeout(() => {
                    this.elements.exportButton.textContent = originalText;
                }, 2000);
            }
        }).catch(err => {
            this.debugLog(`Failed to copy: ${err.message}`, 'error');
        });
    }
    
    // ============================================
    // SETTINGS
    // ============================================
    
    showSettings() {
        const modal = document.createElement('div');
        modal.className = 'lyrics-settings-modal';
        modal.innerHTML = `
            <div class="lyrics-settings-content">
                <h3>Lyrics Settings</h3>
                <div class="settings-group">
                    <label>
                        <input type="checkbox" id="setting-auto-scroll" ${this.state.autoScroll ? 'checked' : ''}>
                        Auto-scroll
                    </label>
                    <label>
                        <input type="checkbox" id="setting-karaoke" ${this.state.karaokeMode ? 'checked' : ''}>
                        Karaoke mode
                    </label>
                </div>
                <div class="settings-group">
                    <label>
                        Display Mode:
                        <select id="setting-display-mode">
                            <option value="default" ${this.state.mode === 'default' ? 'selected' : ''}>Default</option>
                            <option value="compact" ${this.state.mode === 'compact' ? 'selected' : ''}>Compact</option>
                            <option value="large" ${this.state.mode === 'large' ? 'selected' : ''}>Large</option>
                        </select>
                    </label>
                </div>
                <button id="settings-clear-cache">🗑️ Clear Lyrics Cache</button>
                <button id="settings-close">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event handlers
        const autoScrollCheck = modal.querySelector('#setting-auto-scroll');
        const karaokeCheck = modal.querySelector('#setting-karaoke');
        const displayModeSelect = modal.querySelector('#setting-display-mode');
        const clearCacheBtn = modal.querySelector('#settings-clear-cache');
        const closeBtn = modal.querySelector('#settings-close');
        
        autoScrollCheck.onchange = () => {
            this.state.autoScroll = autoScrollCheck.checked;
            this.saveState();
        };
        
        karaokeCheck.onchange = () => {
            this.state.karaokeMode = karaokeCheck.checked;
            this.saveState();
        };
        
        displayModeSelect.onchange = () => {
            this.state.mode = displayModeSelect.value;
            this.applyDisplayMode();
            this.saveDisplayMode();
        };
        
        clearCacheBtn.onclick = () => {
            this.clearCache();
            alert('Lyrics cache cleared!');
        };
        
        closeBtn.onclick = () => modal.remove();
        
        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }
    
    async clearCache() {
        if (this.db) {
            try {
                const transaction = this.db.transaction(['lyrics'], 'readwrite');
                const store = transaction.objectStore('lyrics');
                store.clear();
            } catch (e) {
                this.debugLog('Failed to clear cache', 'error');
            }
        }
        
        this.cache.clear();
    }
    
    // ============================================
    // STATE MANAGEMENT & PERSISTENCE
    // ============================================
    
    loadDisplayMode() {
        try {
            return localStorage.getItem('lyricsDisplayMode') || 'default';
        } catch (e) {
            return 'default';
        }
    }
    
    saveDisplayMode() {
        try {
            localStorage.setItem('lyricsDisplayMode', this.state.mode);
        } catch (e) {
            this.debugLog('Failed to save display mode', 'warning');
        }
    }
    
    restoreState() {
        try {
            const saved = localStorage.getItem('lyricsState');
            if (saved) {
                const state = JSON.parse(saved);
                this.state.autoScroll = state.autoScroll !== false;
                this.state.karaokeMode = state.karaokeMode || false;
            }
        } catch (e) {
            this.debugLog('Failed to restore state', 'warning');
        }
    }
    
    saveState() {
        try {
            localStorage.setItem('lyricsState', JSON.stringify({
                autoScroll: this.state.autoScroll,
                karaokeMode: this.state.karaokeMode
            }));
        } catch (e) {
            this.debugLog('Failed to save state', 'warning');
        }
    }
    
    // ============================================
    // UPDATE METHOD (Called from script.js)
    // ============================================
    
    update(currentTime, compactMode) {
        // Update normal lyrics if not in mini/compact mode
        if (compactMode !== 'mini' && compactMode !== 'compact') {
            this.updateNormalHighlight(currentTime, compactMode);
        }
        
        // Update fullscreen lyrics if active
        if (this.state.fullscreen) {
            this.updateFullscreenHighlight(currentTime);
        }
    }
    
    // ============================================
    // WINDOW RESIZE HANDLER
    // ============================================
    
    onWindowResize() {
        // No canvas to resize anymore
    }
    
    // ============================================
    // UTILITY METHODS
    // ============================================
    
    formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${min}:${sec}`;
    }
    
    formatLRCTime(seconds) {
        const min = Math.floor(seconds / 60).toString().padStart(2, '0');
        const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
        return `${min}:${sec}.${ms}`;
    }
    
    formatSRTTime(seconds) {
        const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const min = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        return `${hours}:${min}:${sec},${ms}`;
    }
    
    // ============================================
    // PUBLIC API
    // ============================================
    
    hasCues() {
        return this.cues.length > 0;
    }
    
    getCues() {
        return this.cues;
    }
    
    isFullscreenActive() {
        return this.state.fullscreen;
    }
    
    // ============================================
    // CLEANUP
    // ============================================
    
    async saveLyricsToDB(trackId, lyrics) {
        if (!this.db) return;
        try {
            const transaction = this.db.transaction(['lyrics'], 'readwrite');
            const store = transaction.objectStore('lyrics');
            
            // If lyrics is a string (LRC), convert it to VTT and then parse to cues
            // This ensures we always store the format the player expects
            let cues = lyrics;
            if (typeof lyrics === 'string') {
                const vttContent = vttParser.convertLRCToVTT(lyrics);
                cues = vttParser.parseVTTContent(vttContent);
            }

            store.put({
                trackId: trackId,
                cues: cues,
                timestamp: Date.now()
            });
            this.debugLog(`💾 Lyrics for ${trackId} saved to cache as VTT-compatible cues`, 'success');
        } catch (e) {
            this.debugLog('Failed to save lyrics to DB', 'error');
        }
    }

    async getLyricsFromDB(trackId) {
        return this.loadCachedLyrics(trackId);
    }

    async fetchLyricsOnline(artist, title) {
        try {
            this.debugLog(`🔍 Searching online for: ${title} by ${artist}`, 'info');

            // Encode parameters for the URL
            const url = `https://lrclib.net/api/get?artist=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Lyrics not found');

            const data = await response.json();

            // We want synced lyrics (LRC format)
            if (data.syncedLyrics) {
                this.debugLog('✅ Synced lyrics found!', 'success');
                return data.syncedLyrics;
            }
            return null;
        } catch (err) {
            this.debugLog(`❌ Fetch failed: ${err.message}`, 'error');
            return null;
        }
    }

    dispose() {
        if (this.db) {
            this.db.close();
        }
        
        this.cache.clear();
        
        this.debugLog('🎤 LyricsManager disposed', 'info');
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LyricsManager;
}

// Make globally accessible for onclick handlers
if (typeof window !== 'undefined') {
    window.LyricsManager = LyricsManager;
}