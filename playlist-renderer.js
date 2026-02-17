/* ============================================
   PLAYLIST RENDERER v2.0
   Event-delegation driven, cache-safe, virtual-scroll capable
   ============================================ */

class EnhancedPlaylistRenderer {

    // ─── Construction ─────────────────────────────────────────────────────────

    constructor(debugLog) {
        this._log = debugLog || (() => {});

        // Data
        this.playlist         = [];
        this.filteredPlaylist = [];
        this.currentTrackIndex = -1;

        // Sort / filter state
        this.sortBy     = 'default';
        this.sortOrder  = 'asc';
        this.filterMood = 'all';
        this.searchQuery = '';

        // Callbacks
        this.onTrackClick  = null;
        this.onEditClick   = null;
        this.onReorder     = null;
        this.onBatchDelete = null;
        this.onPlayNext    = null;
        this.onFindSimilar = null;

        // DOM refs (populated by init)
        this._dom = {};

        // Virtual scrolling
        this._vScroll = {
            itemHeight:   80,
            buffer:       5,
            scrollTop:    0,
            rafId:        null,
            pending:      false,
        };

        // Selection
        this.selectionMode  = false;
        this.selectedTracks = new Set();

        // Drag-and-drop
        this._drag = { sourceIndex: null };

        // Mood config
        this._moods = {
            energetic: { r: 255, g: 87,  b: 51,  emoji: '⚡' },
            calm:      { r: 51,  g: 153, b: 255, emoji: '🌊' },
            bright:    { r: 255, g: 215, b: 0,   emoji: '☀️' },
            dark:      { r: 147, g: 51,  b: 234, emoji: '🌙' },
            neutral:   { r: 220, g: 53,  b: 69,  emoji: '🎵' },
        };

        // Pending scroll-throttle
        this._scrollTimer = null;

        this._loadPrefs();
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Wire up DOM references and build toolbar.
     * @param {object} elements  - { playlistContainer, playlistItems, playlistSearch, clearButton, jumpToCurrentBtn }
     */
    init(elements) {
        const el = elements || {};
        this._dom.container       = el.playlistContainer || document.getElementById('playlist-container');
        this._dom.list            = el.playlistItems;
        this._dom.search          = el.playlistSearch;
        this._dom.clearBtn        = el.clearButton;
        this._dom.jumpBtn         = el.jumpToCurrentBtn;

        if (!this._dom.list) {
            this._log('❌ Playlist items container not found', 'error');
            return;
        }

        this._buildToolbar();
        this._bindEvents();
        this._setupScrollHandler();
        this._setupLazyObserver();

        this._log('✅ Playlist renderer v2 initialised', 'success');
    }

    setCallbacks(callbacks = {}) {
        this.onTrackClick  = callbacks.onTrackClick  ?? null;
        this.onEditClick   = callbacks.onEditClick   ?? null;
        this.onReorder     = callbacks.onReorder     ?? null;
        this.onBatchDelete = callbacks.onBatchDelete ?? null;
        this.onPlayNext    = callbacks.onPlayNext    ?? null;
        this.onFindSimilar = callbacks.onFindSimilar ?? null;
    }

    /** Replace the full playlist data and re-render. */
    setPlaylist(playlist, currentIndex) {
        this.playlist          = playlist  ?? [];
        this.currentTrackIndex = currentIndex ?? -1;
        this._applyFiltersAndSort();
    }

    /** Lightweight update: only re-apply the playing class without full re-render. */
    updateHighlight(newIndex) {
        this.currentTrackIndex = newIndex;

        this._dom.list.querySelectorAll('.pl-item').forEach(item => {
            const idx = +item.dataset.actualIndex;
            const isPlaying = idx === newIndex;
            item.classList.toggle('playing', isPlaying);
            if (isPlaying) this._scrollItemIntoView(item);
        });
    }

    jumpToCurrent() {
        if (this.currentTrackIndex === -1) return;
        const playing = this._dom.list.querySelector('.pl-item.playing');
        if (playing) {
            this._scrollItemIntoView(playing);
            return;
        }
        // Not visible — clear filters then retry
        this.searchQuery = '';
        this.filterMood  = 'all';
        if (this._dom.search)     this._dom.search.value = '';
        if (this._dom.filterSel)  this._dom.filterSel.value = 'all';
        this._applyFiltersAndSort();
        requestAnimationFrame(() => {
            const item = this._dom.list.querySelector('.pl-item.playing');
            if (item) this._scrollItemIntoView(item);
        });
    }

    destroy() {
        if (this._lazyObserver) this._lazyObserver.disconnect();
        clearTimeout(this._scrollTimer);
        this._log('🧹 PlaylistRenderer destroyed', 'info');
    }

    // ─── Toolbar ─────────────────────────────────────────────────────────────

    _buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'pl-toolbar';
        toolbar.innerHTML = `
            <div class="pl-toolbar-left">
                <button class="pl-tb-btn" id="pl-select-mode" title="Selection Mode">☑️</button>
                <button class="pl-tb-btn" id="pl-stats-btn"   title="Statistics">📊</button>
                <select class="pl-tb-select" id="pl-sort">
                    <option value="default">Default Order</option>
                    <option value="title">Title (A–Z)</option>
                    <option value="artist">Artist (A–Z)</option>
                    <option value="duration">Duration</option>
                    <option value="bpm">BPM</option>
                    <option value="energy">Energy</option>
                    <option value="mood">Mood</option>
                    <option value="vintage">Vintage First</option>
                    <option value="dance">Danceability</option>
                </select>
                <select class="pl-tb-select" id="pl-filter">
                    <option value="all">All Tracks</option>
                    <option value="lyrics">Has Lyrics</option>
                    <option value="metadata">Has Metadata</option>
                    <option value="analysis">Has Analysis</option>
                    <option value="energetic">⚡ Energetic</option>
                    <option value="calm">🌊 Calm</option>
                    <option value="bright">☀️ Bright</option>
                    <option value="dark">🌙 Dark</option>
                </select>
            </div>
            <div class="pl-toolbar-right">
                <span class="pl-count" id="pl-count">0 tracks</span>
            </div>
        `;

        this._dom.list.parentNode.insertBefore(toolbar, this._dom.list);

        this._dom.sortSel    = document.getElementById('pl-sort');
        this._dom.filterSel  = document.getElementById('pl-filter');
        this._dom.selectBtn  = document.getElementById('pl-select-mode');
        this._dom.statsBtn   = document.getElementById('pl-stats-btn');
        this._dom.countLabel = document.getElementById('pl-count');

        // Restore saved sort preference
        if (this.sortBy !== 'default') this._dom.sortSel.value = this.sortBy;
    }

