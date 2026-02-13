/* ============================================
   Enhanced Custom Metadata Storage System
   Advanced metadata management with export, search, and validation
   ============================================ */

class CustomMetadataStore {
    constructor() {
        this.storageKey = 'customMetadata';
        this.versionKey = 'customMetadataVersion';
        this.currentVersion = '2.0';
        this.store = {};
        this.stats = {
            totalEdits: 0,
            lastEdit: null,
            editHistory: []
        };
        
        this.init();
    }
    
    /**
     * Initialize store with migration support
     */
    init() {
        this.migrate();
        this.store = this.load();
        this.loadStats();
        this.cleanupOrphaned();
    }
    
    /**
     * Migrate from old versions
     */
    migrate() {
        const savedVersion = localStorage.getItem(this.versionKey);
        
        if (!savedVersion) {
            // First time or v1.0 - just mark as current version
            localStorage.setItem(this.versionKey, this.currentVersion);
            console.log('✅ Metadata store initialized (v' + this.currentVersion + ')');
        } else if (savedVersion !== this.currentVersion) {
            console.log(`🔄 Migrating metadata from v${savedVersion} to v${this.currentVersion}`);
            // Add migration logic here if data structure changes
            localStorage.setItem(this.versionKey, this.currentVersion);
        }
    }
    
    /**
     * Generate a more robust unique key
     * @param {string} fileName - Name of the audio file
     * @param {number} fileSize - Size of the file (or duration)
     * @param {string} [extraData] - Optional extra data for uniqueness
     * @returns {string} Unique key
     */
    generateKey(fileName, fileSize, extraData = '') {
        const normalizedName = fileName.toLowerCase().trim();
        const baseKey = `${normalizedName}_${fileSize}`;
        
        if (extraData) {
            return `${baseKey}_${extraData}`;
        }
        
        return baseKey;
    }
    
