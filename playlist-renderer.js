/* ============================================
   ENHANCED PLAYLIST RENDERER
   High-performance, feature-rich playlist system
   ============================================ */

class EnhancedPlaylistRenderer {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.playlist = [];
        this.filteredPlaylist = [];
        this.currentTrackIndex = -1;
        this.sortBy = 'default';
        this.sortOrder = 'asc';
        this.filterMood = 'all';
        this.searchQuery = '';
        
        // Callbacks
        this.onTrackClick = null;
        this.onEditClick = null;
        this.onReorder = null;
        this.onBatchDelete = null;
        
        // DOM elements
        this.container = null;
        this.playlistItems = null;
        this.searchInput = null;
        this.clearButton = null;
        this.jumpToCurrentBtn = null;
        this.sortDropdown = null;
        this.filterDropdown = null;
        this.statsContainer = null;
        
        // Virtual scrolling
        this.itemHeight = 80;
        this.visibleItems = 10;
        this.scrollTop = 0;
        this.renderBuffer = 5;
        
        // Performance
        this.renderThrottle = null;
        this.itemCache = new Map();
        this.observerCache = new Map();
        
        // Selection mode
        this.selectionMode = false;
        this.selectedTracks = new Set();
        
        // Drag and drop
        this.draggedItem = null;
        this.dropTarget = null;
        
        // Mood system
        this.moodColors = {
            'energetic': { r: 255, g: 87, b: 51 },
            'calm': { r: 51, g: 153, b: 255 },
            'bright': { r: 255, g: 215, b: 0 },
            'dark': { r: 147, g: 51, b: 234 },
            'neutral': { r: 220, g: 53, b: 69 }
        };
        
        this.moodEmojis = {
            'energetic': '⚡',
            'calm': '🌊',
            'bright': '☀️',
            'dark': '🌙',
            'neutral': '🎵'
        };
        