    // ─── Event binding (toolbar + list delegation) ────────────────────────────

    _bindEvents() {
        // ── Search ─────────────────────────────────────────────────────────
        if (this._dom.search) {
            this._dom.search.addEventListener('input', e => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this._applyFiltersAndSort();
            });
        }

        // ── Sort ───────────────────────────────────────────────────────────
        this._dom.sortSel?.addEventListener('change', e => {
            this.sortBy = e.target.value;
            this._savePrefs();
            this._applyFiltersAndSort();
        });

        // ── Filter ─────────────────────────────────────────────────────────
        this._dom.filterSel?.addEventListener('change', e => {
            this.filterMood = e.target.value;
            this._applyFiltersAndSort();
        });

        // ── Selection mode toggle ──────────────────────────────────────────
        this._dom.selectBtn?.addEventListener('click', () => this._toggleSelectionMode());

        // ── Stats ─────────────────────────────────────────────────────────
        this._dom.statsBtn?.addEventListener('click', () => this._showStatistics());

        // ── Jump to current ────────────────────────────────────────────────
        this._dom.jumpBtn?.addEventListener('click', () => this.jumpToCurrent());

        // ── Clear ─────────────────────────────────────────────────────────
        this._dom.clearBtn?.addEventListener('click', () => {/* handled by app */});

