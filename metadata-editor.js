/* ============================================
   Metadata Editor - Edit and save custom metadata
   ============================================ */

class MetadataEditor {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.modal = null;
        this.currentTrackIndex = -1;
        this.onSaveCallback = null;
    }
    
    /**
     * Open the metadata editor for a specific track
     */
    openEditor(trackIndex, currentMetadata, onSave) {
        this.currentTrackIndex = trackIndex;
        this.onSaveCallback = onSave;
        
        if (this.modal) {
            this.modal.remove();
        }
        
        this.modal = document.createElement('div');
        this.modal.id = 'metadata-editor-modal';
        this.modal.innerHTML = `
            <div class="metadata-editor-overlay"></div>
            <div class="metadata-editor-content">
                <div class="metadata-editor-header">
                    <h2>✏️ Edit Track Metadata</h2>
                    <button class="metadata-editor-close">✕</button>
                </div>
                
                <div class="metadata-editor-body">
                    <div class="metadata-editor-preview">
                        <div class="metadata-preview-art">
                            ${currentMetadata.image 
                                ? `<img src="${currentMetadata.image}" alt="Cover Art">` 
                                : '<div class="metadata-preview-placeholder">🎵</div>'}
                        </div>
                        <div class="metadata-preview-info">
                            <div class="metadata-preview-label">Current Metadata</div>
                            <div class="metadata-preview-value">${currentMetadata.title || 'Unknown'}</div>
                        </div>
                    </div>
                    
                    <form id="metadata-editor-form">
                        <div class="metadata-form-group">
                            <label for="metadata-title">Track Title *</label>
                            <input 
                                type="text" 
                                id="metadata-title" 
                                name="title"
                                value="${this.escapeHtml(currentMetadata.title || '')}"
                                placeholder="Enter track title"
                                required
                            >
                        </div>
                        
                        <div class="metadata-form-group">
                            <label for="metadata-artist">Artist *</label>
                            <input 
                                type="text" 
                                id="metadata-artist" 
                                name="artist"
                                value="${this.escapeHtml(currentMetadata.artist || '')}"
                                placeholder="Enter artist name"
                                required
                            >
                        </div>
                        
                        <div class="metadata-form-group">
                            <label for="metadata-album">Album</label>
                            <input 
                                type="text" 
                                id="metadata-album" 
                                name="album"
                                value="${this.escapeHtml(currentMetadata.album || '')}"
                                placeholder="Enter album name"
                            >
                        </div>
                        
                        <div class="metadata-form-row">
                            <div class="metadata-form-group">
                                <label for="metadata-year">Year</label>
                                <input 
                                    type="number" 
                                    id="metadata-year" 
                                    name="year"
                                    value="${currentMetadata.year || ''}"
                                    placeholder="YYYY"
                                    min="1900"
                                    max="2100"
                                >
                            </div>
                            
                            <div class="metadata-form-group">
                                <label for="metadata-track">Track #</label>
                                <input 
                                    type="number" 
                                    id="metadata-track" 
                                    name="track"
                                    value="${currentMetadata.track || ''}"
                                    placeholder="#"
                                    min="1"
                                >
                            </div>
                        </div>
                        
                        <div class="metadata-form-group">
                            <label for="metadata-genre">Genre</label>
                            <input 
                                type="text" 
                                id="metadata-genre" 
                                name="genre"
                                value="${this.escapeHtml(currentMetadata.genre || '')}"
                                placeholder="Enter genre"
                                list="genre-suggestions"
                            >
                            <datalist id="genre-suggestions">
                                <option value="Rock">
                                <option value="Pop">
                                <option value="Hip Hop">
                                <option value="Electronic">
                                <option value="Jazz">
                                <option value="Classical">
                                <option value="Country">
                                <option value="R&B">
                                <option value="Metal">
                                <option value="Folk">
                            </datalist>
                        </div>
                        
                        <div class="metadata-form-group">
                            <label for="metadata-composer">Composer</label>
                            <input 
                                type="text" 
                                id="metadata-composer" 
                                name="composer"
                                value="${this.escapeHtml(currentMetadata.composer || '')}"
                                placeholder="Enter composer name"
                            >
                        </div>
                        
                        <div class="metadata-form-group">
                            <label for="metadata-comment">Comment / Notes</label>
                            <textarea 
                                id="metadata-comment" 
                                name="comment"
                                rows="3"
                                placeholder="Add any additional notes..."
                            >${this.escapeHtml(currentMetadata.comment || '')}</textarea>
                        </div>
                        
                        <div class="metadata-form-actions">
                            <button type="button" class="btn-secondary" id="metadata-reset-btn">
                                🔄 Reset to Original
                            </button>
                            <button type="submit" class="btn-primary">
                                💾 Save Changes
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        this.attachEventListeners(currentMetadata);
        
        // Show modal with animation
        requestAnimationFrame(() => {
            this.modal.classList.add('show');
        });
        
        // Focus first input
        setTimeout(() => {
            document.getElementById('metadata-title')?.focus();
        }, 300);
    }
    
    attachEventListeners(originalMetadata) {
        // Close button
        this.modal.querySelector('.metadata-editor-close').onclick = () => {
            this.closeEditor();
        };
        
        // Overlay click
        this.modal.querySelector('.metadata-editor-overlay').onclick = () => {
            this.closeEditor();
        };
        
        // Reset button
        document.getElementById('metadata-reset-btn').onclick = () => {
            if (confirm('Reset all fields to original metadata?')) {
                document.getElementById('metadata-title').value = originalMetadata.title || '';
                document.getElementById('metadata-artist').value = originalMetadata.artist || '';
                document.getElementById('metadata-album').value = originalMetadata.album || '';
                document.getElementById('metadata-year').value = originalMetadata.year || '';
                document.getElementById('metadata-track').value = originalMetadata.track || '';
                document.getElementById('metadata-genre').value = originalMetadata.genre || '';
                document.getElementById('metadata-composer').value = originalMetadata.composer || '';
                document.getElementById('metadata-comment').value = originalMetadata.comment || '';
            }
        };
        
        // Form submission
        document.getElementById('metadata-editor-form').onsubmit = (e) => {
            e.preventDefault();
            this.saveMetadata();
        };
        
        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeEditor();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    saveMetadata() {
        const formData = new FormData(document.getElementById('metadata-editor-form'));
        
        const newMetadata = {
            title: formData.get('title').trim(),
            artist: formData.get('artist').trim(),
            album: formData.get('album').trim(),
            year: formData.get('year') ? parseInt(formData.get('year')) : null,
            track: formData.get('track') ? parseInt(formData.get('track')) : null,
            genre: formData.get('genre').trim(),
            composer: formData.get('composer').trim(),
            comment: formData.get('comment').trim(),
            isCustom: true, // Flag to indicate user-edited metadata
            editedAt: Date.now()
        };
        
        // Validate required fields
        if (!newMetadata.title || !newMetadata.artist) {
            alert('Title and Artist are required fields!');
            return;
        }
        
        // Call the save callback
        if (this.onSaveCallback) {
            this.onSaveCallback(this.currentTrackIndex, newMetadata);
        }
        
        this.debugLog(`Metadata saved for track ${this.currentTrackIndex + 1}`, 'success');
        this.closeEditor();
    }
    
    closeEditor() {
        if (this.modal) {
            this.modal.classList.remove('show');
            setTimeout(() => {
                if (this.modal && this.modal.parentNode) {
                    this.modal.remove();
                }
                this.modal = null;
            }, 300);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use
window.MetadataEditor = MetadataEditor;