        // Load preferences
        this.loadPreferences();
    }
    
    /**
     * Initialize renderer with DOM elements
     */
    init(elements) {
        this.container = elements.playlistContainer || document.getElementById('playlist-container');
        this.playlistItems = elements.playlistItems;
        this.searchInput = elements.playlistSearch;
        this.clearButton = elements.clearButton;
        this.jumpToCurrentBtn = elements.jumpToCurrentBtn;
        
        if (!this.playlistItems) {
            this.debugLog('❌ Playlist items container not found', 'error');
            return;
        }
        
        // Create toolbar
        this.createToolbar();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup virtual scrolling
        this.setupVirtualScrolling();
        
        // Setup intersection observer for lazy loading
        this.setupIntersectionObserver();
        
        this.debugLog('✅ Enhanced playlist renderer initialized', 'success');
    }
    
    /**
     * Create advanced toolbar
     */
    createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'playlist-toolbar';
        toolbar.innerHTML = `
            <div class="playlist-toolbar-left">
                <button id="playlist-select-mode" class="toolbar-btn" title="Selection Mode">
                    <span>☑️</span>
                </button>
                <button id="playlist-stats-btn" class="toolbar-btn" title="Statistics">
                    <span>📊</span>
                </button>
                <select id="playlist-sort" class="toolbar-select">
                    <option value="default">Default Order</option>
                    <option value="title">Title (A-Z)</option>
                    <option value="artist">Artist (A-Z)</option>
                    <option value="duration">Duration</option>
                    <option value="bpm">BPM</option>
                    <option value="energy">Energy</option>
                    <option value="mood">Mood</option>
                    <option value="vintage">Vintage First</option>
                    <option value="dance">Danceability</option>
                </select>
                <select id="playlist-filter" class="toolbar-select">
                    <option value="all">All Tracks</option>
                    <option value="lyrics">Has Lyrics</option>
                    <option value="metadata">Has Metadata</option>
                    <option value="analysis">Has Analysis</option>
                    <option value="energetic">Energetic</option>
                    <option value="calm">Calm</option>
                    <option value="bright">Bright</option>
                    <option value="dark">Dark</option>
                </select>
            </div>
            <div class="playlist-toolbar-right">
                <span id="playlist-count" class="playlist-count">0 tracks</span>
            </div>
        `;
        
        // Insert before playlist items
        this.playlistItems.parentNode.insertBefore(toolbar, this.playlistItems);
        
        // Store references
        this.sortDropdown = document.getElementById('playlist-sort');
        this.filterDropdown = document.getElementById('playlist-filter');
        this.selectModeBtn = document.getElementById('playlist-select-mode');
        this.statsBtn = document.getElementById('playlist-stats-btn');
        this.countDisplay = document.getElementById('playlist-count');
        
        // Restore saved preferences
        if (this.sortBy !== 'default') {
            this.sortDropdown.value = this.sortBy;
        }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Search
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.applyFiltersAndSort();
            });
        }
        
        // Sort
        if (this.sortDropdown) {
            this.sortDropdown.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.savePreferences();
                this.applyFiltersAndSort();
            });
        }
        
        // Filter
        if (this.filterDropdown) {
            this.filterDropdown.addEventListener('change', (e) => {
                this.filterMood = e.target.value;
                this.applyFiltersAndSort();
            });
        }
        
        // Selection mode
        if (this.selectModeBtn) {
            this.selectModeBtn.addEventListener('click', () => {
                this.toggleSelectionMode();
            });
        }
        
        // Stats
        if (this.statsBtn) {
            this.statsBtn.addEventListener('click', () => {
                this.showStatistics();
            });
        }
        
        // Jump to current
        if (this.jumpToCurrentBtn) {
            this.jumpToCurrentBtn.addEventListener('click', () => {
                this.jumpToCurrent();
            });
        }
        
        // 🔥 EVENT DELEGATION for playlist items (works with cache!)
        if (this.playlistItems) {
            this.playlistItems.addEventListener('click', (e) => {
                const item = e.target.closest('.playlist-item');
                if (!item) return;
                
                const actualIndex = parseInt(item.dataset.actualIndex);
                if (isNaN(actualIndex)) return;
                
                // Edit button
                if (e.target.classList.contains('playlist-item-edit-btn')) {
                    e.stopPropagation();
                    if (this.onEditClick) {
                        this.onEditClick(actualIndex);
                    }
                    return;
                }
                
                // Menu button (3 dots)
                if (e.target.classList.contains('playlist-item-menu-btn') || 
                    e.target.closest('.playlist-item-menu-btn')) {
                    e.stopPropagation();
                    this.showContextMenu(e, actualIndex);
                    return;
                }
                
                // Selection mode
                if (this.selectionMode) {
                    this.toggleSelection(actualIndex);
                    item.classList.toggle('selected');
                } else {
                    // Regular track click
                    if (this.onTrackClick) {
                        this.onTrackClick(actualIndex);
                    }
                }
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 'j' || e.key === 'J') {
                e.preventDefault();
                this.jumpToCurrent();
            }
        });
    }
    
    /**
     * Setup virtual scrolling for large playlists
     */
    setupVirtualScrolling() {
        if (!this.playlistItems) return;
        
        this.playlistItems.addEventListener('scroll', () => {
            clearTimeout(this.renderThrottle);
            this.renderThrottle = setTimeout(() => {
                this.scrollTop = this.playlistItems.scrollTop;
                this.renderVisibleItems();
            }, 16); // ~60fps
        });
    }
    
    /**
     * Setup intersection observer for lazy loading
     */
    setupIntersectionObserver() {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const item = entry.target;
                    const img = item.querySelector('.playlist-item-thumbnail img');
                    if (img && img.dataset.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                    }
                }
            });
        }, {
            root: this.playlistItems,
            rootMargin: '50px'
        });
    }
    
    /**
     * Set callbacks
     */
    setCallbacks(callbacks) {
        this.onTrackClick = callbacks.onTrackClick;
        this.onEditClick = callbacks.onEditClick;
        this.onReorder = callbacks.onReorder;
        this.onBatchDelete = callbacks.onBatchDelete;
    }
    
    /**
     * Update playlist data
     */
    setPlaylist(playlist, currentIndex) {
        this.playlist = playlist;
        this.currentTrackIndex = currentIndex;
        this.applyFiltersAndSort();
    }
    
    /**
     * Apply filters and sorting
     */
    applyFiltersAndSort() {
        let filtered = [...this.playlist];
        
        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(track => {
                const title = (track.metadata?.title || track.fileName).toLowerCase();
                const artist = (track.metadata?.artist || '').toLowerCase();
                const album = (track.metadata?.album || '').toLowerCase();
                return title.includes(this.searchQuery) || 
                       artist.includes(this.searchQuery) ||
                       album.includes(this.searchQuery);
            });
        }
        
        // Apply mood/feature filter
        if (this.filterMood !== 'all') {
            filtered = filtered.filter(track => {
                switch(this.filterMood) {
                    case 'lyrics': return !!track.vtt;
                    case 'metadata': return track.metadata?.hasMetadata;
                    case 'analysis': return !!track.analysis || track.hasDeepAnalysis;
                    case 'energetic':
                    case 'calm':
                    case 'bright':
                    case 'dark':
                        return track.analysis?.mood?.toLowerCase() === this.filterMood;
                    default: return true;
                }
            });
        }
        
        // Apply sorting
        if (this.sortBy !== 'default') {
            filtered.sort((a, b) => {
                let aVal, bVal;
                
                switch(this.sortBy) {
                    case 'title':
                        aVal = (a.metadata?.title || a.fileName).toLowerCase();
                        bVal = (b.metadata?.title || b.fileName).toLowerCase();
                        break;
                    case 'artist':
                        aVal = (a.metadata?.artist || '').toLowerCase();
                        bVal = (b.metadata?.artist || '').toLowerCase();
                        break;
                    case 'duration':
                        aVal = a.duration || 0;
                        bVal = b.duration || 0;
                        break;
                    case 'bpm':
                        aVal = a.analysis?.bpm || 0;
                        bVal = b.analysis?.bpm || 0;
                        break;
                    case 'energy':
                        aVal = a.analysis?.energy || 0;
                        bVal = b.analysis?.energy || 0;
                        break;
                    case 'mood':
                        aVal = (a.analysis?.mood || '').toLowerCase();
                        bVal = (b.analysis?.mood || '').toLowerCase();
                        break;
                    case 'vintage':
                        aVal = a.analysis?.isVintage ? 1 : 0;
                        bVal = b.analysis?.isVintage ? 1 : 0;
                        break;
                    case 'dance':
                        aVal = a.analysis?.danceability || 0;
                        bVal = b.analysis?.danceability || 0;
                        break;
                    default:
                        return 0;
                }
                
                if (aVal < bVal) return this.sortOrder === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        this.filteredPlaylist = filtered;
        this.updateCount();
        this.render();
    }
    
    /**
     * Main render function with virtual scrolling
     */
render() {
    if (this.filteredPlaylist.length === 0) {
        this.renderEmptyState();
        return;
    }
    
    // Use simple rendering for small playlists
    if (this.filteredPlaylist.length < 100) {
        this.renderAllItems();
    } else {
        this.renderVisibleItems();
    }
    
    this.updateUI();
}

renderAllItems() {
    const fragment = document.createDocumentFragment();
    
    this.filteredPlaylist.forEach((track, index) => {
        const item = this.createTrackItem(track, index);
        fragment.appendChild(item);
    });
    
    this.playlistItems.innerHTML = '';
    this.playlistItems.appendChild(fragment);
    
    // 🔥 FIX: Ensure all images are loaded correctly
    requestAnimationFrame(() => {
        const images = this.playlistItems.querySelectorAll('.playlist-item-thumbnail img');
        
        images.forEach(img => {
            const dataSrc = img.getAttribute('data-src');
            if (dataSrc) {
                img.src = dataSrc;
                img.removeAttribute('data-src');
            }
        });
    });
}
    
    /**
     * Render visible items with virtual scrolling
     */
    renderVisibleItems() {
        const containerHeight = this.playlistItems.clientHeight;
        const totalHeight = this.filteredPlaylist.length * this.itemHeight;
        
        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.renderBuffer);
        const endIndex = Math.min(
            this.filteredPlaylist.length,
            Math.ceil((this.scrollTop + containerHeight) / this.itemHeight) + this.renderBuffer
        );
        
        // Create spacer elements
        const topSpacer = document.createElement('div');
        topSpacer.style.height = `${startIndex * this.itemHeight}px`;
        
        const bottomSpacer = document.createElement('div');
        bottomSpacer.style.height = `${(this.filteredPlaylist.length - endIndex) * this.itemHeight}px`;
        
        // Render visible items
        const fragment = document.createDocumentFragment();
        fragment.appendChild(topSpacer);
        
        for (let i = startIndex; i < endIndex; i++) {
            const track = this.filteredPlaylist[i];
            const item = this.createTrackItem(track, i);
            fragment.appendChild(item);
        }
        
        fragment.appendChild(bottomSpacer);
        
        this.playlistItems.innerHTML = '';
        this.playlistItems.appendChild(fragment);
    }
    
    /**
     * Create a single track item
     */
    createTrackItem(track, displayIndex) {
        // Check cache
        const cacheKey = `${track.fileName}-${displayIndex}`;
        if (this.itemCache.has(cacheKey)) {
            return this.itemCache.get(cacheKey).cloneNode(true);
        }
        
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.dataset.index = displayIndex;
        
        // Find actual index in original playlist
        const actualIndex = this.playlist.indexOf(track);
        item.dataset.actualIndex = actualIndex; 
        
        // Draggable
        item.draggable = true;
        
        // Highlight current track
        if (actualIndex === this.currentTrackIndex) {
            item.classList.add('playing');
        }
        
        // Selection mode
        if (this.selectionMode) {
            item.classList.add('selectable');
            if (this.selectedTracks.has(actualIndex)) {
                item.classList.add('selected');
            }
        }
        
        // Apply mood styling
        if (track.analysis?.mood) {
            this.applyMoodStyling(item, track);
        }
        
        // Build content
        const content = this.buildTrackContent(track, displayIndex, actualIndex);
        item.innerHTML = content;
        
        // Event listeners
        this.attachItemListeners(item, actualIndex);
        
        // Observe for lazy loading
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(item);
        }
        
        // Cache it
        this.itemCache.set(cacheKey, item.cloneNode(true));
        
        return item;
    }
    
    /**
     * Build track item HTML content
     */
    buildTrackContent(track, displayIndex, actualIndex) {
        const title = track.metadata?.title || track.fileName;
        const artist = track.metadata?.artist || 'Unknown Artist';
        const album = track.metadata?.album || '';
        
// Thumbnail
let thumbnailHTML;
const imageSrc = track.metadata?.optimizedImage || track.metadata?.image;
if (imageSrc) {
    // Use data-src for small playlists to avoid blocking UI, or src for direct loading
    thumbnailHTML = `<img src="${imageSrc}" alt="Album art" style="width: 100%; height: 100%; object-fit: cover; border-radius: 5px; background: rgba(255,255,255,0.1);">`;
} else {
    thumbnailHTML = `<span class="playlist-item-placeholder">🎵</span>`;
}
        
        // Badges
        const badges = [];
        if (track.vtt) badges.push('<span class="badge badge-lyrics">🎤 Lyrics</span>');
        if (track.metadata?.hasMetadata) badges.push('<span class="badge badge-metadata">🏷️ ID3</span>');
        if (track.hasDeepAnalysis) badges.push('<span class="badge badge-analysis">🔬 Deep</span>');
        if (track.analysis?.mood) {
            badges.push(this.createMoodBadgeHTML(track.analysis.mood));
        }
        
        // Duration
        const durationText = track.duration ? this.formatTime(track.duration) : '';
        
        // Analysis info
        let analysisHTML = '';
        if (track.analysis) {
            analysisHTML = `
                <div class="playlist-item-analysis">
                    ${track.analysis.bpm ? `<span>♫ ${track.analysis.bpm} BPM</span>` : ''}
                    ${track.analysis.energy ? `<span>⚡ ${Math.round(track.analysis.energy * 100)}%</span>` : ''}
                </div>
            `;
        }
        
        return `
            ${this.selectionMode ? '<div class="playlist-item-checkbox">☐</div>' : ''}
            <div class="playlist-item-number">${displayIndex + 1}</div>
            <div class="playlist-item-thumbnail">${thumbnailHTML}</div>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${this.escapeHtml(title)}</div>
                <div class="playlist-item-artist">${this.escapeHtml(artist)}</div>
                ${album ? `<div class="playlist-item-album">${this.escapeHtml(album)}</div>` : ''}
                ${badges.length > 0 ? `<div class="playlist-item-badges">${badges.join('')}</div>` : ''}
                ${analysisHTML}
            </div>
            ${durationText ? `<div class="playlist-item-duration">${durationText}</div>` : ''}
            <button class="playlist-item-edit-btn" title="Edit Metadata">✏️</button>
            <button class="playlist-item-menu-btn" title="More Options">⋮</button>
        `;
    }
    
    /**
     * Create mood badge HTML
     */
    createMoodBadgeHTML(mood) {
        const moodKey = mood.toLowerCase();
        const color = this.moodColors[moodKey] || this.moodColors.neutral;
        const emoji = this.moodEmojis[moodKey] || this.moodEmojis.neutral;
        const { r, g, b } = color;
        
        return `<span class="badge badge-mood" style="
            background: rgba(${r}, ${g}, ${b}, 0.3);
            color: rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)});
            border: 1px solid rgb(${r}, ${g}, ${b});
        ">${emoji} ${mood}</span>`;
    }
    
    /**
     * Apply mood-based styling to item
     */
    applyMoodStyling(item, track) {
        const moodKey = track.analysis.mood.toLowerCase();
        const color = this.moodColors[moodKey] || this.moodColors.neutral;
        const { r, g, b } = color;
        
        const darkerR = Math.max(0, Math.floor(r * 0.2));
        const darkerG = Math.max(0, Math.floor(g * 0.2));
        const darkerB = Math.max(0, Math.floor(b * 0.2));
        const lighterR = Math.min(255, Math.floor(r * 0.4));
        const lighterG = Math.min(255, Math.floor(g * 0.4));
        const lighterB = Math.min(255, Math.floor(b * 0.4));
        
        item.style.background = `linear-gradient(90deg, rgb(${darkerR}, ${darkerG}, ${darkerB}) 0%, rgb(${lighterR}, ${lighterG}, ${lighterB}) 100%)`;
        item.style.borderColor = `rgb(${r}, ${g}, ${b})`;
    }
    
    /**
     * Attach event listeners to item
     */
    attachItemListeners(item, actualIndex) {
        // Click handler
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('playlist-item-edit-btn')) {
                e.stopPropagation();
                if (this.onEditClick) {
                    this.onEditClick(actualIndex);
                }
                return;
            }
            
            if (e.target.classList.contains('playlist-item-menu-btn')) {
                e.stopPropagation();
                this.showContextMenu(e, actualIndex);
                return;
            }
            
            if (this.selectionMode) {
                this.toggleSelection(actualIndex);
                item.classList.toggle('selected');
            } else {
                if (this.onTrackClick) {
                    this.onTrackClick(actualIndex);
                }
            }
        });
        
        // Drag and drop
        item.addEventListener('dragstart', (e) => {
            if (this.selectionMode) {
                e.preventDefault();
                return;
            }
            this.draggedItem = actualIndex;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
            this.draggedItem = null;
        });
        
        item.addEventListener('dragover', (e) => {
            if (this.selectionMode || this.draggedItem === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            if (e.clientY < midpoint) {
                item.classList.add('drop-before');
                item.classList.remove('drop-after');
            } else {
                item.classList.add('drop-after');
                item.classList.remove('drop-before');
            }
        });
        
        item.addEventListener('dragleave', (e) => {
            item.classList.remove('drop-before', 'drop-after');
        });
        
        item.addEventListener('drop', (e) => {
            if (this.selectionMode || this.draggedItem === null) return;
            e.preventDefault();
            
            item.classList.remove('drop-before', 'drop-after');
            
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const dropIndex = e.clientY < midpoint ? actualIndex : actualIndex + 1;
            
            if (this.onReorder && this.draggedItem !== actualIndex) {
                this.onReorder(this.draggedItem, dropIndex);
            }
        });
    }
    
    /**
     * Show context menu
     */
    showContextMenu(event, index) {
        // Remove existing menu
        const existing = document.querySelector('.playlist-context-menu');
        if (existing) existing.remove();
        
        const menu = document.createElement('div');
        menu.className = 'playlist-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        
        const track = this.playlist[index];
        
        menu.innerHTML = `
            <button data-action="play">▶️ Play Now</button>
            <button data-action="playNext">⏭️ Play Next</button>
            <button data-action="edit">✏️ Edit Metadata</button>
            <button data-action="info">ℹ️ Track Info</button>
            ${track.analysis ? '<button data-action="analysis">📊 View Analysis</button>' : ''}
            <button data-action="similar">🔍 Find Similar Tracks</button>
            <button data-action="remove">🗑️ Remove from Playlist</button>
        `;
        
        document.body.appendChild(menu);
        
        // Position adjustment
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${event.clientX - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${event.clientY - rect.height}px`;
        }
        
        // Handle clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            menu.remove();
            
            switch(action) {
                case 'play':
                    if (this.onTrackClick) this.onTrackClick(index);
                    break;
                case 'playNext':
                    if (this.onPlayNext) this.onPlayNext(index);
                    break;
                case 'similar':
                    if (this.onFindSimilar) this.onFindSimilar(index);
                    break;
                case 'edit':
                    if (this.onEditClick) this.onEditClick(index);
                    break;
                case 'info':
                    this.showTrackInfo(track);
                    break;
                case 'analysis':
                    this.showAnalysisInfo(track);
                    break;
                case 'remove':
                    if (confirm(`Remove "${track.metadata?.title || track.fileName}" from playlist?`)) {
                        if (this.onBatchDelete) this.onBatchDelete([index]);
                    }
                    break;
            }
        });
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 0);
    }
    
    /**
     * Toggle selection mode
     */
    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        this.selectedTracks.clear();
        
        if (this.selectionMode) {
            this.selectModeBtn.classList.add('active');
            this.showSelectionToolbar();
        } else {
            this.selectModeBtn.classList.remove('active');
            this.hideSelectionToolbar();
        }
        
        this.render();
    }
    
    /**
     * Toggle selection of a track
     */
    toggleSelection(index) {
        if (this.selectedTracks.has(index)) {
            this.selectedTracks.delete(index);
        } else {
            this.selectedTracks.add(index);
        }
        this.updateSelectionToolbar();
    }
    
    /**
     * Show selection toolbar
     */
    showSelectionToolbar() {
        let toolbar = document.querySelector('.playlist-selection-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'playlist-selection-toolbar';
            toolbar.innerHTML = `
                <span class="selection-count">0 selected</span>
                <button id="select-all-btn">Select All</button>
                <button id="deselect-all-btn">Deselect All</button>
                <button id="delete-selected-btn">🗑️ Delete Selected</button>
            `;
            this.container.insertBefore(toolbar, this.playlistItems.parentNode);
            
            // Event listeners
            document.getElementById('select-all-btn').onclick = () => this.selectAll();
            document.getElementById('deselect-all-btn').onclick = () => this.deselectAll();
            document.getElementById('delete-selected-btn').onclick = () => this.deleteSelected();
        }
    }
    
    /**
     * Hide selection toolbar
     */
    hideSelectionToolbar() {
        const toolbar = document.querySelector('.playlist-selection-toolbar');
        if (toolbar) toolbar.remove();
    }
    
    /**
     * Update selection toolbar
     */
    updateSelectionToolbar() {
        const countSpan = document.querySelector('.selection-count');
        if (countSpan) {
            countSpan.textContent = `${this.selectedTracks.size} selected`;
        }
    }
    
    /**
     * Select all tracks
     */
    selectAll() {
        this.selectedTracks.clear();
        this.filteredPlaylist.forEach((track) => {
            const index = this.playlist.indexOf(track);
            this.selectedTracks.add(index);
        });
        this.render();
    }
    
    /**
     * Deselect all tracks
     */
    deselectAll() {
        this.selectedTracks.clear();
        this.render();
    }
    
    /**
     * Delete selected tracks
     */
    deleteSelected() {
        if (this.selectedTracks.size === 0) return;
        
        if (confirm(`Delete ${this.selectedTracks.size} tracks from playlist?`)) {
            if (this.onBatchDelete) {
                this.onBatchDelete(Array.from(this.selectedTracks));
            }
            this.selectedTracks.clear();
            this.toggleSelectionMode();
        }
    }
    
    /**
     * Show track info modal
     */
    showTrackInfo(track) {
        const info = `
📀 Track Information

Title: ${track.metadata?.title || track.fileName}
Artist: ${track.metadata?.artist || 'Unknown'}
Album: ${track.metadata?.album || 'Unknown'}
Duration: ${track.duration ? this.formatTime(track.duration) : 'Unknown'}
File: ${track.fileName}

${track.vtt ? '✓ Has Lyrics' : '✗ No Lyrics'}
${track.metadata?.hasMetadata ? '✓ Has Metadata' : '✗ No Metadata'}
${track.analysis ? '✓ Has Analysis' : '✗ No Analysis'}
        `.trim();
        
        alert(info);
    }
    
    /**
     * Show analysis info modal
     */
    showAnalysisInfo(track) {
        if (!track.analysis) return;
        
        const a = track.analysis;
        const info = `
📊 Music Analysis

BPM: ${a.bpm || 'N/A'}
Energy: ${a.energy ? (a.energy * 100).toFixed(0) + '%' : 'N/A'}
Mood: ${a.mood || 'N/A'}
Key: ${a.key || 'N/A'}
Danceability: ${a.danceability ? (a.danceability * 100).toFixed(0) + '%' : 'N/A'}
        `.trim();
        
        alert(info);
    }
    
    /**
     * Show statistics modal
     */
    showStatistics() {
        const stats = this.calculateStatistics();
        
        const info = `
📊 Playlist Statistics

Total Tracks: ${stats.total}
Total Duration: ${this.formatTime(stats.totalDuration)}
Average Duration: ${this.formatTime(stats.avgDuration)}

With Lyrics: ${stats.withLyrics}
With Metadata: ${stats.withMetadata}
With Analysis: ${stats.withAnalysis}

${stats.avgBPM ? `Average BPM: ${stats.avgBPM}` : ''}
${stats.avgEnergy ? `Average Energy: ${(stats.avgEnergy * 100).toFixed(0)}%` : ''}

Moods:
${Object.entries(stats.moods).map(([mood, count]) => `  ${mood}: ${count}`).join('\n')}
        `.trim();
        
        alert(info);
    }
    
    /**
     * Calculate playlist statistics
     */
    calculateStatistics() {
        const stats = {
            total: this.playlist.length,
            totalDuration: 0,
            avgDuration: 0,
            withLyrics: 0,
            withMetadata: 0,
            withAnalysis: 0,
            avgBPM: 0,
            avgEnergy: 0,
            moods: {}
        };
        
        let bpmSum = 0, bpmCount = 0;
        let energySum = 0, energyCount = 0;
        
        this.playlist.forEach(track => {
            if (track.duration) stats.totalDuration += track.duration;
            if (track.vtt) stats.withLyrics++;
            if (track.metadata?.hasMetadata) stats.withMetadata++;
            if (track.analysis || track.hasDeepAnalysis) stats.withAnalysis++;
            
            if (track.analysis) {
                if (track.analysis.bpm) {
                    bpmSum += track.analysis.bpm;
                    bpmCount++;
                }
                if (track.analysis.energy) {
                    energySum += track.analysis.energy;
                    energyCount++;
                }
                if (track.analysis.mood) {
                    const mood = track.analysis.mood;
                    stats.moods[mood] = (stats.moods[mood] || 0) + 1;
                }
            }
        });
        
        stats.avgDuration = stats.total > 0 ? stats.totalDuration / stats.total : 0;
        stats.avgBPM = bpmCount > 0 ? Math.round(bpmSum / bpmCount) : null;
        stats.avgEnergy = energyCount > 0 ? energySum / energyCount : null;
        
        return stats;
    }
    
    /**
     * Update highlight when track changes
     */
    updateHighlight(newIndex) {
        this.currentTrackIndex = newIndex;
        
        const items = this.playlistItems.querySelectorAll('.playlist-item');
        items.forEach((item, displayIndex) => {
            const actualIndex = parseInt(item.dataset.index);
            const track = this.filteredPlaylist[displayIndex];
            const trackActualIndex = this.playlist.indexOf(track);
            
            if (trackActualIndex === newIndex) {
                item.classList.add('playing');
                // Scroll only within the playlist container, not the entire page
                this._scrollToItemInContainer(item);
            } else {
                item.classList.remove('playing');
            }
        });
    }
    
    /**
     * Scroll to item within the playlist container only
     */
    _scrollToItemInContainer(item) {
        const container = document.getElementById('playlist-container');
        if (!container) return;
        
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        
        // Check if item is already visible in the container
        const isVisible = (
            itemRect.top >= containerRect.top &&
            itemRect.bottom <= containerRect.bottom
        );
        
        if (!isVisible) {
            // Calculate scroll position to center the item in the container
            const containerScrollTop = container.scrollTop;
            const itemOffsetTop = item.offsetTop;
            const containerHeight = container.clientHeight;
            const itemHeight = item.clientHeight;
            
            const scrollTo = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);
            
            container.scrollTo({
                top: scrollTo,
                behavior: 'smooth'
            });
        }
    }
    
    /**
     * Jump to currently playing track
     */
    jumpToCurrent() {
        if (this.currentTrackIndex === -1) return;
        
        const currentItem = this.playlistItems.querySelector('.playlist-item.playing');
        if (currentItem) {
            this._scrollToItemInContainer(currentItem);
        } else {
            // If not visible due to filtering, reset filters
            this.searchQuery = '';
            this.filterMood = 'all';
            if (this.searchInput) this.searchInput.value = '';
            if (this.filterDropdown) this.filterDropdown.value = 'all';
            this.applyFiltersAndSort();
            
            setTimeout(() => {
                const item = this.playlistItems.querySelector('.playlist-item.playing');
                if (item) this._scrollToItemInContainer(item);
            }, 100);
        }
    }
    
    /**
     * Render empty state
     */
    renderEmptyState() {
        const message = this.searchQuery || this.filterMood !== 'all' 
            ? 'No tracks match your search/filter'
            : 'No tracks loaded yet';
        
        this.playlistItems.innerHTML = `<div class="empty-playlist">${message}</div>`;
        
        if (this.clearButton) {
            this.clearButton.disabled = this.playlist.length === 0;
        }
    }
    
    /**
     * Update UI elements
     */
    updateUI() {
        this.updateCount();
        
        if (this.searchInput) {
            this.searchInput.style.display = this.playlist.length >= 5 ? 'block' : 'none';
        }
        
        if (this.clearButton) {
            this.clearButton.disabled = this.playlist.length === 0;
        }
        
        if (this.jumpToCurrentBtn) {
            this.jumpToCurrentBtn.disabled = this.currentTrackIndex === -1;
        }
    }
    
    /**
     * Update track count display
     */
    updateCount() {
        if (this.countDisplay) {
            const showing = this.filteredPlaylist.length;
            const total = this.playlist.length;
            
            if (showing < total) {
                this.countDisplay.textContent = `${showing} of ${total} tracks`;
            } else {
                this.countDisplay.textContent = `${total} track${total !== 1 ? 's' : ''}`;
            }
        }
    }
    
    /**
     * Helper: Format time
     */
    formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${min}:${sec}`;
    }
    
    /**
     * Helper: Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Save preferences to storage
     */
    savePreferences() {
        try {
            localStorage.setItem('playlistRenderer_sortBy', this.sortBy);
            localStorage.setItem('playlistRenderer_sortOrder', this.sortOrder);
        } catch (e) {
            this.debugLog('Failed to save preferences', 'warning');
        }
    }
    
    /**
     * Load preferences from storage
     */
    loadPreferences() {
        try {
            this.sortBy = localStorage.getItem('playlistRenderer_sortBy') || 'default';
            this.sortOrder = localStorage.getItem('playlistRenderer_sortOrder') || 'asc';
        } catch (e) {
            this.sortBy = 'default';
            this.sortOrder = 'asc';
        }
    }

    /**
 * Update jump to current button state
 */
updateJumpButton() {
    if (this.jumpToCurrentBtn) {
        this.jumpToCurrentBtn.disabled = this.currentTrackIndex === -1;
    }
}
    
    /**
     * Clean up
     */
    destroy() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        this.itemCache.clear();
        clearTimeout(this.renderThrottle);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedPlaylistRenderer;
}