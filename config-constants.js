/* ============================================
   Configuration Constants
   ============================================ */

const APP_CONFIG = {
    // Storage
    MAX_CACHE_SIZE: 50,
    DB_NAME: 'MusicPlayerDB',
    DB_VERSION: 1,
    STORE_NAME: 'folderHandles',
    
    // Audio
    FFT_SIZE: 256,
    BASS_FREQ_HZ: 200,
    MID_FREQ_HZ: 1000,
    TREBLE_FREQ_HZ: 3000,
    EQ_MIN_DB: -12,
    EQ_MAX_DB: 12,
    EQ_STEP_DB: 0.5,
    DEFAULT_VOLUME: 1.0,
    VOLUME_SCROLL_STEP: 0.05,
    
    // Timing
    SEEK_STEP_SECONDS: 5,
    VOLUME_SAVE_DEBOUNCE_MS: 500,
    AUTO_HIDE_DELAY_MS: 3000,
    METADATA_LOAD_TIMEOUT_MS: 5000,
    
    // UI
    COMPACT_TRANSITION_MS: 300,
    TOAST_DURATION_MS: 2000,
    SWIPE_THRESHOLD_PX: 50,
    PULL_REFRESH_THRESHOLD_PX: 80,
    PULL_REFRESH_MAX_DISTANCE_PX: 150,
    
    // Playlist
    MIN_SEARCH_TRACKS: 10,
    MAX_RECOMMENDED_TRACKS: 100,
    
    // Performance
    COLOR_EXTRACTION_SAMPLE_SIZE: 50,
    COLOR_EXTRACTION_SKIP_PIXELS: 64,
    
    // File sizes
    ID3_READ_SIZE_BYTES: 500000,
    MAX_VALUE_SIZE_MB: 5,
    
    // Display
    COVER_ART_SIZE: {
        default: { width: 180, height: 180 },
        mobile: { width: 250, height: 250 },
        compact: { width: 100, height: 100 },
        mini: { width: 60, height: 60 }
    }
};

// Export for use
window.APP_CONFIG = APP_CONFIG;