    /**
     * Validate metadata before saving
     * @param {Object} metadata - Metadata to validate
     * @returns {Object} Validation result
     */
    validateMetadata(metadata) {
        const errors = [];
        const warnings = [];
        
        // Check required fields
        if (!metadata.title || metadata.title.trim() === '') {
            errors.push('Title is required');
        }
        
        // Check field lengths
        if (metadata.title && metadata.title.length > 200) {
            warnings.push('Title is very long (>200 chars)');
        }
        
        if (metadata.artist && metadata.artist.length > 200) {
            warnings.push('Artist name is very long (>200 chars)');
        }
        
        if (metadata.album && metadata.album.length > 200) {
            warnings.push('Album name is very long (>200 chars)');
        }
        
        // Check image size if present
        if (metadata.image && metadata.image.startsWith('data:')) {
            const sizeInBytes = Math.round((metadata.image.length * 3) / 4);
            if (sizeInBytes > 1024 * 1024) { // 1MB
                warnings.push('Album art is very large (>1MB), consider using a smaller image');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Save custom metadata with validation and history
     * @param {string} fileName - Name of the audio file
     * @param {number} fileSize - Size of the file
     * @param {Object} metadata - Metadata object to save
     * @param {Object} options - Save options
     * @returns {Object} Save result
     */
    save(fileName, fileSize, metadata, options = {}) {
        const {
            skipValidation = false,
            optimizeImage = true
        } = options;
        
        // Validate
        if (!skipValidation) {
            const validation = this.validateMetadata(metadata);
            if (!validation.valid) {
                console.error('❌ Metadata validation failed:', validation.errors);
                return {
                    success: false,
                    errors: validation.errors,
                    warnings: validation.warnings
                };
            }
            
            if (validation.warnings.length > 0) {
                console.warn('⚠️ Metadata warnings:', validation.warnings);
            }
        }
        
        // Optimize image if requested
        let processedMetadata = { ...metadata };
        if (optimizeImage && metadata.image) {
            processedMetadata.image = this.optimizeImage(metadata.image);
        }
        
        const key = this.generateKey(fileName, fileSize);
        const now = Date.now();
        
        // Store previous version for history
        const previousVersion = this.store[key];
        
        this.store[key] = {
            ...processedMetadata,
            fileName,
            fileSize,
            savedAt: now,
            editedAt: now,
            editCount: (previousVersion?.editCount || 0) + 1,
            version: this.currentVersion
        };
        
        // Update stats
        this.stats.totalEdits++;
        this.stats.lastEdit = now;
        this.stats.editHistory.push({
            fileName,
            timestamp: now,
            action: previousVersion ? 'updated' : 'created'
        });
        
        // Keep only last 100 history entries
        if (this.stats.editHistory.length > 100) {
            this.stats.editHistory = this.stats.editHistory.slice(-100);
        }
        
        this.persist();
        this.saveStats();
        
        console.log(`✅ Metadata saved for: ${fileName} (Edit #${this.store[key].editCount})`);
        
        return {
            success: true,
            errors: [],
            warnings: []
        };
    }
    
    /**
     * Optimize image data (reduce size if needed)
     * @param {string} imageData - Base64 image data
     * @returns {string} Optimized image data
     */
    optimizeImage(imageData) {
        // If it's a blob URL, return as-is
        if (imageData.startsWith('blob:')) {
            return imageData;
        }
        
        // If it's already reasonably sized, return as-is
        if (!imageData.startsWith('data:')) {
            return imageData;
        }
        
        const sizeInBytes = Math.round((imageData.length * 3) / 4);
        
        // If under 500KB, no need to optimize
        if (sizeInBytes < 512 * 1024) {
            return imageData;
        }
        
        console.log(`🖼️ Image is ${Math.round(sizeInBytes / 1024)}KB, optimization recommended`);
        // TODO: Could implement actual image resizing here if needed
        // For now, just warn and return original
        return imageData;
    }
    
    /**
     * Get custom metadata for a file
     * @param {string} fileName - Name of the audio file
     * @param {number} fileSize - Size of the file
     * @returns {Object|null} Metadata object or null
     */
    get(fileName, fileSize) {
        const key = this.generateKey(fileName, fileSize);
        const metadata = this.store[key];
        
        if (metadata) {
            // Return a copy without internal fields
            const { savedAt, editedAt, editCount, version, ...publicMetadata } = metadata;
            return {
                ...publicMetadata,
                _meta: {
                    savedAt,
                    editedAt,
                    editCount,
                    version
                }
            };
        }
        
        return null;
    }
    
    /**
     * Check if file has custom metadata
     * @param {string} fileName - Name of the audio file
     * @param {number} fileSize - Size of the file
     * @returns {boolean} True if metadata exists
     */
    has(fileName, fileSize) {
        const key = this.generateKey(fileName, fileSize);
        return key in this.store;
    }
    
    /**
     * Delete custom metadata for a file
     * @param {string} fileName - Name of the audio file
     * @param {number} fileSize - Size of the file
     */
    delete(fileName, fileSize) {
        const key = this.generateKey(fileName, fileSize);
        
        if (this.store[key]) {
            delete this.store[key];
            this.persist();
            console.log(`🗑️ Deleted metadata for: ${fileName}`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Search metadata by query
     * @param {string} query - Search query
     * @returns {Array} Array of matching metadata objects
     */
    search(query) {
        const lowerQuery = query.toLowerCase().trim();
        const results = [];
        
        if (!lowerQuery) {
            return results;
        }
        
        for (const [key, metadata] of Object.entries(this.store)) {
            const searchableText = [
                metadata.title,
                metadata.artist,
                metadata.album,
                metadata.fileName
            ].filter(Boolean).join(' ').toLowerCase();
            
            if (searchableText.includes(lowerQuery)) {
                results.push(this.get(metadata.fileName, metadata.fileSize));
            }
        }
        
        return results;
    }
    
    /**
     * Get metadata by artist
     * @param {string} artist - Artist name
     * @returns {Array} Array of metadata for this artist
     */
    getByArtist(artist) {
        const lowerArtist = artist.toLowerCase().trim();
        const results = [];
        
        for (const metadata of Object.values(this.store)) {
            if (metadata.artist && metadata.artist.toLowerCase() === lowerArtist) {
                results.push(this.get(metadata.fileName, metadata.fileSize));
            }
        }
        
        return results;
    }
    
    /**
     * Get metadata by album
     * @param {string} album - Album name
     * @returns {Array} Array of metadata for this album
     */
    getByAlbum(album) {
        const lowerAlbum = album.toLowerCase().trim();
        const results = [];
        
        for (const metadata of Object.values(this.store)) {
            if (metadata.album && metadata.album.toLowerCase() === lowerAlbum) {
                results.push(this.get(metadata.fileName, metadata.fileSize));
            }
        }
        
        return results;
    }
    
    /**
     * Get all unique artists
     * @returns {Array} Array of artist names
     */
    getAllArtists() {
        const artists = new Set();
        
        for (const metadata of Object.values(this.store)) {
            if (metadata.artist) {
                artists.add(metadata.artist);
            }
        }
        
        return Array.from(artists).sort();
    }
    
    /**
     * Get all unique albums
     * @returns {Array} Array of album names
     */
    getAllAlbums() {
        const albums = new Set();
        
        for (const metadata of Object.values(this.store)) {
            if (metadata.album) {
                albums.add(metadata.album);
            }
        }
        
        return Array.from(albums).sort();
    }
    
    /**
     * Batch save metadata for multiple files
     * @param {Array} entries - Array of {fileName, fileSize, metadata}
     * @returns {Object} Batch save results
     */
    batchSave(entries) {
        const results = {
            success: [],
            failed: [],
            total: entries.length
        };
        
        for (const entry of entries) {
            const result = this.save(
                entry.fileName,
                entry.fileSize,
                entry.metadata,
                entry.options || {}
            );
            
            if (result.success) {
                results.success.push(entry.fileName);
            } else {
                results.failed.push({
                    fileName: entry.fileName,
                    errors: result.errors
                });
            }
        }
        
        console.log(`📦 Batch save: ${results.success.length}/${results.total} succeeded`);
        return results;
    }
    
    /**
     * Export all metadata as JSON
     * @returns {string} JSON string of all metadata
     */
    export() {
        const exportData = {
            version: this.currentVersion,
            exportedAt: Date.now(),
            metadata: this.store,
            stats: this.stats
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    /**
     * Export as downloadable file
     */
    exportToFile() {
        const json = this.export();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().split('T')[0];
        
        a.href = url;
        a.download = `music-metadata-backup-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ Metadata exported to file');
    }
    
    /**
     * Import metadata from JSON
     * @param {string} jsonString - JSON string to import
     * @param {Object} options - Import options
     * @returns {Object} Import result
     */
    import(jsonString, options = {}) {
        const {
            merge = true,
            overwrite = false
        } = options;
        
        try {
            const importData = JSON.parse(jsonString);
            
            if (!importData.metadata) {
                throw new Error('Invalid metadata format');
            }
            
            let imported = 0;
            let skipped = 0;
            let overwritten = 0;
            
            for (const [key, metadata] of Object.entries(importData.metadata)) {
                const exists = key in this.store;
                
                if (exists && !overwrite && merge) {
                    skipped++;
                    continue;
                }
                
                if (exists && overwrite) {
                    overwritten++;
                }
                
                this.store[key] = metadata;
                imported++;
            }
            
            // Optionally merge stats
            if (importData.stats && merge) {
                this.stats.totalEdits += importData.stats.totalEdits || 0;
                if (importData.stats.editHistory) {
                    this.stats.editHistory.push(...importData.stats.editHistory);
                    this.stats.editHistory = this.stats.editHistory.slice(-100);
                }
            }
            
            this.persist();
            this.saveStats();
            
            console.log(`✅ Import complete: ${imported} imported, ${skipped} skipped, ${overwritten} overwritten`);
            
            return {
                success: true,
                imported,
                skipped,
                overwritten
            };
            
        } catch (err) {
            console.error('❌ Import failed:', err);
            return {
                success: false,
                error: err.message
            };
        }
    }
    
    /**
     * Import from file upload
     * @param {File} file - File to import
     * @returns {Promise<Object>} Import result
     */
    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const result = this.import(e.target.result, { merge: true });
                resolve(result);
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }
    
    /**
     * Get statistics about stored metadata
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const trackCount = Object.keys(this.store).length;
        const artistCount = this.getAllArtists().length;
        const albumCount = this.getAllAlbums().length;
        
        let totalSize = 0;
        let withImages = 0;
        let mostEdited = null;
        let maxEdits = 0;
        
        for (const metadata of Object.values(this.store)) {
            // Estimate size
            totalSize += JSON.stringify(metadata).length;
            
            if (metadata.image) {
                withImages++;
            }
            
            if (metadata.editCount > maxEdits) {
                maxEdits = metadata.editCount;
                mostEdited = metadata.fileName;
            }
        }
        
        const sizeInKB = Math.round(totalSize / 1024);
        
        return {
            tracks: trackCount,
            artists: artistCount,
            albums: albumCount,
            withImages,
            sizeKB: sizeInKB,
            totalEdits: this.stats.totalEdits,
            lastEdit: this.stats.lastEdit ? new Date(this.stats.lastEdit).toLocaleString() : 'Never',
            mostEdited: mostEdited ? { fileName: mostEdited, edits: maxEdits } : null
        };
    }
    
    /**
     * Clean up orphaned entries (optional, for maintenance)
     * @param {Array} currentPlaylist - Current playlist to check against
     * @returns {number} Number of entries cleaned
     */
    cleanupOrphaned(currentPlaylist = null) {
        if (!currentPlaylist) {
            // Can't clean without knowing what's current
            return 0;
        }
        
        const currentKeys = new Set(
            currentPlaylist.map(track => 
                this.generateKey(track.fileName, track.duration || track.fileSize || 0)
            )
        );
        
        let cleaned = 0;
        
        for (const key of Object.keys(this.store)) {
            if (!currentKeys.has(key)) {
                delete this.store[key];
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this.persist();
            console.log(`🧹 Cleaned up ${cleaned} orphaned metadata entries`);
        }
        
        return cleaned;
    }
    
    /**
     * Load from localStorage
     * @returns {Object} Stored metadata object
     */
    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            return saved ? JSON.parse(saved) : {};
        } catch (err) {
            console.error('❌ Failed to load metadata:', err);
            // Try to recover
            this.attemptRecovery();
            return {};
        }
    }
    
    /**
     * Persist to localStorage with error handling
     */
    persist() {
        try {
            const json = JSON.stringify(this.store);
            localStorage.setItem(this.storageKey, json);
        } catch (err) {
            if (err.name === 'QuotaExceededError') {
                console.error('❌ Storage quota exceeded! Consider cleaning up old metadata.');
                alert('Storage is full! Please export your metadata and clean up old entries.');
            } else {
                console.error('❌ Failed to save metadata:', err);
            }
        }
    }
    
    /**
     * Load statistics
     */
    loadStats() {
        try {
            const saved = localStorage.getItem(this.storageKey + '_stats');
            if (saved) {
                this.stats = JSON.parse(saved);
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }
    
    /**
     * Save statistics
     */
    saveStats() {
        try {
            localStorage.setItem(this.storageKey + '_stats', JSON.stringify(this.stats));
        } catch (err) {
            console.error('Failed to save stats:', err);
        }
    }
    
    /**
     * Attempt to recover corrupted data
     */
    attemptRecovery() {
        console.warn('⚠️ Attempting to recover metadata...');
        
        try {
            // Try to parse what we can
            const saved = localStorage.getItem(this.storageKey);
            if (!saved) return;
            
            // If it's completely invalid JSON, we can't recover
            // Create a backup
            localStorage.setItem(this.storageKey + '_backup', saved);
            console.log('📦 Backup created');
            
        } catch (err) {
            console.error('❌ Recovery failed:', err);
        }
    }
    
    /**
     * Get all stored metadata (for debugging/export)
     * @returns {Object} Copy of all stored metadata
     */
    getAll() {
        return Object.entries(this.store).map(([key, metadata]) => ({
            key,
            ...metadata
        }));
    }
    
    /**
     * Clear all custom metadata with confirmation
     * @param {boolean} confirmed - Must be true to actually clear
     * @returns {boolean} Success status
     */
    clearAll(confirmed = false) {
        if (!confirmed) {
            console.warn('⚠️ clearAll() requires confirmed=true parameter');
            return false;
        }
        
        // Create a backup before clearing
        const backup = this.export();
        localStorage.setItem(this.storageKey + '_lastBackup', backup);
        
        this.store = {};
        this.stats = {
            totalEdits: 0,
            lastEdit: null,
            editHistory: []
        };
        
        this.persist();
        this.saveStats();
        
        console.log('🗑️ All custom metadata cleared (backup saved)');
        return true;
    }
    
    /**
     * Restore from last backup
     * @returns {boolean} Success status
     */
    restoreFromBackup() {
        try {
            const backup = localStorage.getItem(this.storageKey + '_lastBackup');
            if (!backup) {
                console.warn('⚠️ No backup found');
                return false;
            }
            
            const result = this.import(backup, { merge: false, overwrite: true });
            
            if (result.success) {
                console.log('✅ Restored from backup');
                return true;
            }
            
            return false;
            
        } catch (err) {
            console.error('❌ Restore failed:', err);
            return false;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomMetadataStore;
}