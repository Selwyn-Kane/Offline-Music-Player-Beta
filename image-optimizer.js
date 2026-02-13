/* ============================================
   IMAGE OPTIMIZER MODULE
   Resize and compress images for optimal performance
   ============================================ */

class ImageOptimizer {
    constructor(debugLog = console.log) {
        this.debugLog = debugLog;
        
        // Configuration
        this.config = {
            thumbnailSize: 80,      // Max dimension for playlist thumbnails
            coverSize: 400,         // Max dimension for full cover art
            quality: 0.85,          // JPEG quality (0-1)
            format: 'image/jpeg',   // Output format
            cacheEnabled: true      // Enable IndexedDB caching
        };
        
        // Cache
        this.memoryCache = new Map();
        this.dbName = 'ImageOptimizerCache';
        this.dbVersion = 1;
        this.db = null;
        
        // Statistics
        this.stats = {
            processed: 0,
            cacheHits: 0,
            cacheMisses: 0,
            bytesReduced: 0
        };
        
        this.initDatabase();
    }
    
    // ========== DATABASE INITIALIZATION ==========
    
    async initDatabase() {
        if (!this.config.cacheEnabled) return;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                this.debugLog('❌ Failed to open IndexedDB', 'error');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.debugLog('✅ Image optimizer database ready', 'success');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for optimized images
                if (!db.objectStoreNames.contains('optimizedImages')) {
                    const store = db.createObjectStore('optimizedImages', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }
    
    // ========== IMAGE OPTIMIZATION ==========
    
    /**
     * Optimize an image for display
     * @param {string} imageUrl - Source image URL or data URL
     * @param {string} size - 'thumbnail' or 'cover'
     * @returns {Promise<string>} Optimized image data URL
     */
    async optimizeImage(imageUrl, size = 'thumbnail') {
        const cacheKey = `${imageUrl}_${size}`;
        
        // Check memory cache first
        if (this.memoryCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.memoryCache.get(cacheKey);
        }
        
        // Check IndexedDB cache
        if (this.config.cacheEnabled && this.db) {
            const cached = await this.getCachedImage(cacheKey);
            if (cached) {
                this.stats.cacheHits++;
                this.memoryCache.set(cacheKey, cached);
                return cached;
            }
        }
        
        this.stats.cacheMisses++;
        
        try {
            // Load and optimize image
            const optimized = await this.processImage(imageUrl, size);
            
            // Cache the result
            this.memoryCache.set(cacheKey, optimized);
            
            if (this.config.cacheEnabled && this.db) {
                await this.cacheImage(cacheKey, optimized);
            }
            
            this.stats.processed++;
            
            return optimized;
            
        } catch (error) {
            this.debugLog(`❌ Failed to optimize image: ${error.message}`, 'error');
            // Return original on error
            return imageUrl;
        }
    }
    
    /**
     * Process image: resize and compress
     */
    async processImage(imageUrl, size) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                try {
                    const maxSize = size === 'thumbnail' ? this.config.thumbnailSize : this.config.coverSize;
                    
                    // Calculate new dimensions
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = Math.round((height * maxSize) / width);
                            width = maxSize;
                        } else {
                            width = Math.round((width * maxSize) / height);
                            height = maxSize;
                        }
                    }
                    
                    // Create canvas and resize
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    
                    // Enable image smoothing for better quality
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // Draw resized image
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert to data URL with compression
                    const optimized = canvas.toDataURL(this.config.format, this.config.quality);
                    
                    // Calculate size reduction
                    const originalSize = imageUrl.length;
                    const optimizedSize = optimized.length;
                    this.stats.bytesReduced += (originalSize - optimizedSize);
                    
                    resolve(optimized);
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
            
            // Handle data URLs and regular URLs
            img.src = imageUrl;
        });
    }
    
    /**
     * Batch optimize multiple images
     * @param {Array} images - Array of {url, size} objects
     * @returns {Promise<Array>} Array of optimized data URLs
     */
    async batchOptimize(images) {
        const promises = images.map(img => 
            this.optimizeImage(img.url, img.size || 'thumbnail')
        );
        
        return Promise.all(promises);
    }
    
    // ========== CACHE MANAGEMENT ==========
    
    async getCachedImage(key) {
        if (!this.db) return null;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['optimizedImages'], 'readonly');
            const store = transaction.objectStore('optimizedImages');
            const request = store.get(key);
            
            request.onsuccess = () => {
                if (request.result) {
                    // Check if cache entry is still valid (30 days)
                    const age = Date.now() - request.result.timestamp;
                    if (age < 30 * 24 * 60 * 60 * 1000) {
                        resolve(request.result.data);
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => resolve(null);
        });
    }
    
    async cacheImage(key, data) {
        if (!this.db) return;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['optimizedImages'], 'readwrite');
            const store = transaction.objectStore('optimizedImages');
            
            const entry = {
                key: key,
                data: data,
                timestamp: Date.now()
            };
            
            const request = store.put(entry);
            
            request.onsuccess = () => resolve();
            request.onerror = () => resolve(); // Fail silently
        });
    }
    
    /**
     * Clear old cache entries
     */
    async clearOldCache(maxAge = 30 * 24 * 60 * 60 * 1000) {
        if (!this.db) return;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['optimizedImages'], 'readwrite');
            const store = transaction.objectStore('optimizedImages');
            const index = store.index('timestamp');
            
            const cutoff = Date.now() - maxAge;
            const range = IDBKeyRange.upperBound(cutoff);
            
            const request = index.openCursor(range);
            let deleted = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deleted++;
                    cursor.continue();
                } else {
                    this.debugLog(`🧹 Cleared ${deleted} old cache entries`, 'info');
                    resolve(deleted);
                }
            };
            
            request.onerror = () => resolve(0);
        });
    }
    
    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.memoryCache.clear();
        
        if (this.db) {
            const transaction = this.db.transaction(['optimizedImages'], 'readwrite');
            const store = transaction.objectStore('optimizedImages');
            store.clear();
            this.debugLog('🧹 All image caches cleared', 'info');
        }
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
            ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(1)
            : 0;
        
        const bytesReduced = (this.stats.bytesReduced / 1024).toFixed(2);
        
        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            bytesReduced: `${bytesReduced} KB`,
            memoryCacheSize: this.memoryCache.size
        };
    }
    
    /**
     * Preload and optimize images for a playlist
     * @param {Array} tracks - Array of track objects with metadata
     */
    async preloadPlaylistImages(tracks) {
        const images = tracks
            .filter(track => track.metadata?.image)
            .map(track => ({
                url: track.metadata.image,
                size: 'thumbnail'
            }));
        
        this.debugLog(`🖼️ Preloading ${images.length} playlist images...`, 'info');
        
        // Process in batches to avoid overwhelming the system
        const batchSize = 10;
        for (let i = 0; i < images.length; i += batchSize) {
            const batch = images.slice(i, i + batchSize);
            await this.batchOptimize(batch);
        }
        
        this.debugLog('✅ Playlist images preloaded', 'success');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageOptimizer;
}
