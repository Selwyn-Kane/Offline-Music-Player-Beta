/* ============================================
   NATIVE FILE BROWSER v1.0
   APK-only music library scanner and selector.

   Only activates when window.NativeBridge.isNative() is true.
   Calls NativeBridge.scanMusicLibrary() to get lightweight
   metadata (paths, no binary reads), lets the user pick songs,
   then resolves with the selected descriptors.

   Expected NativeBridge methods:
     scanMusicLibrary()              → Promise<ScanResult[]>
     readFileAsBlob(path, mimeType)  → Promise<Blob>

   ScanResult shape:
     { name, path, uri, size, mimeType, duration?, title?, artist?, album? }
   ============================================ */

class NativeFileBrowser {

    constructor(debugLog = console.log) {
        this._log = debugLog;
        this._modal = null;
        this._resolve = null;
        this._reject  = null;

        // Track the filtered + full scan result separately
        this._allTracks    = [];
        this._filtered     = [];
        this._selected     = new Set();   // set of track paths
        this._searchQuery  = '';
        this._sortMode     = 'artist';    // 'artist' | 'title' | 'album' | 'folder'

        this._injectStyles();
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Open the browser modal and return a Promise that resolves with the
     * array of selected ScanResult descriptors, or rejects with AbortError
     * if the user cancels.
     */
    open() {
        return new Promise((resolve, reject) => {
            if (!window.NativeBridge?.isNative()) {
                const err = new Error('NativeFileBrowser requires the APK environment');
                err.name = 'NotSupportedError';
                return reject(err);
            }

            this._resolve = resolve;
            this._reject  = reject;
            this._selected.clear();
            this._allTracks = [];
            this._filtered  = [];

            this._buildModal();
            this._scan();
        });
    }

    // ─── Scanning ─────────────────────────────────────────────────────────────

    async _scan() {
        this._showState('loading');

        try {
            const tracks = await window.NativeBridge.scanMusicLibrary();

            if (!tracks || tracks.length === 0) {
                this._showState('empty');
                return;
            }

            // Normalise: ensure every entry has a `title` and `artist` field
            this._allTracks = tracks.map(t => ({
                ...t,
                title:  t.title  || this._fileBaseName(t.name),
                artist: t.artist || 'Unknown Artist',
                album:  t.album  || 'Unknown Album',
            }));

            this._log(`📱 Scanned ${this._allTracks.length} tracks`, 'info');

            this._applyFilter();
            this._showState('list');

        } catch (err) {
            this._log(`❌ Scan failed: ${err.message}`, 'error');
            this._showState('error', err.message);
        }
    }

    // ─── Filtering / sorting ──────────────────────────────────────────────────

    _applyFilter() {
        const q = this._searchQuery.toLowerCase().trim();

        this._filtered = q
            ? this._allTracks.filter(t =>
                t.title.toLowerCase().includes(q)  ||
                t.artist.toLowerCase().includes(q) ||
                t.album.toLowerCase().includes(q)
              )
            : [...this._allTracks];

        this._sortFiltered();
        this._renderList();
        this._updateFooter();
    }

    _sortFiltered() {
        const key = this._sortMode;
        this._filtered.sort((a, b) => {
            const av = (a[key] || '').toLowerCase();
            const bv = (b[key] || '').toLowerCase();
            if (av < bv) return -1;
            if (av > bv) return  1;
            return (a.title || '').localeCompare(b.title || '');
        });
    }

    // ─── Modal construction ───────────────────────────────────────────────────

    _buildModal() {
        // Remove any stale instance
        document.getElementById('nfb-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'nfb-modal';
        modal.innerHTML = `
            <div id="nfb-panel">
                <div id="nfb-header">
                    <span id="nfb-title">🎵 Music Library</span>
                    <button id="nfb-close-btn" aria-label="Close">✕</button>
                </div>

                <div id="nfb-toolbar">
                    <input id="nfb-search" type="text" placeholder="Search songs, artists, albums…" autocomplete="off">
                    <div id="nfb-sort-row">
                        <span class="nfb-sort-label">Sort:</span>
                        <button class="nfb-sort-btn active" data-sort="artist">Artist</button>
                        <button class="nfb-sort-btn"        data-sort="title">Title</button>
                        <button class="nfb-sort-btn"        data-sort="album">Album</button>
                    </div>
                </div>

                <div id="nfb-state-loading" class="nfb-state">
                    <div class="nfb-spinner"></div>
                    <p>Scanning music library…</p>
                </div>

                <div id="nfb-state-error" class="nfb-state" style="display:none">
                    <p>❌ Could not scan library.</p>
                    <p id="nfb-error-msg" class="nfb-sub"></p>
                    <button id="nfb-retry-btn">Retry</button>
                </div>

                <div id="nfb-state-empty" class="nfb-state" style="display:none">
                    <p>📭 No music found on this device.</p>
                </div>

                <div id="nfb-list-wrap" style="display:none">
                    <div id="nfb-select-row">
                        <button id="nfb-select-all">Select All</button>
                        <button id="nfb-select-none">Deselect All</button>
                        <span id="nfb-count-label"></span>
                    </div>
                    <div id="nfb-list" role="list"></div>
                </div>

                <div id="nfb-footer">
                    <button id="nfb-add-btn" disabled>Add to Playlist</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this._modal = modal;

        this._bindModalEvents();
    }

    _bindModalEvents() {
        const $  = id => document.getElementById(id);

        // Close / cancel
        $('nfb-close-btn').addEventListener('click', () => this._cancel());

        // Clicking the dark backdrop cancels
        this._modal.addEventListener('click', e => {
            if (e.target === this._modal) this._cancel();
        });

        // Search
        $('nfb-search').addEventListener('input', e => {
            this._searchQuery = e.target.value;
            this._applyFilter();
        });

        // Sort buttons
        this._modal.querySelectorAll('.nfb-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._modal.querySelectorAll('.nfb-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._sortMode = btn.dataset.sort;
                this._sortFiltered();
                this._renderList();
            });
        });

        // Select all / none — scoped to current filtered view
        $('nfb-select-all').addEventListener('click', () => {
            this._filtered.forEach(t => this._selected.add(t.path || t.uri));
            this._renderList();
            this._updateFooter();
        });

        $('nfb-select-none').addEventListener('click', () => {
            this._selected.clear();
            this._renderList();
            this._updateFooter();
        });

        // Add button
        $('nfb-add-btn').addEventListener('click', () => this._confirm());

        // Retry
        $('nfb-retry-btn').addEventListener('click', () => this._scan());
    }

    // ─── List rendering ───────────────────────────────────────────────────────

    _renderList() {
        const list = document.getElementById('nfb-list');
        if (!list) return;

        // Build a document fragment for performance — avoid reflow per item
        const frag = document.createDocumentFragment();

        this._filtered.forEach(track => {
            const key     = track.path || track.uri;
            const checked = this._selected.has(key);
            const dur     = track.duration ? this._formatDuration(track.duration) : '';

            const row = document.createElement('div');
            row.className    = 'nfb-row' + (checked ? ' nfb-row-checked' : '');
            row.dataset.path = key;
            row.setAttribute('role', 'listitem');

            row.innerHTML = `
                <div class="nfb-checkbox" aria-checked="${checked}" role="checkbox">
                    ${checked ? '✓' : ''}
                </div>
                <div class="nfb-track-info">
                    <div class="nfb-track-title">${this._esc(track.title)}</div>
                    <div class="nfb-track-sub">${this._esc(track.artist)}${track.album && track.album !== 'Unknown Album' ? ' · ' + this._esc(track.album) : ''}${dur ? ' · ' + dur : ''}</div>
                </div>
            `;

            row.addEventListener('click', () => this._toggleTrack(key, row));
            frag.appendChild(row);
        });

        list.innerHTML = '';
        list.appendChild(frag);
    }

    _toggleTrack(key, row) {
        if (this._selected.has(key)) {
            this._selected.delete(key);
            row.classList.remove('nfb-row-checked');
            row.querySelector('.nfb-checkbox').textContent = '';
            row.querySelector('.nfb-checkbox').setAttribute('aria-checked', 'false');
        } else {
            this._selected.add(key);
            row.classList.add('nfb-row-checked');
            row.querySelector('.nfb-checkbox').textContent = '✓';
            row.querySelector('.nfb-checkbox').setAttribute('aria-checked', 'true');
        }
        this._updateFooter();
    }

    _updateFooter() {
        const countLabel = document.getElementById('nfb-count-label');
        const addBtn     = document.getElementById('nfb-add-btn');
        const n          = this._selected.size;

        if (countLabel) countLabel.textContent = `${this._filtered.length} shown`;
        if (addBtn) {
            addBtn.disabled    = n === 0;
            addBtn.textContent = n > 0 ? `Add ${n} Song${n !== 1 ? 's' : ''} to Playlist` : 'Add to Playlist';
        }
    }

    // ─── State display ────────────────────────────────────────────────────────

    _showState(state, errorMsg = '') {
        const states = {
            loading: document.getElementById('nfb-state-loading'),
            error:   document.getElementById('nfb-state-error'),
            empty:   document.getElementById('nfb-state-empty'),
            list:    document.getElementById('nfb-list-wrap'),
        };

        // Hide all
        Object.values(states).forEach(el => { if (el) el.style.display = 'none'; });

        // Show requested state
        if (states[state]) states[state].style.display = '';

        if (state === 'error') {
            const msg = document.getElementById('nfb-error-msg');
            if (msg) msg.textContent = errorMsg;
        }

        // Show toolbar only when list is ready
        const toolbar = document.getElementById('nfb-toolbar');
        if (toolbar) toolbar.style.display = state === 'list' ? '' : 'none';

        const footer = document.getElementById('nfb-footer');
        if (footer) footer.style.display = state === 'list' ? '' : 'none';
    }

    // ─── Confirm / cancel ─────────────────────────────────────────────────────

    _confirm() {
        if (this._selected.size === 0) return;

        // Resolve with only the selected track descriptors
        const selectedTracks = this._allTracks.filter(t =>
            this._selected.has(t.path || t.uri)
        );

        this._close();
        this._resolve(selectedTracks);
    }

    _cancel() {
        this._close();
        const err = new Error('Cancelled by user');
        err.name  = 'AbortError';
        this._reject(err);
    }

    _close() {
        this._modal?.remove();
        this._modal   = null;
        this._resolve = null;
        this._reject  = null;
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    _fileBaseName(filename) {
        if (!filename) return 'Unknown';
        return filename.split('.').slice(0, -1).join('.') || filename;
    }

    _formatDuration(seconds) {
        if (!seconds || !isFinite(seconds)) return '';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Minimal HTML escaping — used only for text inside innerHTML
    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── Styles ───────────────────────────────────────────────────────────────

    _injectStyles() {
        const STYLE_ID = 'nfb-styles';
        if (document.getElementById(STYLE_ID)) return;

        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
            /* ── Backdrop ── */
            #nfb-modal {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.85);
                z-index: 20000;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding: env(safe-area-inset-top, 0) 0 0;
            }

            /* ── Panel ── */
            #nfb-panel {
                background: #111;
                border-radius: 20px 20px 0 0;
                border: 1px solid #2a2a2a;
                border-bottom: none;
                width: 100%;
                max-width: 680px;
                max-height: 92vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            /* ── Header ── */
            #nfb-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 18px 20px 14px;
                border-bottom: 1px solid #222;
                flex-shrink: 0;
            }

            #nfb-title {
                font-size: 1.1em;
                font-weight: 700;
                color: #fff;
            }

            #nfb-close-btn {
                background: rgba(220, 53, 69, 0.2);
                border: 1px solid rgba(220, 53, 69, 0.4);
                color: #dc3545;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                font-size: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s;
                touch-action: manipulation;
            }

            #nfb-close-btn:hover, #nfb-close-btn:active {
                background: rgba(220, 53, 69, 0.4);
            }

            /* ── Toolbar ── */
            #nfb-toolbar {
                padding: 12px 16px 8px;
                flex-shrink: 0;
                border-bottom: 1px solid #1e1e1e;
            }

            #nfb-search {
                width: 100%;
                box-sizing: border-box;
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 10px;
                color: #fff;
                padding: 10px 14px;
                font-size: 15px;
                outline: none;
                margin-bottom: 10px;
            }

            #nfb-search:focus {
                border-color: #dc3545;
            }

            #nfb-sort-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .nfb-sort-label {
                color: #888;
                font-size: 12px;
                white-space: nowrap;
            }

            .nfb-sort-btn {
                background: #1e1e1e;
                border: 1px solid #333;
                border-radius: 6px;
                color: #aaa;
                padding: 5px 12px;
                font-size: 12px;
                cursor: pointer;
                touch-action: manipulation;
                transition: all 0.15s;
            }

            .nfb-sort-btn.active {
                background: rgba(220, 53, 69, 0.2);
                border-color: #dc3545;
                color: #fff;
            }

            /* ── State panels ── */
            .nfb-state {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                color: #aaa;
                text-align: center;
                gap: 12px;
            }

            .nfb-sub {
                font-size: 13px;
                color: #666;
            }

            .nfb-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #333;
                border-top-color: #dc3545;
                border-radius: 50%;
                animation: nfb-spin 0.8s linear infinite;
            }

            @keyframes nfb-spin {
                to { transform: rotate(360deg); }
            }

            #nfb-retry-btn {
                background: rgba(220, 53, 69, 0.2);
                border: 1px solid #dc3545;
                border-radius: 8px;
                color: #dc3545;
                padding: 10px 24px;
                font-size: 14px;
                cursor: pointer;
                margin-top: 8px;
                touch-action: manipulation;
            }

            /* ── List wrap ── */
            #nfb-list-wrap {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                min-height: 0;
            }

            #nfb-select-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 16px;
                border-bottom: 1px solid #1e1e1e;
                flex-shrink: 0;
            }

            #nfb-select-row button {
                background: #1e1e1e;
                border: 1px solid #333;
                border-radius: 6px;
                color: #ccc;
                padding: 5px 12px;
                font-size: 12px;
                cursor: pointer;
                touch-action: manipulation;
            }

            #nfb-count-label {
                color: #666;
                font-size: 12px;
                margin-left: auto;
            }

            /* ── Scrollable list ── */
            #nfb-list {
                flex: 1;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
                padding: 4px 0;
            }

            /* ── Track rows ── */
            .nfb-row {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 12px 16px;
                cursor: pointer;
                border-bottom: 1px solid #1a1a1a;
                transition: background 0.1s;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            }

            .nfb-row:active, .nfb-row:hover {
                background: #1a1a1a;
            }

            .nfb-row-checked {
                background: rgba(220, 53, 69, 0.08) !important;
            }

            .nfb-checkbox {
                width: 24px;
                height: 24px;
                min-width: 24px;
                border: 2px solid #444;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                color: #dc3545;
                font-weight: 700;
                transition: all 0.15s;
                flex-shrink: 0;
            }

            .nfb-row-checked .nfb-checkbox {
                background: rgba(220, 53, 69, 0.2);
                border-color: #dc3545;
            }

            .nfb-track-info {
                flex: 1;
                min-width: 0;
            }

            .nfb-track-title {
                color: #fff;
                font-size: 14px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .nfb-track-sub {
                color: #888;
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-top: 2px;
            }

            /* ── Footer ── */
            #nfb-footer {
                padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
                border-top: 1px solid #222;
                flex-shrink: 0;
            }

            #nfb-add-btn {
                width: 100%;
                padding: 15px;
                background: linear-gradient(135deg, #dc3545, #c82333);
                border: none;
                border-radius: 12px;
                color: #fff;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                touch-action: manipulation;
                transition: opacity 0.15s;
            }

            #nfb-add-btn:disabled {
                background: #2a2a2a;
                color: #555;
                cursor: default;
            }

            #nfb-add-btn:not(:disabled):active {
                opacity: 0.85;
            }
        `;
        document.head.appendChild(s);
    }
}

if (typeof window !== 'undefined') window.NativeFileBrowser = NativeFileBrowser;