        // ── Keyboard shortcut: J ──────────────────────────────────────────
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'j' || e.key === 'J') { e.preventDefault(); this.jumpToCurrent(); }
        });

        // ── List click delegation (single handler for all item interactions) ─
        this._dom.list.addEventListener('click', e => this._handleListClick(e));

        // ── List drag delegation ───────────────────────────────────────────
        this._dom.list.addEventListener('dragstart',  e => this._handleDragStart(e));
        this._dom.list.addEventListener('dragend',    e => this._handleDragEnd(e));
        this._dom.list.addEventListener('dragover',   e => this._handleDragOver(e));
        this._dom.list.addEventListener('dragleave',  e => this._handleDragLeave(e));
        this._dom.list.addEventListener('drop',       e => this._handleDrop(e));
    }

    // ─── Delegated click dispatcher ───────────────────────────────────────────

    _handleListClick(e) {
        const item = e.target.closest('.pl-item');
        if (!item) return;

        const actualIndex = +item.dataset.actualIndex;
        if (isNaN(actualIndex)) return;

        // Edit button
        if (e.target.closest('.pl-edit-btn')) {
            e.stopPropagation();
            this.onEditClick?.(actualIndex);
            return;
        }

        // Context menu button
        if (e.target.closest('.pl-menu-btn')) {
            e.stopPropagation();
            this._showContextMenu(e, actualIndex);
            return;
        }

        // Selection mode
        if (this.selectionMode) {
            this._toggleSelection(actualIndex, item);
            return;
        }

        // Normal play
        this.onTrackClick?.(actualIndex);
    }

    // ─── Drag-and-drop delegation ─────────────────────────────────────────────

    _handleDragStart(e) {
        if (this.selectionMode) { e.preventDefault(); return; }
        const item = e.target.closest('.pl-item');
        if (!item) return;
        this._drag.sourceIndex = +item.dataset.actualIndex;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    _handleDragEnd(e) {
        const item = e.target.closest('.pl-item');
        item?.classList.remove('dragging');
        this._drag.sourceIndex = null;
        this._clearDropIndicators();
    }

    _handleDragOver(e) {
        if (this.selectionMode || this._drag.sourceIndex === null) return;
        const item = e.target.closest('.pl-item');
        if (!item) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this._clearDropIndicators();
        const { top, height } = item.getBoundingClientRect();
        item.classList.add(e.clientY < top + height / 2 ? 'drop-before' : 'drop-after');
    }

    _handleDragLeave(e) {
        const item = e.target.closest('.pl-item');
        item?.classList.remove('drop-before', 'drop-after');
    }

    _handleDrop(e) {
        if (this.selectionMode || this._drag.sourceIndex === null) return;
        e.preventDefault();
        const item = e.target.closest('.pl-item');
        if (!item) return;
        this._clearDropIndicators();
        const targetIndex = +item.dataset.actualIndex;
        const { top, height } = item.getBoundingClientRect();
        const dropIndex = e.clientY < top + height / 2 ? targetIndex : targetIndex + 1;
        if (this.onReorder && this._drag.sourceIndex !== targetIndex) {
            this.onReorder(this._drag.sourceIndex, dropIndex);
        }
    }

    _clearDropIndicators() {
        this._dom.list.querySelectorAll('.drop-before,.drop-after').forEach(el =>
            el.classList.remove('drop-before', 'drop-after')
        );
    }

    // ─── Scroll handling ──────────────────────────────────────────────────────

    _setupScrollHandler() {
        if (!this._dom.list) return;
        this._dom.list.addEventListener('scroll', () => {
            this._vScroll.scrollTop = this._dom.list.scrollTop;
            if (!this._vScroll.pending) {
                this._vScroll.pending = true;
                requestAnimationFrame(() => {
                    this._vScroll.pending = false;
                    if (this.filteredPlaylist.length >= 100) this._renderVirtual();
                });
            }
        }, { passive: true });
    }

    // ─── Lazy-loading observer ────────────────────────────────────────────────

    _setupLazyObserver() {
        this._lazyObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target.querySelector('.pl-thumb img[data-src]');
                if (img) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                this._lazyObserver.unobserve(entry.target);
            });
        }, { root: this._dom.list, rootMargin: '80px' });
    }

    // ─── Filter + sort ────────────────────────────────────────────────────────

    _applyFiltersAndSort() {
        let list = [...this.playlist];

        // Search
        if (this.searchQuery) {
            const q = this.searchQuery;
            list = list.filter(t => {
                const title  = (t.metadata?.title  || t.fileName).toLowerCase();
                const artist = (t.metadata?.artist || '').toLowerCase();
                const album  = (t.metadata?.album  || '').toLowerCase();
                return title.includes(q) || artist.includes(q) || album.includes(q);
            });
        }

        // Mood / feature filter
        if (this.filterMood !== 'all') {
            list = list.filter(t => {
                switch (this.filterMood) {
                    case 'lyrics':   return !!t.vtt;
                    case 'metadata': return !!t.metadata?.hasMetadata;
                    case 'analysis': return !!(t.analysis || t.hasDeepAnalysis);
                    default:         return t.analysis?.mood?.toLowerCase() === this.filterMood;
                }
            });
        }

        // Sort
        if (this.sortBy !== 'default') {
            const dir = this.sortOrder === 'asc' ? 1 : -1;
            list.sort((a, b) => {
                const val = this._sortValue.bind(this);
                const av  = val(a);
                const bv  = val(b);
                if (av < bv) return -dir;
                if (av > bv) return  dir;
                return 0;
            });
        }

        this.filteredPlaylist = list;
        this._updateCount();
        this._render();
    }

    _sortValue(track) {
        switch (this.sortBy) {
            case 'title':    return (track.metadata?.title  || track.fileName).toLowerCase();
            case 'artist':   return (track.metadata?.artist || '').toLowerCase();
            case 'duration': return track.duration || 0;
            case 'bpm':      return track.analysis?.bpm  || 0;
            case 'energy':   return track.analysis?.energy || 0;
            case 'mood':     return (track.analysis?.mood  || '').toLowerCase();
            case 'vintage':  return track.analysis?.isVintage ? 1 : 0;
            case 'dance':    return track.analysis?.danceability || 0;
            default:         return 0;
        }
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    _render() {
        if (this.filteredPlaylist.length === 0) { this._renderEmpty(); return; }

        if (this.filteredPlaylist.length < 100) {
            this._renderAll();
        } else {
            this._renderVirtual();
        }

        this._updateUI();
    }

    _renderAll() {
        const frag = document.createDocumentFragment();
        this.filteredPlaylist.forEach((track, i) => frag.appendChild(this._createItem(track, i)));
        this._dom.list.innerHTML = '';
        this._dom.list.appendChild(frag);

        // Observe all items for lazy loading
        this._dom.list.querySelectorAll('.pl-item').forEach(el => this._lazyObserver.observe(el));
    }

    _renderVirtual() {
        const { scrollTop, itemHeight, buffer } = this._vScroll;
        const containerH = this._dom.list.clientHeight;
        const total      = this.filteredPlaylist.length;

        const start = Math.max(0,     Math.floor(scrollTop / itemHeight) - buffer);
        const end   = Math.min(total, Math.ceil((scrollTop + containerH) / itemHeight) + buffer);

        const frag = document.createDocumentFragment();

        const topSpacer = Object.assign(document.createElement('div'), {
            style: { height: `${start * itemHeight}px` },
        });
        frag.appendChild(topSpacer);

        for (let i = start; i < end; i++) {
            frag.appendChild(this._createItem(this.filteredPlaylist[i], i));
        }

        const botSpacer = Object.assign(document.createElement('div'), {
            style: { height: `${(total - end) * itemHeight}px` },
        });
        frag.appendChild(botSpacer);

        this._dom.list.innerHTML = '';
        this._dom.list.appendChild(frag);
    }

    _renderEmpty() {
        const msg = (this.searchQuery || this.filterMood !== 'all')
            ? 'No tracks match your filter'
            : 'No tracks loaded yet';
        this._dom.list.innerHTML = `<div class="pl-empty">${msg}</div>`;
        this._updateUI();
    }

    // ─── Item creation ────────────────────────────────────────────────────────

    /**
     * Build a single playlist item element.
     * NOTE: No event listeners are attached here — all handled via delegation.
     */
    _createItem(track, displayIndex) {
        const actualIndex = this.playlist.indexOf(track);

        const item = document.createElement('div');
        item.className = 'pl-item';
        item.dataset.index       = displayIndex;
        item.dataset.actualIndex = actualIndex;
        item.draggable = true;

        if (actualIndex === this.currentTrackIndex) item.classList.add('playing');
        if (this.selectionMode) {
            item.classList.add('selectable');
            if (this.selectedTracks.has(actualIndex)) item.classList.add('selected');
        }
        if (track.analysis?.mood) this._applyMoodStyle(item, track.analysis.mood);

        item.innerHTML = this._buildItemHTML(track, displayIndex);
        return item;
    }

    _buildItemHTML(track, displayIndex) {
        const title  = this._esc(track.metadata?.title  || track.fileName);
        const artist = this._esc(track.metadata?.artist || 'Unknown Artist');
        const album  = track.metadata?.album ? this._esc(track.metadata.album) : '';

        // Thumbnail — use data-src for lazy loading
        const imgSrc = track.metadata?.optimizedImage || track.metadata?.image;
        const thumbHTML = imgSrc
            ? `<img data-src="${imgSrc}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:5px;">`
            : `<span class="pl-placeholder">🎵</span>`;

        // Badges
        const badges = [];
        if (track.vtt)                    badges.push('<span class="pl-badge pl-badge-lyrics">🎤 Lyrics</span>');
        if (track.metadata?.hasMetadata)  badges.push('<span class="pl-badge pl-badge-meta">🏷️ ID3</span>');
        if (track.hasDeepAnalysis)        badges.push('<span class="pl-badge pl-badge-analysis">🔬 Deep</span>');
        if (track.analysis?.mood)         badges.push(this._moodBadgeHTML(track.analysis.mood));

        const badgesHTML = badges.length ? `<div class="pl-badges">${badges.join('')}</div>` : '';

        // Analysis line
        let analysisHTML = '';
        if (track.analysis) {
            const bpmPart    = track.analysis.bpm    ? `<span>♫ ${track.analysis.bpm} BPM</span>` : '';
            const energyPart = track.analysis.energy ? `<span>⚡ ${Math.round(track.analysis.energy * 100)}%</span>` : '';
            if (bpmPart || energyPart) {
                analysisHTML = `<div class="pl-analysis">${bpmPart}${energyPart}</div>`;
            }
        }

        const duration = track.duration ? `<div class="pl-duration">${this._fmtTime(track.duration)}</div>` : '';
        const checkbox = this.selectionMode ? '<div class="pl-checkbox">☐</div>' : '';

        return `
            ${checkbox}
            <div class="pl-num">${displayIndex + 1}</div>
            <div class="pl-thumb">${thumbHTML}</div>
            <div class="pl-info">
                <div class="pl-title">${title}</div>
                <div class="pl-artist">${artist}</div>
                ${album ? `<div class="pl-album">${album}</div>` : ''}
                ${badgesHTML}
                ${analysisHTML}
            </div>
            ${duration}
            <button class="pl-edit-btn" title="Edit Metadata">✏️</button>
            <button class="pl-menu-btn" title="More Options">⋮</button>
        `;
    }

    // ─── Mood styling ─────────────────────────────────────────────────────────

    _applyMoodStyle(item, mood) {
        const c = this._moodColor(mood);
        const dr = Math.max(0, Math.floor(c.r * 0.2));
        const dg = Math.max(0, Math.floor(c.g * 0.2));
        const db = Math.max(0, Math.floor(c.b * 0.2));
        const lr = Math.min(255, Math.floor(c.r * 0.4));
        const lg = Math.min(255, Math.floor(c.g * 0.4));
        const lb = Math.min(255, Math.floor(c.b * 0.4));
        item.style.background   = `linear-gradient(90deg, rgb(${dr},${dg},${db}) 0%, rgb(${lr},${lg},${lb}) 100%)`;
        item.style.borderColor  = `rgb(${c.r},${c.g},${c.b})`;
    }

    _moodBadgeHTML(mood) {
        const key = mood.toLowerCase();
        const c   = this._moodColor(key);
        const em  = this._moods[key]?.emoji ?? this._moods.neutral.emoji;
        const { r, g, b } = c;
        return `<span class="pl-badge pl-badge-mood" style="
            background:rgba(${r},${g},${b},0.3);
            color:rgb(${Math.min(255,r+50)},${Math.min(255,g+50)},${Math.min(255,b+50)});
            border:1px solid rgb(${r},${g},${b})
        ">${em} ${mood}</span>`;
    }

    _moodColor(key) {
        return this._moods[key] ?? this._moods.neutral;
    }

    // ─── Context menu ─────────────────────────────────────────────────────────

    _showContextMenu(event, index) {
        document.querySelector('.pl-ctx-menu')?.remove();

        const track = this.playlist[index];
        const menu  = document.createElement('div');
        menu.className = 'pl-ctx-menu';
        menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;z-index:9999`;
        menu.innerHTML = `
            <button data-action="play">▶️ Play Now</button>
            <button data-action="playNext">⏭️ Play Next</button>
            <button data-action="edit">✏️ Edit Metadata</button>
            <button data-action="info">ℹ️ Track Info</button>
            ${track.analysis ? '<button data-action="analysis">📊 View Analysis</button>' : ''}
            <button data-action="similar">🔍 Find Similar</button>
            <button data-action="remove">🗑️ Remove</button>
        `;

        document.body.appendChild(menu);

        // Keep within viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right  > window.innerWidth)  menu.style.left = `${event.clientX - rect.width}px`;
        if (rect.bottom > window.innerHeight) menu.style.top  = `${event.clientY - rect.height}px`;

        menu.addEventListener('click', e => {
            const action = e.target.dataset.action;
            if (!action) return;
            menu.remove();
            switch (action) {
                case 'play':     this.onTrackClick?.(index);  break;
                case 'playNext': this.onPlayNext?.(index);    break;
                case 'edit':     this.onEditClick?.(index);   break;
                case 'similar':  this.onFindSimilar?.(index); break;
                case 'info':     this._showTrackInfo(track);  break;
                case 'analysis': this._showAnalysisInfo(track); break;
                case 'remove':
                    if (confirm(`Remove "${track.metadata?.title || track.fileName}"?`))
                        this.onBatchDelete?.([index]);
                    break;
            }
        });

        // Dismiss on next outside click
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 0);
    }

    // ─── Selection mode ───────────────────────────────────────────────────────

    _toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        this.selectedTracks.clear();
        this._dom.selectBtn?.classList.toggle('active', this.selectionMode);

        if (this.selectionMode) this._showSelectionBar();
        else                    this._hideSelectionBar();

        this._render();
    }

    _toggleSelection(index, itemEl) {
        if (this.selectedTracks.has(index)) {
            this.selectedTracks.delete(index);
            itemEl?.classList.remove('selected');
        } else {
            this.selectedTracks.add(index);
            itemEl?.classList.add('selected');
        }
        this._updateSelectionBar();
    }

    _showSelectionBar() {
        let bar = document.querySelector('.pl-sel-bar');
        if (bar) return;

        bar = document.createElement('div');
        bar.className = 'pl-sel-bar';
        bar.innerHTML = `
            <span class="pl-sel-count">0 selected</span>
            <button id="pl-sel-all">Select All</button>
            <button id="pl-sel-none">Deselect All</button>
            <button id="pl-sel-delete">🗑️ Delete</button>
        `;

        this._dom.container?.insertBefore(bar, this._dom.list.parentNode);

        document.getElementById('pl-sel-all')   ?.addEventListener('click', () => this._selectAll());
        document.getElementById('pl-sel-none')  ?.addEventListener('click', () => this._deselectAll());
        document.getElementById('pl-sel-delete')?.addEventListener('click', () => this._deleteSelected());
    }

    _hideSelectionBar() {
        document.querySelector('.pl-sel-bar')?.remove();
    }

    _updateSelectionBar() {
        const count = document.querySelector('.pl-sel-count');
        if (count) count.textContent = `${this.selectedTracks.size} selected`;
    }

    _selectAll() {
        this.selectedTracks.clear();
        this.filteredPlaylist.forEach(t => this.selectedTracks.add(this.playlist.indexOf(t)));
        this._render();
    }

    _deselectAll() {
        this.selectedTracks.clear();
        this._render();
    }

    _deleteSelected() {
        if (!this.selectedTracks.size) return;
        if (confirm(`Delete ${this.selectedTracks.size} track(s)?`)) {
            this.onBatchDelete?.(Array.from(this.selectedTracks));
            this.selectedTracks.clear();
            this._toggleSelectionMode();
        }
    }

    // ─── Modals ───────────────────────────────────────────────────────────────

    _showTrackInfo(track) {
        const m = track.metadata ?? {};
        alert([
            '📀 Track Information',
            '',
            `Title:    ${m.title    || track.fileName}`,
            `Artist:   ${m.artist   || 'Unknown'}`,
            `Album:    ${m.album    || 'Unknown'}`,
            `Duration: ${track.duration ? this._fmtTime(track.duration) : 'Unknown'}`,
            `File:     ${track.fileName}`,
            '',
            `${track.vtt              ? '✓' : '✗'} Lyrics`,
            `${m.hasMetadata          ? '✓' : '✗'} Metadata`,
            `${track.analysis         ? '✓' : '✗'} Analysis`,
        ].join('\n'));
    }

    _showAnalysisInfo(track) {
        const a = track.analysis;
        if (!a) return;
        alert([
            '📊 Music Analysis',
            '',
            `BPM:          ${a.bpm          || 'N/A'}`,
            `Energy:       ${a.energy       ? `${(a.energy * 100).toFixed(0)}%` : 'N/A'}`,
            `Mood:         ${a.mood         || 'N/A'}`,
            `Key:          ${a.key          || 'N/A'}`,
            `Danceability: ${a.danceability ? `${(a.danceability * 100).toFixed(0)}%` : 'N/A'}`,
        ].join('\n'));
    }

    _showStatistics() {
        const s = this._calcStats();
        const moodLines = Object.entries(s.moods).map(([m, n]) => `  ${m}: ${n}`).join('\n');
        alert([
            '📊 Playlist Statistics',
            '',
            `Total tracks:     ${s.total}`,
            `Total duration:   ${this._fmtTime(s.totalDuration)}`,
            `Average duration: ${this._fmtTime(s.avgDuration)}`,
            '',
            `With Lyrics:   ${s.withLyrics}`,
            `With Metadata: ${s.withMetadata}`,
            `With Analysis: ${s.withAnalysis}`,
            s.avgBPM    ? `\nAverage BPM:    ${s.avgBPM}`    : '',
            s.avgEnergy ? `Average Energy: ${(s.avgEnergy * 100).toFixed(0)}%` : '',
            moodLines ? `\nMoods:\n${moodLines}` : '',
        ].filter(l => l !== '').join('\n'));
    }

    _calcStats() {
        const s = { total: this.playlist.length, totalDuration: 0, avgDuration: 0,
                    withLyrics: 0, withMetadata: 0, withAnalysis: 0,
                    avgBPM: null, avgEnergy: null, moods: {} };
        let bpmSum = 0, bpmN = 0, eSum = 0, eN = 0;

        this.playlist.forEach(t => {
            if (t.duration)           s.totalDuration += t.duration;
            if (t.vtt)                s.withLyrics++;
            if (t.metadata?.hasMetadata) s.withMetadata++;
            if (t.analysis || t.hasDeepAnalysis) s.withAnalysis++;
            if (t.analysis) {
                if (t.analysis.bpm)    { bpmSum += t.analysis.bpm;    bpmN++; }
                if (t.analysis.energy) { eSum   += t.analysis.energy; eN++;   }
                if (t.analysis.mood)   { s.moods[t.analysis.mood] = (s.moods[t.analysis.mood] || 0) + 1; }
            }
        });

        s.avgDuration = s.total > 0 ? s.totalDuration / s.total : 0;
        s.avgBPM      = bpmN > 0    ? Math.round(bpmSum / bpmN) : null;
        s.avgEnergy   = eN   > 0    ? eSum / eN                 : null;
        return s;
    }

    // ─── UI helpers ───────────────────────────────────────────────────────────

    _updateUI() {
        this._updateCount();

        if (this._dom.search) {
            this._dom.search.style.display = this.playlist.length >= 5 ? '' : 'none';
        }
        if (this._dom.clearBtn)  this._dom.clearBtn.disabled  = this.playlist.length === 0;
        if (this._dom.jumpBtn)   this._dom.jumpBtn.disabled   = this.currentTrackIndex === -1;
    }

    _updateCount() {
        if (!this._dom.countLabel) return;
        const shown = this.filteredPlaylist.length;
        const total = this.playlist.length;
        this._dom.countLabel.textContent = shown < total
            ? `${shown} of ${total} tracks`
            : `${total} track${total !== 1 ? 's' : ''}`;
    }

    _scrollItemIntoView(item) {
        const container = this._dom.container;
        if (!container) return;

        const cRect = container.getBoundingClientRect();
        const iRect = item.getBoundingClientRect();
        const visible = iRect.top >= cRect.top && iRect.bottom <= cRect.bottom;
        if (visible) return;

        container.scrollTo({
            top: item.offsetTop - container.clientHeight / 2 + item.clientHeight / 2,
            behavior: 'smooth',
        });
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    _savePrefs() {
        try {
            localStorage.setItem('plr_sortBy',    this.sortBy);
            localStorage.setItem('plr_sortOrder', this.sortOrder);
        } catch (_) {}
    }

    _loadPrefs() {
        try {
            this.sortBy    = localStorage.getItem('plr_sortBy')    || 'default';
            this.sortOrder = localStorage.getItem('plr_sortOrder') || 'asc';
        } catch (_) {
            this.sortBy    = 'default';
            this.sortOrder = 'asc';
        }
    }

    // ─── Micro-utilities ──────────────────────────────────────────────────────

    _fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    }

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
}

// ─── Module export ────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedPlaylistRenderer;
}
