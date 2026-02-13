/* ============================================
   Ultimate Local Music Player - JavaScript
   ============================================ */

// ========== MODULE SCOPE VARIABLES (Accessible to all modules) ==========
// Parsers and managers
let metadataParser = null;
let vttParser = null;
let errorRecovery = null;
let audioPresetsManager = null;
let metadataEditor = null;
let analyzer = null;          // ✅ ADD THIS
let generator = null;         // ✅ ADD THIS
let analysisParser = null;
let lyricsManager = null;

// Playlist data
let playlist = [];
let currentTrackIndex = -1;
let isShuffled = false;
let loopMode = 'off';

// Folder
let folderHandle = null;

// Audio system
let audioContext = null;
let analyser = null;
let audioSource = null;
let dataArray = null;
let bufferLength = null;
let visualizerAnimationId = null;
let visualizerEnabled = true;
let volumeControl = null;
let visualizerManager = typeof VisualizerManager !== 'undefined' ? new VisualizerManager() : null;
let fileLoadingManager = null;

// Equalizer
let bassFilter = null;
let midFilter = null;
let trebleFilter = null;

// UI state
let debugMode = false;
let isSeekingProg = false;
let compactMode = 'full';

// Canvas (initialized after DOM loads)
let canvas = null;
let canvasCtx = null;
let currentDominantColor = null;
let crossfadeManager = null;
let autoEQManager = null;
	let imageOptimizer = null;
	let audioBufferManager = null;
	let uiManager = null;

// Color extraction cache (CRITICAL - was missing!)
const colorCache = new Map();
// Register cache with performance manager for monitoring
window.colorCache = colorCache;

let backgroundAnalysisRunning = false;

document.addEventListener('DOMContentLoaded', () => {
    // ✅ ADD THIS FIRST - Initialize Worker Manager
    const workerManager = createMusicPlayerWorkerManager(debugLog);
    window.workerManager = workerManager; // Make it globally accessible
    debugLog('✅ Worker pool system initialized', 'success');

    // Initialize custom metadata store
    const customMetadataStore = new CustomMetadataStore();

    // Initialize folder persistence with enhanced features
const folderPersistence = new FolderPersistence();

// Display storage stats in debug mode
folderPersistence.getStats().then(stats => {
    if (stats) {
        debugLog(`💾 Storage: ${stats.percentUsed}% used | ${stats.historyCount} folders in history`, 'info');
        if (stats.hasSavedFolder) {
            debugLog(`📁 Saved folder: "${stats.folderName}" (${stats.trackCount} tracks)`, 'success');
        }
    }
});

    uiManager = new UIManager(debugLog);
    window.uiManager = uiManager;
    debugLog('✅ UI Manager initialized', 'success');

    analyzer = new MusicAnalyzer(debugLog);

    // NOW initialize parsers (after they're declared)
    metadataParser = new MetadataParser(debugLog);
    errorRecovery = new ErrorRecovery(debugLog);
    vttParser = new VTTParser(debugLog);
    metadataEditor = new MetadataEditor(debugLog);
    analysisParser = new AnalysisTextParser(debugLog);

    
        // --- Core Variables ---
        const player = document.getElementById('audio-player');
        const playlistStatus = document.getElementById('playlist-status');
        const loadButton = document.getElementById('load-button');
        const prevButton = document.getElementById('prev-button');
        const nextButton = document.getElementById('next-button');
        const shuffleButton = document.getElementById('shuffle-button');
        const loopButton = document.getElementById('loop-button');
        const clearButton = document.getElementById('clear-playlist');
        const debugToggle = document.getElementById('debug-toggle');
        const debugPanel = document.getElementById('debug-panel');
        const playlistItems = document.getElementById('playlist-items');
        const coverArtContainer = document.getElementById('cover-art-container');
        const coverArt = document.getElementById('cover-art');
        const coverPlaceholder = document.getElementById('cover-placeholder');
        const trackTitle = document.getElementById('track-title');
        const trackArtist = document.getElementById('track-artist');
        const trackAlbum = document.getElementById('track-album');
        const metadataContainer = document.getElementById('metadata-container');
        const progressContainer = document.getElementById('custom-progress-container');
        const progressBar = document.getElementById('progress-bar');
        const currentTimeDisplay = document.getElementById('current-time');
        const durationDisplay = document.getElementById('duration');
        const lyricsDisplay = document.getElementById('lyrics-display');
        const dropZone = document.getElementById('drop-zone');
        const exportLyricsButton = document.getElementById('export-lyrics-button');
        const pipToggle = document.getElementById('pip-toggle');
        const MAX_CACHE_SIZE = APP_CONFIG.MAX_CACHE_SIZE;
        //Constants for progress bar (eliminating magic numbers)
        const PROGRESS_UPDATE_INTERVAL_MS = 200;
        const SEEK_DEBOUNCE_DELAY_MS = 100;
        const PROGRESS_EDGE_TOLERANCE = 0.02; // 2% tolerance at edges

        canvas = document.getElementById('visualizer');
        canvasCtx = canvas.getContext('2d');
    
        const eqBassSlider = document.getElementById('eq-bass');
        const eqMidSlider = document.getElementById('eq-mid');
        const eqTrebleSlider = document.getElementById('eq-treble');
        const bassValue = document.getElementById('bass-value');
        const midValue = document.getElementById('mid-value');
        const trebleValue = document.getElementById('treble-value');
        const eqResetBtn = document.getElementById('eq-reset');
	    const perfManager = new PerformanceManager(debugLog);
	    debugLog('✅ Advanced performance manager initialized', 'success');

	    // Initialize optimization modules
	    imageOptimizer = new ImageOptimizer(debugLog);
	    audioBufferManager = new AudioBufferManager(debugLog);
	    debugLog('✅ Performance optimization modules initialized', 'success');

// Display performance stats in debug mode
if (debugMode) {
    setInterval(() => {
        if (debugMode) perfManager.logStatus();
    }, 5000); // Log every 5 seconds
}

    // 🎵 Initialize Background Audio Handler early (but after player exists)
if (window.backgroundAudioHandler) {
    backgroundAudioHandler.init({
        player: player,
        playlist: () => playlist,  // Pass as function for live updates
        getCurrentTrackIndex: () => currentTrackIndex,
        onMediaAction: {
            previous: () => {
                if (!prevButton.disabled) playPrevious();
            },
            next: () => {
                if (!nextButton.disabled) playNext();
            }
        }
    }).then(success => {
        if (success) {
            debugLog('✅ Background audio system activated', 'success');
        } else {
            debugLog('⚠️ Background audio system initialized with warnings', 'warning');
        }
    });
}

    // Initialize volume control
volumeControl = new VolumeControl(player, debugLog);
window.volumeControlInitialized = true;

// ✅ NEW: Smart reconnection system
if (audioContext && window.volumeGainNode) {
    // Audio context exists - try immediate connection
    const success = reconnectAudioChainWithVolumeControl();
    if (!success) {
        // Retry after short delay
        setTimeout(() => volumeControl.forceReconnect(), 500);
    }
} else {
    // Audio context will be created later - set up listener
    document.addEventListener('audioContextReady', () => {
        setTimeout(() => volumeControl.forceReconnect(), 100);
    }, { once: true });
}

    // Initialize custom background manager
if (typeof CustomBackgroundManager !== 'undefined') {
    const backgroundManager = new CustomBackgroundManager(debugLog);
    debugLog('✅ Custom background manager initialized', 'success');
}

     // ✅ ADD THIS - Initialize playlist renderer
    const playlistRenderer = new EnhancedPlaylistRenderer(debugLog);
    playlistRenderer.init({
        playlistItems: document.getElementById('playlist-items'),
        playlistSearch: document.getElementById('playlist-search'),
        clearButton: document.getElementById('clear-playlist'),
        jumpToCurrentBtn: document.getElementById('jump-to-current')
    });
    
    // Set callbacks
playlistRenderer.setCallbacks({
    onTrackClick: (index) => loadTrack(index),
    onEditClick: (index) => openMetadataEditorForTrack(index),
    onReorder: (fromIndex, toIndex) => {
        // Handle drag-and-drop reordering
        const track = playlist.splice(fromIndex, 1)[0];
        const insertIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
        playlist.splice(insertIndex, 0, track);
        
        // Update current track index
        if (currentTrackIndex === fromIndex) {
            currentTrackIndex = insertIndex;
        } else if (fromIndex < currentTrackIndex && insertIndex >= currentTrackIndex) {
            currentTrackIndex--;
        } else if (fromIndex > currentTrackIndex && insertIndex <= currentTrackIndex) {
            currentTrackIndex++;
        }
        
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
        playlistRenderer.render();
        savePlaylistToStorage();
        debugLog(`Track moved from ${fromIndex + 1} to ${insertIndex + 1}`, 'success');
    },
    onBatchDelete: (indices) => {
        const sortedIndices = [...indices].sort((a, b) => b - a);
        sortedIndices.forEach(index => {
            const track = playlist[index];
            if (track.audioURL && track.audioURL.startsWith('blob:')) {
                URL.revokeObjectURL(track.audioURL);
            }
            playlist.splice(index, 1);
        });
        
        if (indices.includes(currentTrackIndex)) {
            player.pause();
            player.src = '';
            currentTrackIndex = -1;
            clearMetadata();
        } else {
            const deletedBeforeCurrent = indices.filter(i => i < currentTrackIndex).length;
            currentTrackIndex -= deletedBeforeCurrent;
        }
        
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
        playlistRenderer.render();
        updatePlaylistStatus();
        savePlaylistToStorage();
        debugLog(`${indices.length} tracks removed`, 'success');
    },
    onPlayNext: (index) => {
        if (index === currentTrackIndex) return;
        const track = playlist.splice(index, 1)[0];
        const insertAt = currentTrackIndex + 1;
        playlist.splice(insertAt, 0, track);
        
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
        playlistRenderer.render();
        savePlaylistToStorage();
        debugLog(`⏭️ Next up: ${track.metadata?.title || track.fileName}`, 'success');
    },
    onFindSimilar: async (index) => {
        const track = playlist[index];
        if (!track.analysis) {
            debugLog('⚠️ No analysis data for this track', 'warning');
            return;
        }
        
        debugLog(`🔍 Finding tracks similar to "${track.metadata?.title || track.fileName}"...`);
        const similarTracks = generator.findSimilar(track, playlist, 10);
        
        if (similarTracks.length > 0) {
            // Show result in smart playlist generator if available
            if (window.showSmartPlaylistResult) {
                window.showSmartPlaylistResult({
                    name: `Similar to: ${track.metadata?.title || track.fileName}`,
                    description: 'Automatically matched based on BPM, Energy, and Mood',
                    tracks: similarTracks,
                    stats: generator.calculatePlaylistStats(similarTracks)
                });
            } else {
                // Fallback: highlight them in playlist or show alert
                alert(`Found ${similarTracks.length} similar tracks! Try generating a "Similar" smart playlist.`);
            }
        } else {
            debugLog('❌ No similar tracks found', 'warning');
        }
    }
});
    
    debugLog('✅ Playlist renderer ready', 'success');
        
        // --- Color Extraction Functions ---
        function rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
function extractDominantColor(imageUrl) {
    // Check cache first
    if (colorCache.has(imageUrl)) {
        debugLog('Using cached color', 'success');
        return Promise.resolve(colorCache.get(imageUrl));
    }
    
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                // Offscreen canvas for better performance
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                // 🆕 USE PERFORMANCE-OPTIMIZED SETTINGS
                const colorSettings = perfManager.getColorExtractionSettings();
                const sampleSize = colorSettings.sampleSize;
                const skipPixels = colorSettings.skipPixels;
                
                canvas.width = sampleSize;
                canvas.height = sampleSize;
                
                // Use even smaller sample size for speed
                canvas.width = sampleSize;
                canvas.height = sampleSize;
                
                // Draw scaled down version
                ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
                
                // Sample center 25% of image
                const centerSize = Math.floor(sampleSize / 2);
                const offset = Math.floor(sampleSize / 4);
                
                const imageData = ctx.getImageData(offset, offset, centerSize, centerSize);
                
                let r = 0, g = 0, b = 0, count = 0;
                
                // Sample every 16th pixel (4x4 grid skip) - SUPER fast
                for (let i = 0; i < imageData.data.length; i += 64) { // was 16, now 64
                    const red = imageData.data[i];
                    const green = imageData.data[i + 1];
                    const blue = imageData.data[i + 2];
                    const brightness = (red + green + blue) / 3;
                    
                    if (brightness > 20 && brightness < 235) {
                        r += red;
                        g += green;
                        b += blue;
                        count++;
                    }
                }
                
                if (count > 0) {
                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);
                }
                
                const color = { r, g, b };
                
                // FIXED: Cache eviction BEFORE adding new entry
                if (colorCache.size >= MAX_CACHE_SIZE) {
                    const firstKey = colorCache.keys().next().value;
                    colorCache.delete(firstKey);
                    debugLog('Cache evicted oldest color', 'info');
                }
                
                colorCache.set(imageUrl, color);
                
                debugLog(`Extracted and cached color: RGB(${r}, ${g}, ${b})`, 'success');
                resolve(color);
            } catch (err) {
                debugLog(`Color extraction failed: ${err.message}`, 'error');
                const defaultColor = { r: 45, g: 45, b: 45 };
                colorCache.set(imageUrl, defaultColor);
                resolve(defaultColor);
            }
        };
        
        img.onerror = () => {
            debugLog('Failed to load image for color extraction', 'error');
            const defaultColor = { r: 45, g: 45, b: 45 };
            colorCache.set(imageUrl, defaultColor);
            resolve(defaultColor);
        };
        
        img.src = imageUrl;
    });
}

// Initialize Lyrics Manager
lyricsManager = new LyricsManager(debugLog);
lyricsManager.init({
    lyricsDisplay: document.getElementById('lyrics-display'),
    exportButton: document.getElementById('export-lyrics-button'),
    fullscreenToggle: document.getElementById('fullscreen-lyrics-toggle'),
    fullscreenContainer: document.getElementById('fullscreen-lyrics'),
    fullscreenCanvas: document.getElementById('fullscreen-lyrics-viz-canvas'),
    fullscreenContent: document.getElementById('fullscreen-lyrics-content'),
    fullscreenCloseBtn: document.getElementById('lyrics-close-btn'),
    fullscreenPrevBtn: document.getElementById('lyrics-prev-btn'),
    fullscreenNextBtn: document.getElementById('lyrics-next-btn')
}, player);

// Set up callbacks
lyricsManager.onGetTrackInfo = () => {
    if (currentTrackIndex === -1 || playlist.length === 0) {
        return { title: 'Unknown Track', artist: 'Unknown Artist' };
    }
    const track = playlist[currentTrackIndex];
    return {
        title: track.metadata?.title || track.fileName,
        artist: track.metadata?.artist || 'Unknown Artist'
    };
};

lyricsManager.onNavigationRequest = (direction) => {
    if (direction === 'previous' && !prevButton.disabled) {
        playPrevious();
    } else if (direction === 'next' && !nextButton.disabled) {
        playNext();
    }
};

debugLog('✅ Enhanced Lyrics Manager initialized', 'success');

    // ========== VISUALIZER UI CONTROLLER ==========
let visualizerController = null;

if (typeof VisualizerUIController !== 'undefined') {
    // Ensure visualizerManager is initialized
    if (!visualizerManager && typeof VisualizerManager !== 'undefined') {
        visualizerManager = new VisualizerManager();
    }
    visualizerController = new VisualizerUIController(visualizerManager, debugLog);
    
    visualizerController.init({
        toggle: 'fullscreen-viz-toggle',
        container: 'fullscreen-visualizer',
        canvas: 'fullscreen-viz-canvas',
        modeBtn: 'viz-mode-btn',
        prevBtn: 'viz-prev-btn',
        playPauseBtn: 'viz-play-pause-btn',
        nextBtn: 'viz-next-btn',
        closeBtn: 'viz-close-btn',
        title: '.fullscreen-viz-title',
        artist: '.fullscreen-viz-artist',
        currentTime: 'viz-current-time',
        duration: 'viz-duration'
    });
    
    // Set callbacks
    visualizerController.setCallbacks({
        onPrevious: () => {
            if (!prevButton.disabled) playPrevious();
        },
        onNext: () => {
            if (!nextButton.disabled) playNext();
        },
        onPlayPause: () => {
            if (player.paused) player.play();
            else player.pause();
        },
        getTrackInfo: () => {
            if (currentTrackIndex === -1 || playlist.length === 0) {
                return { title: 'No track loaded', artist: '--' };
            }
            const track = playlist[currentTrackIndex];
            return {
                title: track.metadata?.title || track.fileName,
                artist: track.metadata?.artist || 'Unknown Artist'
            };
        },
        getCurrentTime: () => player.currentTime || 0,
        getDuration: () => player.duration || 0,
        isPaused: () => player.paused,
        // ✅ ADD THIS CRITICAL CALLBACK:
getAudioData: () => {
    // Try multiple ways to get audio data
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        return {
            dataArray: dataArray,
            bufferLength: bufferLength,
            analyser: analyser
        };
    } else if (window.sharedAnalyser && window.sharedDataArray) {
        window.sharedAnalyser.getByteFrequencyData(window.sharedDataArray);
        return {
            dataArray: window.sharedDataArray,
            bufferLength: window.sharedBufferLength,
            analyser: window.sharedAnalyser
        };
    } else if (window.getAudioDataForVisualizer) {
        // Use the global fallback function
        return window.getAudioDataForVisualizer();
    } else if (analyser) {
        // Last resort: create everything from scratch
        bufferLength = analyser.frequencyBinCount || 256;
        dataArray = new Uint8Array(bufferLength);
        if (analyser.getByteFrequencyData) {
            analyser.getByteFrequencyData(dataArray);
        }
        debugLog('⚠️ Created emergency dataArray for visualizer', 'warning');
        return {
            dataArray: dataArray,
            bufferLength: bufferLength,
            analyser: analyser
        };
    }
    
    debugLog('❌ No audio analyser available for visualizer', 'error');
    return null;
}
    });
    
    debugLog('✅ Visualizer UI controller integrated', 'success');
}
// ========== END VISUALIZER UI CONTROLLER ==========
        
        function applyDynamicBackground(color) {
            if (!color) {
                metadataContainer.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)';
                metadataContainer.style.boxShadow = '0 8px 32px rgba(220, 53, 69, 0.2)';
                return;
            }
            
            const { r, g, b } = color;
            const darkerR = Math.max(0, Math.floor(r * 0.3));
            const darkerG = Math.max(0, Math.floor(g * 0.3));
            const darkerB = Math.max(0, Math.floor(b * 0.3));
            const lighterR = Math.min(255, Math.floor(r * 0.6));
            const lighterG = Math.min(255, Math.floor(g * 0.6));
            const lighterB = Math.min(255, Math.floor(b * 0.6));
            
            metadataContainer.style.background = `linear-gradient(135deg, rgb(${darkerR}, ${darkerG}, ${darkerB}) 0%, rgb(${lighterR}, ${lighterG}, ${lighterB}) 100%)`;
            metadataContainer.style.boxShadow = `0 8px 32px rgba(${r}, ${g}, ${b}, 0.3)`;
            
            // Apply to body background for a more immersive feel
            document.body.style.backgroundColor = `rgb(${Math.floor(darkerR * 0.5)}, ${Math.floor(darkerG * 0.5)}, ${Math.floor(darkerB * 0.5)})`;
            document.body.style.transition = 'background-color 1.5s ease';
        }
        
        // --- Debug Functions (User's Code) ---
        function debugLog(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`${prefix} ${message}`);
            
            if (debugMode) {
                const entry = document.createElement('div');
                entry.style.color = type === 'error' ? '#ff5555' : type === 'success' ? '#50fa7b' : type === 'warning' ? '#ffb86c' : '#8be9fd';
                entry.textContent = `[${timestamp}] ${prefix} ${message}`;
                debugPanel.appendChild(entry);
                debugPanel.scrollTop = debugPanel.scrollHeight;
            }
        }
        
        debugToggle.onclick = () => {
            debugMode = !debugMode;
            debugPanel.classList.toggle('visible');
            debugToggle.textContent = debugMode ? '🐛 Hide Debug' : '🐛 Debug';
            if (debugMode) {
                debugLog('Debug mode enabled', 'success');
            }
        };
        
        // --- Utility Functions ---
        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        }
        
        function formatTime(seconds) {
            const min = Math.floor(seconds / 60);
            const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${min}:${sec}`;
        }
        
        // --- Audio Visualizer Functions ---
/* ============================================
   FIX: setupAudioContext in script.js
   Prevent multiple audio source creation
   ============================================ */

function setupAudioContext() {
    console.log('setupAudioContext called, audioContext exists?', !!audioContext);
    
    // ✅ FIX: Always create dataArray if analyser exists
    if (analyser && !dataArray) {
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        console.log('✅ Created dataArray for analyser');
    }
    
    // ✅ CRITICAL: If audioContext exists, we're already set up
    if (audioContext) {
        console.log('✅ Audio context already exists - skipping recreation');
        
        // ✅ NEW: Notify that audio context is ready (if not already notified)
        if (!window.audioContextReadyFired) {
            window.audioContextReadyFired = true;
            document.dispatchEvent(new CustomEvent('audioContextReady'));
            debugLog('📡 audioContextReady event fired', 'info');
        }
        
        // ✅ FIX: Create managers if they don't exist (PWA mode fix)
        if (!audioPresetsManager && bassFilter && midFilter && trebleFilter) {
            try {
                audioPresetsManager = new AudioPresetsManager(bassFilter, midFilter, trebleFilter, debugLog);
                audioPresetsManager.loadSavedPreset();
                debugLog('✅ Audio presets manager initialized (late)', 'success');
                populatePresetDropdown();
                if (audioContext && !window.audioContextReadyFired) {
            window.audioContextReadyFired = true;
            document.dispatchEvent(new CustomEvent('audioContextReady'));
            debugLog('📡 audioContextReady event fired', 'info');
        }
            } catch (err) {
                debugLog(`⚠️ Failed to init presets manager: ${err.message}`, 'warning');
            }
        }
        
        if (!autoEQManager && audioPresetsManager) {
            try {
                autoEQManager = new AutoEQManager(audioPresetsManager, debugLog);
                debugLog('✅ Auto-EQ system initialized (late)', 'success');
            } catch (err) {
                debugLog(`⚠️ Failed to init Auto-EQ: ${err.message}`, 'warning');
            }
        }
        
        if (!crossfadeManager) {
            try {
                crossfadeManager = new CrossfadeManager(audioContext, debugLog);
                debugLog('✅ Crossfade system initialized (late)', 'success');
            } catch (err) {
                debugLog(`⚠️ Failed to init crossfade: ${err.message}`, 'warning');
            }
        }
        
        // ✅ NEW: Initialize visualizer if it hasn't been initialized yet
        if (visualizerManager && !visualizerManager.canvas && canvas && analyser && dataArray) {
            visualizerManager.initMainVisualizer(canvas, analyser, dataArray, bufferLength);
            debugLog('✅ Audio visualizer initialized (late)', 'success');
        }
        
        // ✅ ALWAYS return - never recreate audio context or source
        return;
    }
    
    try {
        // ✅ FIX: Force user interaction before creating AudioContext in PWA mode
        const isHttps = window.location.protocol === 'https:';
        const isPWA = window.matchMedia('(display-mode: standalone)').matches;
        
        if (isHttps || isPWA) {
            console.log('🔒 HTTPS/PWA mode - ensuring user interaction');
        }
        
        // ✅ Check if background-audio-handler already created everything
        if (window.sharedAudioContext && window.sharedAnalyser && window.sharedAudioSource) {
            debugLog('✅ Using audio system from background-audio-handler', 'success');
            audioContext = window.sharedAudioContext;
            analyser = window.sharedAnalyser;
            audioSource = window.sharedAudioSource;
            bassFilter = window.sharedBassFilter;
            midFilter = window.sharedMidFilter;
            trebleFilter = window.sharedTrebleFilter;
            
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
        } else {
            // Create our own audio context (first time only)
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // ✅ PWA FIX: Resume immediately if suspended
            if (audioContext.state === 'suspended') {
                console.log('⚠️ AudioContext suspended, resuming...');
                audioContext.resume().catch(err => {
                    console.error('❌ Failed to resume:', err);
                });
            }
            
            analyser = audioContext.createAnalyser();
            analyser.fftSize = APP_CONFIG.FFT_SIZE;
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            // Create equalizer filters
            bassFilter = audioContext.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.value = APP_CONFIG.BASS_FREQ_HZ;
            bassFilter.gain.value = 0;
            
            midFilter = audioContext.createBiquadFilter();
            midFilter.type = 'peaking';
            midFilter.frequency.value = APP_CONFIG.MID_FREQ_HZ;
            midFilter.Q.value = 1;
            midFilter.gain.value = 0;
            
            trebleFilter = audioContext.createBiquadFilter();
            trebleFilter.type = 'highshelf';
            trebleFilter.frequency.value = APP_CONFIG.TREBLE_FREQ_HZ;
            trebleFilter.gain.value = 0;
            
            // ✅ CRITICAL: Only create source if it doesn't exist globally
            if (!window.sharedAudioSource) {
                try {
                    audioSource = audioContext.createMediaElementSource(player);
                    window.sharedAudioSource = audioSource;
                    console.log('✅ Created NEW audio source (first time)');
                } catch (error) {
                    console.warn('⚠️ Audio source already exists, reusing:', error.message);
                    audioSource = window.sharedAudioSource;
                }
            } else {
                audioSource = window.sharedAudioSource;
                console.log('✅ Reusing existing audio source');
            }
            
            // Connect with volume control and compression integrated
            if (window.volumeGainNode && window.volumeCompressor && window.volumeMakeupGain) {
                // Chain: source → bass → mid → treble → gain → compressor → makeup → analyser → output
                audioSource.connect(bassFilter);
                bassFilter.connect(midFilter);
                midFilter.connect(trebleFilter);
                trebleFilter.connect(window.volumeGainNode);
                window.volumeGainNode.connect(window.volumeCompressor);
                window.volumeCompressor.connect(window.volumeMakeupGain);
                window.volumeMakeupGain.connect(analyser);
                analyser.connect(audioContext.destination);
                
                debugLog('✅ Audio chain connected WITH volume control & compression', 'success');
            } else {
                // Fallback: simple chain (volume control not ready yet)
                audioSource.connect(bassFilter);
                bassFilter.connect(midFilter);
                midFilter.connect(trebleFilter);
                trebleFilter.connect(analyser);
                analyser.connect(audioContext.destination);
                
                debugLog('✅ Audio chain connected WITHOUT volume control (will reconnect later)', 'info');
            }
            
            // ✅ CROSSFADE INIT (inside else block, after audio chain)
            if (crossfadeManager && !crossfadeManager.isInitialized) {
                crossfadeManager.initAudioNodes();
                
                // Reconnect audio chain with crossfade
                if (window.volumeGainNode) {
                    // treble → crossfade → volume → compressor → makeup → analyser → output
                    trebleFilter.disconnect();
                    crossfadeManager.connectToAudioChain(trebleFilter, window.volumeGainNode);
                } else {
                    // treble → crossfade → analyser → output
                    trebleFilter.disconnect();
                    crossfadeManager.connectToAudioChain(trebleFilter, analyser);
                }
            }
        }
        
        // Share globally
        window.sharedAudioContext = audioContext;
        window.sharedAnalyser = analyser;
        window.sharedDataArray = dataArray; 
        window.sharedBufferLength = bufferLength;
        window.sharedBassFilter = bassFilter;
        window.sharedMidFilter = midFilter;
        window.sharedTrebleFilter = trebleFilter;
        
        // Initialize visualizer
        if (analyser && canvas && dataArray) {
            if (!visualizerManager && typeof VisualizerManager !== 'undefined') {
                visualizerManager = new VisualizerManager();
            }
            if (visualizerManager) {
                visualizerManager.initMainVisualizer(canvas, analyser, dataArray, bufferLength);
                visualizerManager.start();
                debugLog('Audio visualizer initialized', 'success');
            }
        }
        
        // Apply performance settings
        const vizSettings = perfManager.getVisualizerSettings();
        analyser.fftSize = vizSettings.fftSize;
        
        // Initialize other components
        setupEqualizerControls();
        
        audioPresetsManager = new AudioPresetsManager(bassFilter, midFilter, trebleFilter, debugLog);
        audioPresetsManager.loadSavedPreset();
        
        if (!autoEQManager) {
            autoEQManager = new AutoEQManager(audioPresetsManager, debugLog);
        }
        
        populatePresetDropdown();
        
        if (!crossfadeManager) {
            crossfadeManager = new CrossfadeManager(audioContext, debugLog);
        }
        
    } catch (error) {
        debugLog(`Audio setup failed: ${error.message}`, 'error');
        
        // Still try to create dataArray
        if (analyser && !dataArray) {
            try {
                bufferLength = analyser.frequencyBinCount || 256;
                dataArray = new Uint8Array(bufferLength);
            } catch (e) {
                debugLog('❌ Could not create fallback dataArray', 'error');
            }
        }
    }
}

    /**
 * âœ… NEW FUNCTION: Reconnect audio chain when volume control initializes late
 */
function reconnectAudioChainWithVolumeControl() {
    if (!audioContext || !audioSource || !bassFilter || !midFilter || !trebleFilter || !analyser) {
        debugLog('âŒ Cannot reconnect - audio chain not initialized', 'error');
        return false;
    }
    
    if (!window.volumeGainNode || !window.volumeCompressor || !window.volumeMakeupGain) {
        debugLog('âŒ Cannot reconnect - volume control nodes not ready', 'error');
        return false;
    }
    
    try {
        // Disconnect old connections
        trebleFilter.disconnect();
        if (window.volumeGainNode) window.volumeGainNode.disconnect();
        if (window.volumeCompressor) window.volumeCompressor.disconnect();
        if (window.volumeMakeupGain) window.volumeMakeupGain.disconnect();
        analyser.disconnect();
        
        // Reconnect with proper order
        trebleFilter.connect(window.volumeGainNode);
        window.volumeGainNode.connect(window.volumeCompressor);
        window.volumeCompressor.connect(window.volumeMakeupGain);
        window.volumeMakeupGain.connect(analyser);
        analyser.connect(audioContext.destination);
        
        debugLog('âœ… Audio chain reconnected with volume control', 'success');
        return true;
    } catch (err) {
        debugLog(`âŒ Failed to reconnect audio chain: ${err.message}`, 'error');
        return false;
    }
}
        
function startVisualizer() {
    if (perfManager.shouldRunVisualizer() && analyser) {
        // ✅ CRITICAL: Always ensure dataArray exists
        if (!dataArray || dataArray.length === 0) {
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            // Share globally for other components
            window.sharedDataArray = dataArray;
            window.sharedBufferLength = bufferLength;
            
            debugLog('✅ Created dataArray for visualizer', 'success');
        }
        
        // Ensure visualizer is initialized before starting
        if (!visualizerManager.canvas) {
            visualizerManager.initMainVisualizer(canvas, analyser, dataArray, bufferLength);
        }
        
        const vizSettings = perfManager.getVisualizerSettings();
        visualizerManager.start(true, vizSettings);
    }
}
        
        function stopVisualizer() {
    visualizerManager.stop();
}

    // Widget communication system
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'WIDGET_COMMAND') {
            handleWidgetCommand(event.data.action);
        }
    });
}

function handleWidgetCommand(action) {
    switch (action) {
        case 'PLAY':
            player.play();
            break;
        case 'PAUSE':
            player.pause();
            break;
        case 'NEXT':
            if (!nextButton.disabled) playNext();
            break;
        case 'PREVIOUS':
            if (!prevButton.disabled) playPrevious();
            break;
        case 'GET_STATE':
            broadcastStateToWidget();
            break;
    }
}

function broadcastStateToWidget() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const state = {
            isPlaying: !player.paused,
            currentTrack: {
                title: playlist[currentTrackIndex]?.metadata?.title || 'No track loaded',
                artist: playlist[currentTrackIndex]?.metadata?.artist || '--',
                albumArt: playlist[currentTrackIndex]?.metadata?.image || null
            },
            progress: player.duration ? (player.currentTime / player.duration) * 100 : 0
        };
        
        navigator.serviceWorker.controller.postMessage({
            type: 'UPDATE_STATE',
            state: state
        });
    }
}

// Call this whenever playback state changes
player.addEventListener('play', broadcastStateToWidget);
player.addEventListener('pause', broadcastStateToWidget);
player.addEventListener('timeupdate', broadcastStateToWidget);

    // ✅ PWA FIX: Resume AudioContext on any user interaction
const resumeAudioOnInteraction = () => {
    if (audioContext && audioContext.state === 'suspended') {
        console.log('🔓 Resuming AudioContext on user interaction');
        audioContext.resume().then(() => {
            console.log('✅ AudioContext resumed');
        }).catch(err => {
            console.error('❌ Failed to resume AudioContext:', err);
        });
    }
};

// Add listeners for PWA mode
document.addEventListener('click', resumeAudioOnInteraction, { once: true });
document.addEventListener('touchstart', resumeAudioOnInteraction, { once: true });
player.addEventListener('play', resumeAudioOnInteraction, { once: true });
        
        // --- Equalizer Functions ---
        function setupEqualizerControls() {
            // Load saved EQ settings
            const savedBass = localStorage.getItem('eqBass');
            const savedMid = localStorage.getItem('eqMid');
            const savedTreble = localStorage.getItem('eqTreble');
            
            if (savedBass !== null) {
                eqBassSlider.value = savedBass;
                bassFilter.gain.value = parseFloat(savedBass);
                bassValue.textContent = `${savedBass} dB`;
            }
            if (savedMid !== null) {
                eqMidSlider.value = savedMid;
                midFilter.gain.value = parseFloat(savedMid);
                midValue.textContent = `${savedMid} dB`;
            }
            if (savedTreble !== null) {
                eqTrebleSlider.value = savedTreble;
                trebleFilter.gain.value = parseFloat(savedTreble);
                trebleValue.textContent = `${savedTreble} dB`;
            }
            
            // Bass control
            eqBassSlider.oninput = (e) => {
                const value = parseFloat(e.target.value);
                bassFilter.gain.value = value;
                bassValue.textContent = `${value} dB`;
                localStorage.setItem('eqBass', value);
                debugLog(`Bass: ${value} dB`);
            };
            
            // Mid control
            eqMidSlider.oninput = (e) => {
                const value = parseFloat(e.target.value);
                midFilter.gain.value = value;
                midValue.textContent = `${value} dB`;
                localStorage.setItem('eqMid', value);
                debugLog(`Mid: ${value} dB`);
            };
            
            // Treble control
            eqTrebleSlider.oninput = (e) => {
                const value = parseFloat(e.target.value);
                trebleFilter.gain.value = value;
                trebleValue.textContent = `${value} dB`;
                localStorage.setItem('eqTreble', value);
                debugLog(`Treble: ${value} dB`);
            };
            
            // Reset button
            eqResetBtn.onclick = () => {
                eqBassSlider.value = 0;
                eqMidSlider.value = 0;
                eqTrebleSlider.value = 0;
                
                bassFilter.gain.value = 0;
                midFilter.gain.value = 0;
                trebleFilter.gain.value = 0;
                
                bassValue.textContent = '0 dB';
                midValue.textContent = '0 dB';
                trebleValue.textContent = '0 dB';
                
                localStorage.removeItem('eqBass');
                localStorage.removeItem('eqMid');
                localStorage.removeItem('eqTreble');
                
                debugLog('Equalizer reset', 'success');
            };
        }
        

// What This Does

//**Equalizer Features:**
//- **Bass Filter** (200 Hz low shelf): Boosts/cuts low frequencies
//- **Mid Filter** (1000 Hz peaking): Boosts/cuts mid frequencies
//- **Treble Filter** (3000 Hz high shelf): Boosts/cuts high frequencies
//- **Range**: -12 dB to +12 dB for each band
//- **Visual sliders**: Vertical sliders with real-time value display
//- **Persistence**: Settings saved to localStorage
//- **Reset button**: Instantly returns all bands to 0 dB

//**Audio Chain:**
//```
//Player → Bass Filter → Mid Filter → Treble Filter → Analyser → Output
        
        // --- Metadata Functions (User's Code) ---
       function clearMetadata() {
    // Revoke blob URL if it exists
    if (coverArt.src && coverArt.src.startsWith('blob:')) {
        URL.revokeObjectURL(coverArt.src);
    }
    
    coverArt.classList.remove('loaded');
    coverArt.src = '';
    coverPlaceholder.style.display = 'flex';
    trackTitle.textContent = 'No track loaded';
    trackArtist.textContent = '--';
    trackAlbum.textContent = '--';
    applyDynamicBackground(null);
    lyricsDisplay.innerHTML = '<div class="lyric-line">Lyrics will appear here when a track is loaded.</div>';
    lyricsManager.clearLyrics();
    currentTimeDisplay.textContent = '0:00';
    durationDisplay.textContent = '0:00';
    progressBar.style.width = '0%';
}

async function displayMetadata(metadata) {
            debugLog(`Displaying metadata: ${metadata.title} by ${metadata.artist}`);
            trackTitle.textContent = metadata.title || 'Unknown Title';
            trackArtist.textContent = metadata.artist || 'Unknown Artist';
            trackAlbum.textContent = metadata.album || 'Unknown Album';
            if (metadata.image) {
                coverArt.src = metadata.image;
                coverArt.classList.add('loaded');
                coverPlaceholder.style.display = 'none';
                debugLog('Album art loaded successfully', 'success');
                
                // Extract and apply color
                const color = await extractDominantColor(metadata.image);
                applyDynamicBackground(color);
                currentDominantColor = color;
                lyricsManager.setDominantColor(color);
            } else {
                coverArt.classList.remove('loaded');
                coverArt.src = '';
                coverPlaceholder.style.display = 'flex';
                applyDynamicBackground(null);
                debugLog('No album art found', 'warning');
            }
        }
        

    const playlistSearch = document.getElementById('playlist-search');

playlistSearch.oninput = (e) => {
    const query = e.target.value.toLowerCase();
    const items = playlistItems.querySelectorAll('.playlist-item');
    
    items.forEach(item => {
        const title = item.querySelector('.playlist-item-title').textContent.toLowerCase();
        const artist = item.querySelector('.playlist-item-artist').textContent.toLowerCase();
        
        if (title.includes(query) || artist.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

    // Jump to Current Track button
const jumpToCurrentBtn = document.getElementById('jump-to-current');

if (jumpToCurrentBtn) {
    jumpToCurrentBtn.onclick = () => {
        const currentItem = playlistItems.querySelector('.playlist-item.playing');
        if (currentItem) {
            const container = document.getElementById('playlist-container');
            if (container) {
                const containerRect = container.getBoundingClientRect();
                const itemRect = currentItem.getBoundingClientRect();
                
                // Calculate scroll position to center the item in the container
                const itemOffsetTop = currentItem.offsetTop;
                const containerHeight = container.clientHeight;
                const itemHeight = currentItem.clientHeight;
                
                const scrollTo = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);
                
                container.scrollTo({
                    top: scrollTo,
                    behavior: 'smooth'
                });
            }
        }
    };
}

        // --- Playlist Management (User's Code) ---
        function updatePlaylistStatus() {
            let loopText = 'Loop: Off';
            if (loopMode === 'all') loopText = 'Loop: All Tracks';
            if (loopMode === 'one') loopText = 'Loop: Current Track';
            const shuffleText = isShuffled ? 'Shuffle: ON' : 'Shuffle: Off';
            playlistStatus.textContent = `Tracks: ${playlist.length} | ${loopText} | ${shuffleText}`;
        }

    function updateMediaSession() {
    // This function is handled by background-audio-handler
    // Just call its method if available
    if (window.backgroundAudioHandler && typeof window.backgroundAudioHandler.updateMediaSessionMetadata === 'function') {
        window.backgroundAudioHandler.updateMediaSessionMetadata(true);
    }
}

    async function handleAutoLyrics(track) {
        const autoToggle = document.getElementById('auto-lyrics-toggle');
        
        // 1. Check if feature is ON
        if (!autoToggle || !autoToggle.checked) return;
        
        // 2. Check if we already have lyrics in the cache
        const trackId = `${track.metadata?.artist || 'Unknown'}_${track.metadata?.title || track.fileName}`;
        const cached = await lyricsManager.getLyricsFromDB(trackId);
        if (cached) return; // Already have them, do nothing
        
        // 3. Fetch from internet
        const artist = track.metadata?.artist || 'Unknown Artist';
        const title = track.metadata?.title || track.fileName;
        const lyrics = await lyricsManager.fetchLyricsOnline(artist, title);
        
        if (lyrics) {
            // 4. Save to your existing IndexedDB cache (converts to VTT internally)
            await lyricsManager.saveLyricsToDB(trackId, lyrics);
            
            // 5. Load them into the player immediately (using VTT conversion)
            const vttContent = vttParser.convertLRCToVTT(lyrics);
            const parsedCues = vttParser.parseVTTContent(vttContent);
            lyricsManager.loadLyrics(parsedCues, trackId);
        }
    }

    async function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const track = playlist[currentTrackIndex];
    
    debugLog(`=== Loading Track ${index + 1}/${playlist.length}: ${track.fileName} ===`);
    
    // Clear previous
    while (player.firstChild) {
        player.removeChild(player.firstChild);
    }
    
    // Clear old cues
    cues = [];
    
    // Display metadata
    displayMetadata(playlist[index].metadata || { title: playlist[index].fileName, artist: 'Unknown Artist', album: 'Unknown Album' });

           // 🎵 Update background handler metadata
    if (backgroundAudioHandler) {
        backgroundAudioHandler.updateMediaSessionMetadata(true);
    }
    
    // ✅ FIX: Initialize audio system BEFORE playback
    if (!audioContext) {
        setupAudioContext();
    }

           // ✅ ADD: Apply saved volume for this track (if exists) with smart normalization
    const trackId = `${track.metadata?.artist || 'Unknown'}_${track.metadata?.title || track.fileName}`;
    if (volumeControl) {
        // Pass analysis data for smart normalization
        const hasAppliedSaved = volumeControl.applyTrackVolume(trackId);
        if (!hasAppliedSaved) {
            volumeControl.applyVolume(volumeControl.getVolume(), true, track.analysis);
        }
    }
    
    // Apply Auto-EQ if enabled
    if (autoEQManager && autoEQManager.enabled) {
        autoEQManager.applyAutoEQ(track);
    }

// ✅ NEW: Pass analysis data to visualizer if available
if (visualizerManager) {
    if (track.analysis) {
        visualizerManager.setTrackAnalysis(track.analysis);
        debugLog(`🎨 Enhanced visualizer mode: BPM=${track.analysis.bpm}, Energy=${(track.analysis.energy * 100).toFixed(0)}%, Mood=${track.analysis.mood}`, 'success');
    } else {
        visualizerManager.clearTrackAnalysis();
        debugLog('🎨 Standard visualizer mode (no analysis data)', 'info');
    }
}

// ✅ Ensure visualizer has dataArray
if (!dataArray && analyser) {
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    debugLog('✅ Recreated dataArray for visualizer', 'info');
}

    // Load audio using stored URL (with buffer manager optimization)
    const loadTrackIndex = index; // Closure for async load
    if (audioBufferManager) {
        // Clear previous buffer URL if it exists to prevent memory leaks and state confusion
        if (player.src && player.src.startsWith('blob:')) {
            URL.revokeObjectURL(player.src);
        }

            audioBufferManager.getBuffer(loadTrackIndex).then(buffer => {
                if (currentTrackIndex !== loadTrackIndex) {
                    debugLog('Track index changed during buffer load, ignoring result', 'warning');
                    return;
                }

                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                const bufferUrl = URL.createObjectURL(blob);
                player.src = bufferUrl;
                player.load();
                debugLog(`Audio source set from buffer manager for track ${loadTrackIndex}`, 'success');
                
                // ✅ SMART SKIP: Skip initial silence if detected
                if (track.analysis?.silence?.start > 0.1) {
                    const skipTime = track.analysis.silence.start;
                    player.currentTime = skipTime;
                    debugLog(`⏭️ Skipped ${skipTime.toFixed(2)}s of silence at start`, 'success');
                }

                player.play().catch(e => debugLog(`Playback start failed: ${e.message}`, 'warning'));
                audioBufferManager.preloadUpcoming(loadTrackIndex);
            }).catch(err => {
            debugLog(`Buffer manager failed, falling back to original URL: ${err.message}`, 'warning');
            player.src = track.audioURL;
            player.load();
            player.play().catch(e => debugLog(`Fallback playback failed: ${e.message}`, 'warning'));
        });
    } else {
        player.src = track.audioURL;
        player.load();
        debugLog('Audio source set');
        player.play().catch(e => debugLog(`Standard playback failed: ${e.message}`, 'warning'));
    }

    // Load VTT with MANUAL parsing
    if (track.vtt) {
        debugLog(`Loading VTT: ${track.vtt.name}`);
        
        try {
            const parsedCues = await vttParser.loadVTTFile(track.vtt);
            lyricsManager.loadLyrics(parsedCues);
        } catch (err) {
            debugLog(`Failed to load VTT: ${err.message}`, 'error');
            lyricsManager.clearLyrics();
        }
    } else {
        lyricsManager.clearLyrics();
        debugLog(`VTT file NOT found for ${track.fileName}.`, 'warning');
        
        // ✅ NEW: Auto-fetch lyrics if VTT is missing
        handleAutoLyrics(track);
    }

playlistRenderer.updateHighlight(currentTrackIndex);
prevButton.disabled = false;
nextButton.disabled = false;

// Ensure audio context is ready
if (!audioContext) {
    setupAudioContext();
} else if (audioContext.state === 'suspended') {
    audioContext.resume();
}

updateMediaSession();
    playlistRenderer.updateJumpButton();
// Start crossfade monitoring AFTER metadata loads
if (crossfadeManager && crossfadeManager.enabled && currentTrackIndex + 1 < playlist.length) {
    const nextTrack = playlist[currentTrackIndex + 1];
    
    // ✅ CRITICAL: Wait for both duration AND playback to start
    const startCrossfadeMonitoring = () => {
        if (!player.duration || isNaN(player.duration)) {
            debugLog('⏳ Waiting for track duration before starting crossfade...', 'info');
            return false;
        }
        
        if (player.paused) {
            debugLog('⏳ Waiting for playback before starting crossfade...', 'info');
            return false;
        }
        
        crossfadeManager.startMonitoring(player, track, nextTrack, async (fadeData) => {
            debugLog('🎚️ Crossfade triggered - switching tracks', 'info');
            await playNext();
            
            if (fadeData.startTime && fadeData.startTime > 0) {
                await new Promise((resolve) => {
                    if (player.readyState >= 2) {
                        resolve();
                    } else {
                        player.addEventListener('loadedmetadata', resolve, { once: true });
                    }
                });
                
                player.currentTime = fadeData.startTime;
                debugLog(`⏭️ Skipped intro: jumped to ${fadeData.startTime.toFixed(1)}s`, 'success');
            }
        });
        
        return true;
    };
    
    // Try to start immediately
    if (!startCrossfadeMonitoring()) {
        // If not ready, wait for play event
        const onPlayForCrossfade = () => {
            if (startCrossfadeMonitoring()) {
                player.removeEventListener('play', onPlayForCrossfade);
            }
        };
        player.addEventListener('play', onPlayForCrossfade);
        
        // Also listen for duration change as backup
        player.addEventListener('durationchange', () => {
            if (startCrossfadeMonitoring()) {
                player.removeEventListener('play', onPlayForCrossfade);
            }
        }, { once: true });
    }
}
if (visualizerController) {
        visualizerController.onTrackChange();
    }
// ✅ Return a promise that resolves when track is loaded
    return new Promise((resolve) => {
        if (player.readyState >= 2) {
            resolve();
        } else {
            player.addEventListener('loadedmetadata', () => resolve(), { once: true });
        }
    });      
}


async function playNext() {
    // Cancel any pending crossfade
    if (crossfadeManager) {
        crossfadeManager.cancelFade();
    }
    
    // ✅ ADD: Remember volume for current track before switching
    if (currentTrackIndex !== -1 && volumeControl) {
        const track = playlist[currentTrackIndex];
        const trackId = `${track.metadata?.artist || 'Unknown'}_${track.metadata?.title || track.fileName}`;
        volumeControl.rememberTrackVolume(trackId, volumeControl.getVolume());
    }
    
    if (currentTrackIndex === -1 || playlist.length === 0) return;

    let nextIndex;
    
    if (currentTrackIndex < playlist.length - 1) {
        nextIndex = currentTrackIndex + 1;
    } else if (loopMode === 'all') {
        nextIndex = 0;
    } else {
        player.pause();
        trackTitle.textContent = "Playlist finished";
        debugLog('Playlist finished');
        return;
    }
    
    // ✅ SIMPLE: Just load the next track normally
    // Crossfade will be handled automatically by the monitoring system in loadTrack
    loadTrack(nextIndex);
}

        function playPrevious() {
            // ✅ ADD: Remember volume for current track before switching
    if (currentTrackIndex !== -1 && volumeControl) {
        const track = playlist[currentTrackIndex];
        const trackId = `${track.metadata?.artist || 'Unknown'}_${track.metadata?.title || track.fileName}`;
        volumeControl.rememberTrackVolume(trackId, volumeControl.getVolume());
    }
            if (currentTrackIndex === -1 || playlist.length === 0) return;
            if (currentTrackIndex > 0) {
                loadTrack(currentTrackIndex - 1);
            } else if (loopMode === 'all') {
                loadTrack(playlist.length - 1);
            }
        }

        // --- Custom Controls Handlers (NEW) ---
        
        const updateProgressBar = (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            let percent = clickX / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            
            const newTime = percent * player.duration;
            progressBar.style.width = `${percent * 100}%`;
            currentTimeDisplay.textContent = formatTime(newTime);
            return newTime;
        };

// Enhanced seek handling with error recovery
let seekDebounce = null;
progressContainer.onmousedown = (e) => {
    clearTimeout(seekDebounce);
    
    isSeekingProg = true;
    const wasPlaying = !player.paused;
    
    // Pause playback during seek
    player.pause();
    
    // Debounced resume
    seekDebounce = setTimeout(() => {
        if (wasPlaying) {
            player.play().catch(err => {
                debugLog(`Error resuming after seek: ${err.message}`, 'error');
                // Retry once after short delay
                setTimeout(() => {
                    player.play().catch(e => debugLog(`Retry failed: ${e.message}`, 'error'));
                }, 200);
            });
        }
    }, SEEK_DEBOUNCE_DELAY_MS);
};

document.onmousemove = (e) => {
    if (!isSeekingProg) return;
    const newTime = updateProgressBar(e);
    if (newTime === null) {
        debugLog('Ignoring invalid seek attempt', 'warning');
    }
};

document.onmouseup = (e) => {
    if (!isSeekingProg) return;
    isSeekingProg = false;
    
    const newTime = updateProgressBar(e);
    
    if (newTime !== null && !isNaN(newTime)) {
        try {
            player.currentTime = newTime;
            debugLog(`Seeked to ${formatTime(newTime)}`, 'info');
        } catch (err) {
            debugLog(`Seek failed: ${err.message}`, 'error');
            // Reset to current position
            progressBar.style.width = `${(player.currentTime / player.duration) * 100}%`;
        }
    }
    
    player.play().catch(err => {
        debugLog(`Error resuming playback: ${err.message}`, 'warning');
    });
};


        // --- Event Handlers ---
loadButton.onclick = async () => {
    try {
        await fileLoadingManager.createFileInput({
            accept: 'audio/*,.vtt,.txt',
            multiple: true
        });
    } catch (err) {
        if (err.message !== 'File selection cancelled') {
            debugLog(`File loading failed: ${err.message}`, 'error');
        }
    }
};
        
        // Drag and Drop implementation (NEW)
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.display = 'flex';
        });

        document.body.addEventListener('dragleave', (e) => {
            if (e.clientX === 0 && e.clientY === 0) { // Check to ensure it's not a browser event leaving window
                dropZone.style.display = 'none';
            }
        });

        document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.display = 'none';
    
    const files = Array.from(e.dataTransfer.files);
    await fileLoadingManager.loadFiles(files);
});
// ========== FILE LOADING MANAGER SETUP ==========

    
    // Initialize ENHANCED file loading manager
fileLoadingManager = new EnhancedFileLoadingManager(debugLog, {
    supportedAudioFormats: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus', 'webm'],
    maxConcurrent: 3,          // Process 3 files simultaneously
    retryAttempts: 2,          // Retry failed files 2 times
    fuzzyMatchThreshold: 0.8,  // 80% similarity for fuzzy matching
    chunkSize: 5,              // Process in chunks of 5
    enableCaching: true        // Cache processed results
});
    
    // Inject dependencies
    fileLoadingManager.init({
        metadataParser: metadataParser,
        vttParser: vttParser,
        analysisParser: analysisParser,
        customMetadataStore: customMetadataStore,
        analyzer: analyzer
    });
    
    // Set callbacks
    fileLoadingManager.setCallbacks({
    onLoadStart: (fileCount) => {
        playlistStatus.textContent = '⚡ Enhanced loading: Scanning files...';
        debugLog(`Starting enhanced load: ${fileCount} files...`, 'info');
    },
    
    onLoadProgress: (progress) => {
        const cacheText = progress.fromCache ? ' (cached)' : '';
        playlistStatus.textContent = `⚡ Processing ${progress.current}/${progress.total}: ${progress.filename}${cacheText}`;
    },
    
    onFileProcessed: (entry) => {
        // Optional: You can add per-file processing feedback here
        debugLog(`✓ Processed: ${entry.fileName}`, 'info');
    },
    
    onChunkComplete: (chunkData) => {
        // Optional: Update UI after each chunk
        debugLog(`Chunk ${chunkData.chunk}/${chunkData.total} complete (${chunkData.processed} files)`, 'success');
    },
        
        onLoadComplete: async (newPlaylist) => {
            if (newPlaylist.length === 0) {
                playlistStatus.textContent = 'No valid audio files found';
                return;
            }
            
            // IMPORTANT: Stop current playback before reloading
            player.pause();
            player.src = '';
            currentTrackIndex = -1;
            
	            // Set new playlist
	            playlist = newPlaylist;
	            currentTrackIndex = 0;
	            
	            debugLog(`Playlist created with ${playlist.length} tracks`, 'success');
	            
	            // Set playlist in buffer manager
	            if (audioBufferManager) {
	                audioBufferManager.setPlaylist(playlist);
	            }
	            
	            updatePlaylistStatus();
	            playlistRenderer.setPlaylist(playlist, currentTrackIndex);
            playlistRenderer.render();
            
            // Load first track
            setTimeout(() => {
                loadTrack(0);
            }, 150);
            
            // Start background analysis for tracks WITHOUT deep analysis
            setTimeout(() => {
                if (analyzer && playlist.length > 0) {
                    const needsAnalysis = playlist.filter(t => !t.hasDeepAnalysis && !t.analysis);
                    
                    if (needsAnalysis.length > 0) {
                        debugLog(`🔍 Starting background analysis for ${needsAnalysis.length} unanalyzed tracks...`, 'info');
                        startBackgroundAnalysis();
                    } else {
                        debugLog(`✅ All tracks have deep analysis - skipping background analysis`, 'success');
                    }
                }
            }, 3000);
            
            // Enable buttons
            prevButton.disabled = false;
            nextButton.disabled = false;
            shuffleButton.disabled = false;
            loopButton.disabled = false;
            crossfadeButton.disabled = false;
            autoEQButton.disabled = false;
            djModeButton.disabled = false;
            
            // Save playlist
            savePlaylistToStorage();
            
            // Update smart playlist button
            updateSmartPlaylistButton();

             // ✅ FIX: Update folder metadata after successful load
    if (folderHandle) {
        const hasLyrics = newPlaylist.some(t => t.vtt);
        const hasAnalysis = newPlaylist.some(t => t.analysis || t.hasDeepAnalysis);
        
        await folderPersistence.updateMetadata({
            trackCount: newPlaylist.length,
            hasLyrics: hasLyrics,
            hasAnalysis: hasAnalysis,
            lastAccessed: Date.now()
        });
        
        debugLog(`📁 Folder metadata updated: ${newPlaylist.length} tracks`, 'success');
    }
},
        onProgressiveUpdate: (update) => {
    if (update.phase === 1) {
      // Playlist ready! Show immediately
      playlistRenderer.setPlaylist(update.playlist, 0);
      playlistRenderer.render();
    } else if (update.phase === 2) {
      // Track metadata loaded - update display
      playlistRenderer.render();
    }
  }
        
    });
    
    debugLog('✅ File Loading Manager initialized', 'success');

        // --- Playlist Persistence Functions ---
        function savePlaylistToStorage() {
            try {
                const playlistData = playlist.map(track => ({
                    fileName: track.fileName,
                    metadata: {
                        title: track.metadata?.title,
                        artist: track.metadata?.artist,
                        album: track.metadata?.album,
                        hasMetadata: track.metadata?.hasMetadata,
                        // Note: We can't save blob URLs (they expire), so album art won't persist
                    },
                    hasVTT: !!track.vtt,
                    vttFileName: track.vtt?.name || null
                }));
                
                localStorage.setItem('savedPlaylist', JSON.stringify(playlistData));
                localStorage.setItem('playlistTimestamp', Date.now().toString());
                debugLog(`Playlist saved: ${playlistData.length} tracks`, 'success');
            } catch (error) {
                debugLog(`Failed to save playlist: ${error.message}`, 'error');
            }
        }

        function loadPlaylistFromStorage() {
            try {
                const savedData = localStorage.getItem('savedPlaylist');
                const timestamp = localStorage.getItem('playlistTimestamp');
                
                if (!savedData) {
                    debugLog('No saved playlist found', 'info');
                    return null;
                }
                
                const playlistData = JSON.parse(savedData);
                const savedDate = new Date(parseInt(timestamp));
                
                debugLog(`Found saved playlist from ${savedDate.toLocaleString()}: ${playlistData.length} tracks`, 'info');
                return playlistData;
            } catch (error) {
                debugLog(`Failed to load playlist: ${error.message}`, 'error');
                return null;
            }
        }

        function displaySavedPlaylist(playlistData) {
            // Clear current playlist display
            playlistItems.innerHTML = '';
            
            const header = document.createElement('div');
            header.style.textAlign = 'center';
            header.style.padding = '20px';
            header.style.color = '#ffc107';
            header.innerHTML = `
                <div style="font-size: 1.2em; margin-bottom: 10px;">📋 Saved Playlist Found</div>
                <div style="color: #888; font-size: 0.9em; margin-bottom: 15px;">
                    ${playlistData.length} tracks from previous session
                </div>
                <div style="color: #aaa; font-size: 0.85em; margin-bottom: 20px;">
                    Load the same audio files to continue where you left off
                </div>
            `;
            playlistItems.appendChild(header);
            
            // Display saved tracks
            playlistData.forEach((track, index) => {
                const item = document.createElement('div');
                item.className = 'playlist-item';
                item.style.opacity = '0.6';
                item.style.cursor = 'default';
                
                const numberDiv = document.createElement('div');
                numberDiv.className = 'playlist-item-number';
                numberDiv.textContent = index + 1;
                
                const thumbnail = document.createElement('div');
                thumbnail.className = 'playlist-item-thumbnail';
                thumbnail.innerHTML = '🎵';
                
                const badges = [];
                if (track.hasVTT) badges.push('<span class="badge badge-lyrics">🎤 Lyrics</span>');
                if (track.metadata?.hasMetadata) badges.push('<span class="badge badge-metadata">📝 ID3</span>');
                
                const infoDiv = document.createElement('div');
                infoDiv.className = 'playlist-item-info';
                infoDiv.innerHTML = `
                    <div class="playlist-item-title">${track.metadata?.title || track.fileName}</div>
                    <div class="playlist-item-artist">${track.metadata?.artist || 'Unknown Artist'}</div>
                    ${badges.length > 0 ? `<div class="playlist-item-badges">${badges.join('')}</div>` : ''}
                    <div style="color: #666; font-size: 0.75em; margin-top: 5px;">⚠️ File not loaded</div>
                `;

                // NEW: Add duration if available
    if (track.duration) {
        const durationSpan = document.createElement('span');
        durationSpan.className = 'playlist-item-duration';
        durationSpan.textContent = formatTime(track.duration);
        durationSpan.style.color = '#666';
        durationSpan.style.fontSize = '0.8em';
        durationSpan.style.marginTop = '3px';
        infoDiv.appendChild(durationSpan);
    }
                
                item.appendChild(numberDiv);
                item.appendChild(thumbnail);
                item.appendChild(infoDiv);
                
                playlistItems.appendChild(item);
            });
            
            playlistStatus.textContent = `Saved playlist: ${playlistData.length} tracks (load files to play)`;
        }

        function clearSavedPlaylist() {
            localStorage.removeItem('savedPlaylist');
            localStorage.removeItem('playlistTimestamp');
            debugLog('Saved playlist cleared from storage', 'info');
        }

clearButton.onclick = () => {
    if (confirm('Clear entire playlist? This will stop playback and remove all loaded tracks.')) {
        // Use the manager's cleanup method
        fileLoadingManager.cleanupPlaylist(playlist);
        
        // Clear buffer manager
        if (audioBufferManager) {
            audioBufferManager.clearAllBuffers();
        }
        
        playlist = [];
        currentTrackIndex = -1;
        player.pause();
        player.src = '';
        clearMetadata();
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
playlistRenderer.render();
        updatePlaylistStatus();
        prevButton.disabled = true;
        playlistRenderer.updateJumpButton();
        nextButton.disabled = true;
        shuffleButton.disabled = true;
        loopButton.disabled = true;
        
        clearSavedPlaylist();
        
        debugLog('Playlist cleared (memory freed)', 'warning');
        updateSmartPlaylistButton();
    }
};

    player.addEventListener('error', () => {
       if (currentTrackIndex === -1 || !playlist[currentTrackIndex]) return;
       const trackInfo = playlist[currentTrackIndex];
       const errorInfo = errorRecovery.handleAudioError(player, trackInfo);
       
       if (errorInfo && !errorInfo.hasRecovery) {
           alert(`Cannot play this track: ${errorInfo.errorMessage}`);
       }
   });
        
        player.addEventListener('ended', () => {
            if (loopMode === 'one') {
                debugLog('Looping current track');
                player.currentTime = 0;
                player.play();
            } else {
               playNext();
            }
        });
        
        player.addEventListener('play', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // 🎵 Notify background handler
    if (backgroundAudioHandler) {
        backgroundAudioHandler.updatePlaybackState('playing');
    }
    
    perfManager.setPlayState(true);
    
    if (!visualizerAnimationId) {
        startVisualizer();
    }
    updateMediaSession();

            if (visualizerController) {
        visualizerController.onPlayStateChange();
    }
});

        
player.addEventListener('pause', () => {
    if (audioContext && audioContext.state === 'running') {
        audioContext.suspend();
    }
    
    // 🎵 Notify background handler
    if (backgroundAudioHandler) {
        backgroundAudioHandler.updatePlaybackState('paused');
    }
    
    perfManager.setPlayState(false);
    updateMediaSession();
     if (visualizerController) {
        visualizerController.onPlayStateChange();
    }
        // Cancel crossfade when pausing
    if (crossfadeManager) {
        crossfadeManager.cancelFade();
    }
});

        // Time and Progress Updates (NEW)
        player.addEventListener('loadedmetadata', () => {
            durationDisplay.textContent = formatTime(player.duration);
        });

player.addEventListener('timeupdate', () => {
    if (isSeekingProg) return;
    
    // 🆕 PERFORMANCE-AWARE UPDATES
    if (perfManager.shouldUpdate('progress')) {
        const percent = (player.currentTime / player.duration) * 100;
        progressBar.style.width = `${percent}%`;
        currentTimeDisplay.textContent = formatTime(player.currentTime);
    }
    
    // Update lyrics with performance optimization
    if (lyricsManager && perfManager.shouldUpdate('lyrics')) {
        const lyricsSettings = perfManager.getLyricsSettings();
        lyricsManager.update(player.currentTime, compactMode, lyricsSettings);
    }
    if (visualizerController) {
        visualizerController.onTimeUpdate();
    }
});


        prevButton.onclick = playPrevious;
        nextButton.onclick = playNext;

        shuffleButton.onclick = () => {
    if (playlist.length <= 1) return;
    isShuffled = !isShuffled;
    
    if (isShuffled) {
        debugLog('Shuffle enabled', 'success');
        
        // Get the currently playing track
        const currentTrack = playlist[currentTrackIndex];
        
        // Shuffle the playlist
        shuffleArray(playlist);
        
        // Find where the current track ended up after shuffle
        currentTrackIndex = playlist.findIndex(track => track === currentTrack);
        
        shuffleButton.classList.add('active');
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
playlistRenderer.render();
    } else {
        debugLog('Shuffle disabled');
        shuffleButton.classList.remove('active');
    }
    updatePlaylistStatus();
};

        loopButton.onclick = () => {
            // ... (Your existing loopButton logic here) ...
            if (loopMode === 'off') {
                loopMode = 'all';
                loopButton.textContent = '🔁 Loop All';
                loopButton.classList.add('active');
                debugLog('Loop mode: All tracks', 'success');
            } else if (loopMode === 'all') {
                loopMode = 'one';
                loopButton.textContent = '🔂 Loop One';
                loopButton.classList.remove('active');
                loopButton.classList.add('loop-one');
                debugLog('Loop mode: Current track', 'success');
            } else {
                loopMode = 'off';
                loopButton.textContent = '🔁 Loop Off';
                loopButton.classList.remove('loop-one');
                debugLog('Loop mode: Off');
            }
            updatePlaylistStatus();
        };

    // ✅ CROSSFADE BUTTON
const crossfadeButton = document.getElementById('crossfade-button');
if (crossfadeButton) {
    crossfadeButton.onclick = () => {
        // ✅ ADD THIS CHECK
        if (!crossfadeManager) {
            alert('Please play a track first to initialize the audio system!');
            return;
        }
        
        const newState = !crossfadeManager.enabled;
        crossfadeManager.setEnabled(newState);
        
        crossfadeButton.classList.toggle('active', newState);
        crossfadeButton.textContent = newState ? '🎚️ Crossfade On' : '🎚️ Crossfade Off';
        
        debugLog(`Crossfade ${newState ? 'enabled' : 'disabled'}`, 'info');
    };
}

// ✅ AUTO-EQ BUTTON
const autoEQButton = document.getElementById('auto-eq-button');
if (autoEQButton) {
    autoEQButton.onclick = () => {
        if (currentTrackIndex === -1 || playlist.length === 0) {
            alert('Please load a track first!');
            return;
        }
        
        // Ensure audio system is initialized
        if (!audioContext) {
            setupAudioContext();
        }
        
        // ✅ FIX: Check for the actual dependency (audioPresetsManager)
        if (!audioPresetsManager) {
            alert('Audio system not initialized. Please play the track for a moment first.');
            return;
        }
        
        // ✅ FIX: Create autoEQManager on-demand if needed
        if (!autoEQManager) {
            autoEQManager = new AutoEQManager(audioPresetsManager, debugLog);
            debugLog('✅ Auto-EQ system initialized on-demand', 'success');
        }
        
        const newState = !autoEQManager.enabled;
        autoEQManager.setEnabled(newState);
        
        autoEQButton.classList.toggle('active', newState);
        autoEQButton.textContent = newState ? '🎛️ Auto-EQ On' : '🎛️ Auto-EQ Off';
        
        if (newState && currentTrackIndex !== -1) {
            autoEQManager.applyAutoEQ(playlist[currentTrackIndex]);
        }
        
        debugLog(`Auto-EQ ${newState ? 'enabled' : 'disabled'}`, 'info');
    };
}
    
    // Volume Boost Button
const volumeBoostButton = document.getElementById('volume-boost-button');
if (volumeBoostButton && volumeControl) {
    volumeBoostButton.onclick = () => {
        const currentState = volumeControl.isBoostEnabled();
        volumeControl.setBoost(!currentState, 1.5);
        
        volumeBoostButton.classList.toggle('active', !currentState);
        const label = volumeBoostButton.querySelector('.sidebar-label');
        if (label) {
            label.textContent = !currentState ? 'Boost On' : 'Boost Off';
        }
    };
    
    // Restore state on load
    setTimeout(() => {
        if (volumeControl && volumeControl.isBoostEnabled()) {
            volumeBoostButton.classList.add('active');
            const label = volumeBoostButton.querySelector('.sidebar-label');
            if (label) label.textContent = 'Boost On';
        }
    }, 500);
}


        // Keyboard shortcuts (User's Code)
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    if (player.paused) player.play();
                    else player.pause();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (player.duration) player.currentTime += 5; // Skip 5 seconds
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (player.duration) player.currentTime -= 5; // Rewind 5 seconds
                    break;
                case 'n':
                case 'N':
                    e.preventDefault();
                    if (!nextButton.disabled) playNext();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    if (!prevButton.disabled) playPrevious();
                    break;
                case 'l':
                case 'L':
                    e.preventDefault();
                    if (loopButton && !loopButton.disabled) loopButton.click();
                    break;
                case 'h':
                case 'H':
                    e.preventDefault();
                    if (shuffleButton && !shuffleButton.disabled) shuffleButton.click();
                    break;
                case 'j':
                case 'J':
                    e.preventDefault();
                    const jumpBtn = document.getElementById('jump-to-current');
                    if (jumpBtn && !jumpBtn.disabled) jumpBtn.click();
                    break;
                case '.':
                    e.preventDefault();
                    if (player.duration) player.currentTime += 30; // Jump 30s
                    break;
                case ',':
                    e.preventDefault();
                    if (player.duration) player.currentTime -= 30; // Rewind 30s
                    break;
case 'm':
case 'M':
    volumeControl.toggleMute();
    break;
                    case 'ArrowUp':
    e.preventDefault();
    volumeControl.increaseVolume(0.05);
    break;
case 'ArrowDown':
    e.preventDefault();
    volumeControl.decreaseVolume(0.05);
    break;
case 'b':
case 'B':
    e.preventDefault();
    const currentBoost = volumeControl.isBoostEnabled();
    volumeControl.setBoost(!currentBoost, 1.5);
    break;
                    
                case 'c':
                case 'C':
                    e.preventDefault();
                    compactToggle.click();
                    break;

         case 's':
                case 'S':
                    e.preventDefault();
                    stickyToggle.click();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    if (pipToggle && !pipToggle.disabled) pipToggle.click();
                    break;
            
                case 'o':
case 'O':
    e.preventDefault();
    if (folderButton && !folderButton.disabled) folderButton.click();
    break;
                }
        });

    const clearCacheBtn = document.getElementById('clear-cache-btn');
if (clearCacheBtn) {
    clearCacheBtn.onclick = () => {
        if (confirm('Clear file processing cache?')) {
            fileLoadingManager.clearCache();
            debugLog('Cache cleared', 'success');
        }
    };
}

// Folder Selection Button Handler (ENHANCED WITH PERSISTENCE)
const folderButton = document.getElementById('folder-button');

    folderButton.onclick = async () => {
        // If the button is in needs-permission state, let the dedicated listener handle it
        if (folderButton.classList.contains('needs-permission')) {
            return;
        }

        // Check if File System Access API is supported
        if (!('showDirectoryPicker' in window)) {
            // Mobile fallback: use the file loading manager's fallback
            debugLog('📱 Folder picker not supported, using mobile fallback', 'info');
            try {
                await fileLoadingManager.triggerMobileFolderFallback();
                uiManager.notify('Folder loaded successfully!', 'success');
            } catch (err) {
                debugLog(`Mobile fallback failed: ${err.message}`, 'error');
            }
            return;
        }
    
    try {
        // If the button shows a saved folder but isn't active yet, try loading it
        if (folderButton.classList.contains('has-saved') && !folderButton.classList.contains('active')) {
            const loadResult = await folderPersistence.loadFolderHandle();
            if (loadResult && loadResult.handle) {
                const hasPermission = await folderPersistence.verifyFolderPermission(loadResult.handle, false);
                if (hasPermission.granted) {
                    folderHandle = loadResult.handle;
                    folderButton.classList.remove('has-saved');
                    folderButton.classList.add('active');
                    folderButton.textContent = `📁 ${folderHandle.name} (Click to reload)`;
                    updateFolderButtons();
                    await loadFromFolder();
                    return;
                } else if (hasPermission.needsGesture) {
                    // Trigger the permission request immediately since this is a user click
                    const permissionResult = await folderPersistence.requestFolderPermission(loadResult.handle);
                    if (permissionResult.granted) {
                        folderHandle = loadResult.handle;
                        folderButton.classList.remove('has-saved');
                        folderButton.classList.add('active');
                        folderButton.textContent = `📁 ${folderHandle.name} (Click to reload)`;
                        updateFolderButtons();
                        await loadFromFolder();
                        return;
                    }
                }
            }
        }

        // Check if we have folder history
        const history = await folderPersistence.getHistory();
        const currentMetadata = await folderPersistence.getFolderMetadata();
        
        // If we have history or a current folder, show the modal
        if (history.length > 0 || currentMetadata) {
            showFolderHistoryModal();
            return;
        }
        
        // No history - go straight to folder picker
        await selectNewFolder();
        
    } catch (err) {
        if (err.name === 'AbortError') {
            debugLog('Folder selection cancelled', 'info');
        } else {
            debugLog(`Folder selection failed: ${err.message}`, 'error');
            uiManager.notify(`Failed to access folder: ${err.message}`, 'error');
        }
    }
};

    // Clear Folder Button Handler
const clearFolderButton = document.getElementById('clear-folder-button');

clearFolderButton.onclick = async () => {
    if (confirm('Forget the saved music folder? You\'ll need to select it again next time.')) {
        try {
            await folderPersistence.deleteFolderHandle();
            folderHandle = null;
            
            folderButton.textContent = '📁 Select Music Folder';
            folderButton.classList.remove('active');
            clearFolderButton.style.display = 'none';
            
            debugLog('Folder forgotten', 'success');
        } catch (err) {
            debugLog(`Error clearing folder: ${err.message}`, 'error');
        }
    }
};

// Show/hide clear button based on folder state
function updateFolderButtons() {
    if (folderHandle) {
        clearFolderButton.style.display = 'inline-block';
    } else {
        clearFolderButton.style.display = 'none';
    }
}

    // Folder History Modal Handlers
const folderHistoryModal = document.getElementById('folder-history-modal');
const folderHistoryClose = document.querySelector('.folder-history-close');
const folderHistoryOverlay = document.querySelector('.folder-history-overlay');
const folderHistoryNew = document.getElementById('folder-history-new');
const folderHistoryClear = document.getElementById('folder-history-clear');

if (folderHistoryClose) {
    folderHistoryClose.onclick = closeFolderHistoryModal;
}

if (folderHistoryOverlay) {
    folderHistoryOverlay.onclick = closeFolderHistoryModal;
}

if (folderHistoryNew) {
    folderHistoryNew.onclick = async () => {
        closeFolderHistoryModal();
        await selectNewFolder();
    };
}

if (folderHistoryClear) {
    folderHistoryClear.onclick = async () => {
        if (confirm('Clear all folder history?\n\nThis will not delete your music files, only the history of folders you\'ve accessed.')) {
            await folderPersistence.clearHistory();
            debugLog('Folder history cleared', 'success');
            closeFolderHistoryModal();
        }
    };
}

    // ========== FOLDER HISTORY MODAL FUNCTIONS ==========

async function showFolderHistoryModal() {
    const modal = document.getElementById('folder-history-modal');
    const currentSection = document.getElementById('folder-history-current');
    const historyList = document.getElementById('folder-history-list');
    
    if (!modal) return;
    
    // Get data
    const history = await folderPersistence.getHistory();
    const currentMetadata = await folderPersistence.getFolderMetadata();
    
    // Render current folder section
    if (currentMetadata) {
        const lastAccessed = new Date(currentMetadata.lastAccessed);
        const timeAgo = getTimeAgo(currentMetadata.lastAccessed);
        
        currentSection.className = 'folder-history-current';
        currentSection.innerHTML = `
            <h3>✅ Current Folder</h3>
            <div class="folder-item-info">
                <div class="folder-item-name">${currentMetadata.folderName}</div>
                <div class="folder-item-details">
                    <span class="folder-item-stat">🎵 ${currentMetadata.trackCount} tracks</span>
                    ${currentMetadata.hasLyrics ? '<span class="folder-item-stat">🎤 Has lyrics</span>' : ''}
                    ${currentMetadata.hasAnalysis ? '<span class="folder-item-stat">📊 Has analysis</span>' : ''}
                </div>
                <div class="folder-item-date">Last accessed: ${lastAccessed.toLocaleString()} (${timeAgo})</div>
            </div>
        `;
    } else {
        currentSection.className = 'folder-history-current empty';
        currentSection.innerHTML = `
            <h3>No Folder Currently Loaded</h3>
            <p style="color: #888; margin: 10px 0 0 0;">Select a recent folder below or browse for a new one</p>
        `;
    }
    
    // Render history list
    if (history.length > 0) {
        historyList.innerHTML = '';
        
        history.forEach((entry) => {
            const date = new Date(entry.timestamp);
            const timeAgo = getTimeAgo(entry.timestamp);
            const isCurrent = currentMetadata && entry.folderName === currentMetadata.folderName;
            
            const item = document.createElement('div');
            item.className = `folder-history-item ${isCurrent ? 'current' : ''}`;
            
            item.innerHTML = `
                <div class="folder-item-info">
                    <div class="folder-item-name">
                        ${entry.folderName}
                        ${isCurrent ? '<span class="folder-item-current-badge">CURRENT</span>' : ''}
                    </div>
                    <div class="folder-item-details">
                        <span class="folder-item-stat">🎵 ${entry.trackCount} tracks</span>
                        ${entry.hasLyrics ? '<span class="folder-item-stat">🎤 Lyrics</span>' : ''}
                        ${entry.hasAnalysis ? '<span class="folder-item-stat">📊 Analysis</span>' : ''}
                    </div>
                </div>
                <div class="folder-item-date">${date.toLocaleDateString()}<br>${timeAgo}</div>
            `;
            
            // Only clickable if not current
            if (!isCurrent) {
                item.style.cursor = 'pointer';
                item.onclick = async () => {
                    // Try to reload this folder by name
                    // Since we don't store handles for old folders, we need to prompt user
                    if (confirm(`Load "${entry.folderName}"?\n\nYou'll need to select this folder again to grant permission.`)) {
                        modal.style.display = 'none';
                        await selectNewFolder(entry.folderName);
                    }
                };
            }
            
            historyList.appendChild(item);
        });
    } else {
        historyList.innerHTML = `
            <div class="folder-history-empty">
                <div class="folder-history-empty-icon">📁</div>
                <p>No recent folders</p>
            </div>
        `;
    }
    
    // Show modal
    modal.style.display = 'flex';
}

function closeFolderHistoryModal() {
    const modal = document.getElementById('folder-history-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function selectNewFolder(expectedName = null) {
    try {
        // Fallback for mobile/unsupported browsers
        if (!('showDirectoryPicker' in window)) {
            debugLog('📱 Using mobile folder selection fallback', 'info');
            const result = await fileLoadingManager.triggerMobileFolderFallback();
            if (result && result.success) {
                uiManager.notify('Folder loaded successfully!', 'success');
            }
            return;
        }

        debugLog('Requesting folder access...', 'info');
        
        // Ask user to select a folder
        const handle = await window.showDirectoryPicker({
            mode: 'read',
            startIn: 'music'
        });
        
        // If we expected a specific folder, verify it matches
        if (expectedName && handle.name !== expectedName) {
            if (!confirm(`You selected "${handle.name}" but expected "${expectedName}".\n\nContinue with "${handle.name}"?`)) {
                return;
            }
        }
        
        debugLog(`Folder selected: ${handle.name}`, 'success');
        
        // ✅ FIX: Save with basic metadata immediately
        const saveResult = await folderPersistence.saveFolderHandle(handle, {
            trackCount: 0, // Will be updated after loading
            hasLyrics: false,
            hasAnalysis: false,
            totalSize: 0
        });
        
        if (!saveResult.success) {
            debugLog(`Failed to save folder: ${saveResult.error}`, 'error');
        }
        
        // Update global folderHandle
        folderHandle = handle;
        
        // Update button to show folder is selected
        folderButton.textContent = `📁 ${handle.name} (Click to reload)`;
        folderButton.classList.add('active');
        
        // Update button visibility
        updateFolderButtons();
        
        // Immediately load files from the folder
        await loadFromFolder();
        
    } catch (err) {
        if (err.name === 'AbortError') {
            debugLog('Folder selection cancelled', 'info');
        } else {
            debugLog(`Folder selection failed: ${err.message}`, 'error');
            uiManager.notify(`Failed to access folder: ${err.message}`, 'error');
        }
    }
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
    return `${Math.floor(seconds / 2592000)} months ago`;
}

// ========== END FOLDER HISTORY MODAL FUNCTIONS ==========

// Call this whenever folder state changes

// NEW: Function to Load Files from Selected Folder
async function loadFromFolder() {
    if (!folderHandle) {
        alert('No folder selected. Please click "Select Music Folder" first.');
        return;
    }
    
    try {
        await fileLoadingManager.loadFromFolderHandle(folderHandle);
        uiManager.notify('Folder loaded successfully!', 'success');
    } catch (err) {
        debugLog(`Error loading folder: ${err.message}`, 'error');
        uiManager.notify(`Failed to load folder: ${err.message}`, 'error');
        playlistStatus.textContent = 'Failed to load folder';
    }
}

    // Auto-reload checkbox setup
const autoReloadCheck = document.getElementById('auto-reload-check');
const autoReloadLabel = document.getElementById('auto-reload-label');

// Load preference
const autoReload = localStorage.getItem('autoReloadFolder') !== 'false';
autoReloadCheck.checked = autoReload;
        
        // Initial setup
        window.addEventListener('load', async () => {
    // Wait for folder persistence to be ready
    await folderPersistence.initPromise;
    
    // Check if we have a saved folder
    const hasSaved = folderPersistence.hasSavedFolder();
    const quickInfo = folderPersistence.getQuickInfo();
    
    // ✅ DEBUG: Check persistence state
    console.log('=== FOLDER PERSISTENCE DEBUG ===');
    console.log('Has saved folder:', hasSaved);
    console.log('Quick info:', quickInfo);
    console.log('Auto-reload enabled:', autoReloadCheck.checked);
    
    // Show checkbox if folder is saved
    if (hasSaved) {
        autoReloadLabel.style.display = 'inline-block';
        if (quickInfo) {
            folderButton.textContent = `📁 ${quickInfo.name} (Click to load)`;
            folderButton.classList.add('has-saved');
        }
    }

    // Save preference on change
    autoReloadCheck.onchange = () => {
        localStorage.setItem('autoReloadFolder', autoReloadCheck.checked);
    };

    // NEW: Check if we have a saved folder and auto-load it
    if (autoReload && hasSaved) {
        debugLog('Checking for saved folder...', 'info');
        
        try {
            // ✅ CRITICAL: Ensure all systems ready before loading
            await new Promise(resolve => {
                if (fileLoadingManager && metadataParser && analyzer) {
                    resolve();
                } else {
                    // Wait up to 2 seconds for initialization
                    let attempts = 0;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (fileLoadingManager && metadataParser && analyzer) {
                            clearInterval(checkInterval);
                            resolve();
                        } else if (attempts > 20) {
                            clearInterval(checkInterval);
                            resolve(); // Give up and try anyway
                        }
                    }, 100);
                }
            });
            
            const loadResult = await folderPersistence.loadFolderHandle();
            console.log('Loaded from DB:', loadResult);
            
            if (loadResult && loadResult.handle) {
                const { handle, metadata } = loadResult;
                
                debugLog(`Found saved folder: ${handle.name}`, 'info');
                
                const hasPermission = await folderPersistence.verifyFolderPermission(handle, false);
                
                if (hasPermission.granted) {
                    folderHandle = handle;
                    folderButton.textContent = `📁 ${folderHandle.name} (Click to reload)`;
                    folderButton.classList.add('active');
                    
                    updateFolderButtons();
                    
                    debugLog('Auto-loading music from saved folder...', 'success');
                    
                    // ✅ FIX: Longer delay to ensure everything is ready
                    setTimeout(async () => {
                        await loadFromFolder();
                    }, 1000); // Increased from 500ms
                    
                } else if (hasPermission.needsGesture) {
                    // Permission needs to be requested with user gesture (Windows requirement)
                    folderHandle = handle;
                    folderButton.textContent = `📁 ${handle.name} (Click to grant access)`;
                    folderButton.classList.add('needs-permission');
                    
                    // Create a one-time click handler to request permission
                    const requestPermissionHandler = async () => {
                        debugLog('Requesting folder permission...', 'info');
                        const permissionResult = await folderPersistence.requestFolderPermission(handle);
                        
                        if (permissionResult.granted) {
                            folderButton.textContent = `📁 ${handle.name} (Click to reload)`;
                            folderButton.classList.remove('needs-permission');
                            folderButton.classList.add('active');
                            folderButton.removeEventListener('click', requestPermissionHandler);
                            
                            updateFolderButtons();
                            
                            debugLog('Permission granted! Loading music...', 'success');
                            await loadFromFolder();
                        } else {
                            debugLog('Permission denied', 'error');
                            folderPersistence.deleteFolderHandle();
                            folderButton.textContent = '📁 Select Music Folder';
                            folderButton.classList.remove('needs-permission');
                            folderButton.removeEventListener('click', requestPermissionHandler);
                        }
                    };
                    
                    folderButton.addEventListener('click', requestPermissionHandler);
                    playlistStatus.textContent = `Click "📁 ${handle.name}" to grant access and load music`;
                } else {
                    debugLog('Permission denied for saved folder', 'warning');
                    folderPersistence.deleteFolderHandle();
                    
                    playlistStatus.textContent = `Previous folder "${handle.name}" needs permission - click "📁 Select Music Folder" to reload`;
                }
            } else {
                console.log('ℹ️ No handle found in DB even though localStorage says it exists');
            }
        } catch (err) {
            debugLog(`Error loading saved folder: ${err.message}`, 'error');
            folderPersistence.deleteFolderHandle();
        }
    }
    console.log('=== END DEBUG ===');
            
    if (typeof jsmediatags !== 'undefined') {
        debugLog('✅ jsmediatags library loaded successfully', 'success');
    } else {
        debugLog('⚠️ jsmediatags library not available - using manual parser', 'warning');
    }
    
    // ADD THESE CHECKS:
    console.log('PiP supported?', document.pictureInPictureEnabled);
    console.log('PiP button disabled?', pipToggle.disabled);
    console.log('PiP button onclick:', pipToggle.onclick ? 'attached' : 'NOT ATTACHED');
    
            // Check for saved playlist
            const savedPlaylist = loadPlaylistFromStorage();
            if (savedPlaylist && savedPlaylist.length > 0) {
                displaySavedPlaylist(savedPlaylist);
            }
            
            // Check if player can be played (e.g. if muted)
            player.play().catch(e => debugLog(`Autoplay blocked: ${e.message}`, 'warning'));
        });

      // --- Page Visibility Optimization ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden - pause expensive operations
        debugLog('Page hidden - reducing CPU usage', 'info');
        stopVisualizer();
        
        // Suspend audio context if not playing
        if (audioContext && audioContext.state === 'running' && player.paused) {
            audioContext.suspend();
        }
    } else {
        // Page is visible again
        debugLog('Page visible - resuming', 'info');
        
        // Resume visualizer only if playing and in full mode
        if (!player.paused && perfManager.shouldRunVisualizer() && !visualizerAnimationId) {
            startVisualizer();
        }
        
        // Resume audio context if needed
        if (audioContext && audioContext.state === 'suspended' && !player.paused) {
            audioContext.resume();
        }
    }
});
        
// --- Advanced Compact Mode System ---
        const compactToggle = document.getElementById('compact-toggle');
        
        // Elements to control
        const compactElements = {
            visualizer: document.getElementById('player-wrapper'),
            eq: document.getElementById('equalizer-control'),
            lyrics: document.getElementById('lyrics-display'),
            playlist: document.getElementById('playlist-container'),
            volume: document.getElementById('volume-control'),
            progress: document.getElementById('custom-progress-container'),
            time: document.getElementById('time-display')
        };
        
function setCompactMode(mode) {
    debugLog(`Switching to ${mode} mode`, 'info');
    compactMode = mode;
    
    // OPTIMIZATION: Notify performance manager
    perfManager.setMode(mode);
    
    // Show temporary indicator
    const indicator = document.getElementById('mode-indicator');
            if (indicator) {
                const modeNames = {
                    'full': '📐 Full View',
                    'compact': '📐 Compact Mode',
                    'mini': '📐 Mini Mode'
                };
                
                indicator.textContent = modeNames[mode];
                indicator.style.display = 'block';
                indicator.style.opacity = '1';
                
                // Fade out after 2 seconds
                setTimeout(() => {
                    indicator.style.opacity = '0';
                    setTimeout(() => indicator.style.display = 'none', 300);
                }, 2000);
            }
            
            // Remove all mode classes
            document.body.classList.remove('compact-mode', 'mini-mode');
            compactToggle.classList.remove('compact', 'mini');
            
            switch(mode) {
                case 'full':
    // Show everything
    Object.values(compactElements).forEach(el => {
        if (el) {
            el.classList.remove('compact-hidden');
            el.style.display = '';
        }
    });
    
    compactToggle.textContent = '🔍 Full View';
    visualizerEnabled = true; // Enable visualizer
                    
                    compactToggle.textContent = '📐 Full View';
                    
                    // Restart visualizer if enabled and playing
                    if (visualizerEnabled && !player.paused) {
                        startVisualizer();
                    }
                    
                    debugLog('Full view: All features visible', 'success');
                    break;
                    
                case 'compact':
    document.body.classList.add('compact-mode');
    compactToggle.classList.add('compact');
                    
                    if (compactElements.visualizer) compactElements.visualizer.classList.add('compact-hidden');
                    if (compactElements.eq) compactElements.eq.classList.add('compact-hidden');
                    if (compactElements.lyrics) compactElements.lyrics.classList.add('compact-hidden');
                    visualizerEnabled = false; // Disable visualizer
    stopVisualizer();
                    
                    // Show everything else
                    if (compactElements.playlist) compactElements.playlist.classList.remove('compact-hidden');
                    if (compactElements.volume) compactElements.volume.classList.remove('compact-hidden');
                    if (compactElements.progress) compactElements.progress.classList.remove('compact-hidden');
                    if (compactElements.time) compactElements.time.classList.remove('compact-hidden');
                    
                   compactToggle.textContent = '📐 Compact';
    debugLog('Compact mode: Player essentials only', 'success');
    break;
                    
               case 'mini':
    document.body.classList.add('mini-mode');
    compactToggle.classList.add('mini');
    
    visualizerEnabled = false; // Disable visualizer
                    
                    Object.entries(compactElements).forEach(([key, el]) => {
                        if (el && key !== 'progress') { // Keep progress bar
                            el.classList.add('compact-hidden');
                        }
                    });
                    
                    // Keep progress bar visible in mini mode
                    if (compactElements.progress) compactElements.progress.classList.remove('compact-hidden');
                    
                    compactToggle.textContent = '📐 Mini';
                    
                    stopVisualizer();
                    debugLog('Mini mode: Now playing only (saves maximum CPU)', 'success');
                    break;
            }
            
            // Save preference
            localStorage.setItem('compactMode', mode);
        }
        
        // Cycle through modes
        compactToggle.onclick = () => {
            const modes = ['full', 'compact', 'mini'];
            const currentIndex = modes.indexOf(compactMode);
            const nextMode = modes[(currentIndex + 1) % modes.length];
            setCompactMode(nextMode);
        };
        
        // Load saved preference
        const savedCompactMode = localStorage.getItem('compactMode');
        if (savedCompactMode && ['full', 'compact', 'mini'].includes(savedCompactMode)) {
            setCompactMode(savedCompactMode);
        }

// --- Picture-in-Picture Mode (Chrome OS COMPLETE FIX) ---
let pipWindow = null;
let pipCanvas = null;
let pipAnimationId = null;
let currentPipVideo = null;

// PiP Support Check
if (!document.pictureInPictureEnabled) {
    pipToggle.disabled = true;
    pipToggle.title = 'Picture-in-Picture not supported in this browser';
    debugLog('Picture-in-Picture not supported', 'warning');
} else {
    pipToggle.onclick = async () => {
        console.log('PiP button clicked - Chrome OS Complete Fix');

        try {
            if (currentTrackIndex === -1 || playlist.length === 0) {
                alert('Please load a track first!');
                return;
            }

            // EXIT MODE
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                cleanupPip();
                return;
            }

            // ENTER MODE - Try multiple approaches
            if (!player.src) {
                alert('Please load and play a track first!');
                return;
            }

            debugLog('Starting PiP activation sequence...', 'info');

            // Strategy 1: Try main video element first (most reliable)
            try {
                await attemptMainVideoPip();
                return; // Success!
            } catch (mainError) {
                debugLog(`Main video PiP failed: ${mainError.message}`, 'warning');
            }

            // Strategy 2: Try fallback with custom video
            try {
                await attemptFallbackPip();
                return; // Success!
            } catch (fallbackError) {
                debugLog(`Fallback PiP failed: ${fallbackError.message}`, 'warning');
            }

            // Strategy 3: Final attempt with audio-only minimal approach
            try {
                await attemptAudioOnlyPip();
                return; // Success!
            } catch (audioError) {
                debugLog(`Audio-only PiP failed: ${audioError.message}`, 'error');
                throw new Error('All PiP methods failed. Please try playing the track for a few seconds first.');
            }

        } catch (err) {
            debugLog(`All PiP methods failed: ${err.message}`, 'error');
            alert(`Picture-in-Picture failed: ${err.message}`);
        }
    };

    // STRATEGY 1: Use main video element
    async function attemptMainVideoPip() {
        debugLog('Attempting PiP with main video element...', 'info');
        
        const mainVideo = document.getElementById('audio-player');
        
        if (!mainVideo.src) {
            throw new Error('No audio source loaded');
        }

        // Ensure video is ready
        if (mainVideo.readyState < 1) {
            // Force load if needed
            mainVideo.load();
            await new Promise(resolve => {
                const onCanPlay = () => {
                    mainVideo.removeEventListener('canplay', onCanPlay);
                    resolve();
                };
                mainVideo.addEventListener('canplay', onCanPlay);
                setTimeout(resolve, 2000); // Timeout after 2 seconds
            });
        }

        await mainVideo.requestPictureInPicture();
        currentPipVideo = mainVideo;
        
        pipToggle.textContent = '📺 Unfloat';
        document.body.classList.add('pip-active');
        debugLog('Main video PiP activated successfully', 'success');
        
        setupPipVisualizer();
    }

    // STRATEGY 2: Fallback with custom video
    async function attemptFallbackPip() {
        debugLog('Attempting fallback PiP...', 'info');
        
        const fallbackVideo = document.createElement('video');
        fallbackVideo.style.display = 'none';
        fallbackVideo.muted = true; // Critical for Chrome OS
        fallbackVideo.playsInline = true;
        document.body.appendChild(fallbackVideo);
        
        // Create a simple video stream
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        
        // Draw initial frame with track info
        drawPipFrame(ctx, canvas.width, canvas.height, true);
        
        const stream = canvas.captureStream(5); // Low FPS for stability
        fallbackVideo.srcObject = stream;
        
        // Wait for metadata with robust error handling
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanupVideo(fallbackVideo);
                reject(new Error('Timeout waiting for video metadata'));
            }, 5000);
            
            fallbackVideo.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
            
            fallbackVideo.addEventListener('error', (err) => {
                clearTimeout(timeout);
                cleanupVideo(fallbackVideo);
                reject(new Error(`Video error: ${err.message}`));
            }, { once: true });
            
            fallbackVideo.load();
        });
        
        // Try to play
        try {
            await fallbackVideo.play();
        } catch (playErr) {
            debugLog('Fallback video play warning (continuing anyway)', 'warning');
        }
        
        // Extra delay for Chrome OS
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Request PiP
        await fallbackVideo.requestPictureInPicture();
        currentPipVideo = fallbackVideo;
        
        pipToggle.textContent = '📺 Unfloat';
        document.body.classList.add('pip-active');
        debugLog('Fallback PiP activated', 'success');
        
        // Set up visual updates for the canvas
        startPipCanvasUpdates(canvas);
        
        // Clean up when PiP ends
        fallbackVideo.addEventListener('leavepictureinpicture', () => {
            cleanupVideo(fallbackVideo);
            cleanupPip();
        }, { once: true });
    }

    // STRATEGY 3: Audio-only minimal approach (NEW - INTEGRATED)
    async function attemptAudioOnlyPip() {
        debugLog('Attempting audio-only PiP...', 'info');
        
        const track = playlist[currentTrackIndex];
        const status = `${track.metadata?.title || 'Playing'} - ${track.metadata?.artist || 'Unknown Artist'}`;
        
        // Create the simplest possible video element
        const video = document.createElement('video');
        video.style.display = 'none';
        video.muted = true; // Critical for Chrome OS
        video.playsInline = true;
        
        // Create a tiny, single-color video stream
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 2, 2);
        
        // Ultra low FPS - just enough to keep the stream alive
        const stream = canvas.captureStream(0.1);
        
        video.srcObject = stream;
        document.body.appendChild(video);
        
        // Wait with multiple fallback strategies
        await new Promise((resolve, reject) => {
            if (video.readyState >= 1) {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                video.removeEventListener('loadedmetadata', resolve);
                cleanupVideo(video);
                reject(new Error('Audio-only PiP timeout'));
            }, 3000);
            
            video.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
            
            video.addEventListener('error', (err) => {
                clearTimeout(timeout);
                cleanupVideo(video);
                reject(new Error(`Audio-only video error: ${err.message}`));
            }, { once: true });
            
            video.load();
        });
        
        // Try to play (not critical for audio-only)
        try {
            await video.play();
        } catch (e) {
            debugLog('Audio-only PiP video play failed (continuing)', 'warning');
        }
        
        // Extra delay for Chrome OS
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Request PiP
        await video.requestPictureInPicture();
        currentPipVideo = video;
        
        pipToggle.textContent = '📺 Unfloat';
        document.body.classList.add('pip-active');
        debugLog('Audio-only PiP activated successfully', 'success');
        
        // Set up title updates since we can't draw to the tiny canvas
        setupPipTitleUpdates();
        
        // Clean up when PiP ends
        video.addEventListener('leavepictureinpicture', () => {
            cleanupVideo(video);
            cleanupPip();
        }, { once: true });
        
        return video;
    }

    // Helper function to draw PIP frame
    function drawPipFrame(ctx, width, height, isInitial = false) {
        const track = playlist[currentTrackIndex];
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        if (track) {
            // Track info
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Segoe UI, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(track.metadata?.title || 'Now Playing', width/2, 80);
            
            ctx.fillStyle = '#888888';
            ctx.font = '18px Segoe UI, Arial, sans-serif';
            ctx.fillText(track.metadata?.artist || 'Unknown Artist', width/2, 110);
            
            // Progress
            ctx.fillStyle = '#dc3545';
            ctx.font = '16px Segoe UI, Arial, sans-serif';
            const current = formatTime(player.currentTime);
            const total = formatTime(player.duration);
            ctx.fillText(`${current} / ${total}`, width/2, 140);
            
            // Visualizer if available and playing
            if (!player.paused && analyser && dataArray && !isInitial) {
                analyser.getByteFrequencyData(dataArray);
                const barCount = 20;
                const barWidth = (width - 100) / barCount;
                const startX = 50;
                
                for (let i = 0; i < barCount; i++) {
                    const dataIndex = Math.floor((i / barCount) * bufferLength);
                    const v = dataArray[dataIndex] / 255;
                    const h = v * 80;
                    const x = startX + (i * barWidth);
                    const y = height - 60 - h;
                    
                    const hue = (i / barCount) * 20 + 340;
                    ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
                    ctx.fillRect(x, y, barWidth - 2, h);
                }
            } else {
                // Show play state
                ctx.fillStyle = '#666666';
                ctx.font = '20px Segoe UI, Arial, sans-serif';
                ctx.fillText(player.paused ? '⏸ Paused' : '▶ Playing', width/2, height/2 + 40);
            }
        }
    }

    // Start canvas updates for fallback PIP
    function startPipCanvasUpdates(canvas) {
        if (pipAnimationId) {
            cancelAnimationFrame(pipAnimationId);
        }
        
        const ctx = canvas.getContext('2d');
        
        function updateCanvas() {
            if (!document.pictureInPictureElement) {
                cleanupPip();
                return;
            }
            
            drawPipFrame(ctx, canvas.width, canvas.height);
            pipAnimationId = requestAnimationFrame(updateCanvas);
        }
        
        pipAnimationId = requestAnimationFrame(updateCanvas);
    }

    // Setup title updates for audio-only PIP
    function setupPipTitleUpdates() {
        if (pipAnimationId) {
            clearInterval(pipAnimationId);
        }
        
        pipAnimationId = setInterval(updatePipTitle, 2000);
    }

    function updatePipTitle() {
        if (!document.pictureInPictureElement) {
            cleanupPip();
            return;
        }
        
        const track = playlist[currentTrackIndex];
        if (track) {
            const title = track.metadata?.title || track.fileName;
            const artist = track.metadata?.artist || 'Unknown Artist';
            const currentTime = formatTime(player.currentTime);
            const duration = formatTime(player.duration);
            const state = player.paused ? '⏸' : '▶';
            
            document.title = `${state} ${title} - ${artist} [${currentTime}/${duration}]`;
        }
    }

    function setupPipVisualizer() {
        // For main video PIP, we can only update the title
        setupPipTitleUpdates();
    }

       function cleanupVideo(video) {
       if (!video) return;
       
       try {
           // Stop all media streams
           if (video.srcObject) {
               video.srcObject.getTracks().forEach(track => {
                   track.stop();
                   debugLog(`Stopped track: ${track.kind}`, 'info');
               });
               video.srcObject = null;
           }
           
           // Clear source
           if (video.src) {
               video.src = '';
               video.load(); // Important: release resources
           }
           
           // Remove from DOM
           if (video.parentNode) {
               video.parentNode.removeChild(video);
           }
       } catch (err) {
           debugLog(`Video cleanup error: ${err.message}`, 'error');
       }
   }

    function cleanupPip() {
        if (currentPipVideo && currentPipVideo !== player) {
            cleanupVideo(currentPipVideo);
        }
        currentPipVideo = null;
        
        if (pipAnimationId) {
            if (typeof pipAnimationId === 'number') {
                cancelAnimationFrame(pipAnimationId);
            } else {
                clearInterval(pipAnimationId);
            }
            pipAnimationId = null;
        }
        
        pipToggle.textContent = '📺 Float';
        document.body.classList.remove('pip-active');
        document.title = 'Ultimate Local Music Player';
        
        debugLog('PiP fully cleaned up', 'info');
    }

    // PiP exit handler
    document.addEventListener('leavepictureinpicture', () => {
        cleanupPip();
    });
}



        // --- Sticky Mini Player ---
        const stickyToggle = document.getElementById('sticky-toggle');
        const stickyClose = document.querySelector('.sticky-close');
        let isStickyEnabled = false;
        
        function toggleSticky(enable) {
            isStickyEnabled = enable;
            
            if (enable) {
                document.body.classList.add('sticky-mini');
                stickyToggle.classList.add('active');
                stickyToggle.textContent = '📍 Sticky On';
                if (stickyClose) stickyClose.style.display = 'flex';
                
                // Auto-switch to mini mode for best experience
                if (compactMode !== 'mini') {
                    setCompactMode('mini');
                }
                
                debugLog('Sticky mini player enabled', 'success');
            } else {
                document.body.classList.remove('sticky-mini');
                stickyToggle.classList.remove('active');
                stickyToggle.textContent = '📍 Sticky Off';
                if (stickyClose) stickyClose.style.display = 'none';
                
                debugLog('Sticky mini player disabled', 'info');
            }
            
            // Save preference
            localStorage.setItem('stickyMode', enable ? 'true' : 'false');
        }
        
        stickyToggle.onclick = () => {
            toggleSticky(!isStickyEnabled);
        };
        
        // Close button
        if (stickyClose) {
            stickyClose.onclick = (e) => {
                e.stopPropagation(); // Prevent clicking through to metadata
                toggleSticky(false);
            };
        }
        
        // Load saved preference
        const savedSticky = localStorage.getItem('stickyMode');
        if (savedSticky === 'true') {
            toggleSticky(true);
        }
        
        // Keyboard shortcut: 'S' for sticky
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                stickyToggle.click();
            }
        });


// Populate preset dropdown - will be called after audioPresetsManager is created
function populatePresetDropdown() {
    const presetSelect = document.getElementById('eq-preset-select');
    if (presetSelect && audioPresetsManager) {
        // Clear existing options first
        presetSelect.innerHTML = '<option value="">Select Preset...</option>';
        
        const presets = audioPresetsManager.getPresetList();
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name;
            option.title = preset.description;
            presetSelect.appendChild(option);
        });
        
        presetSelect.onchange = (e) => {
            if (e.target.value) {
                audioPresetsManager.applyPreset(e.target.value);
            }
        };
        
        debugLog('EQ preset dropdown populated', 'success');
    }
} 

    // ========== METADATA EDITOR INTEGRATION ==========

function openMetadataEditorForTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    
    const track = playlist[index];
    const currentMetadata = track.metadata || {
        title: track.fileName,
        artist: 'Unknown Artist',
        album: 'Unknown Album'
    };
    
    metadataEditor.openEditor(index, currentMetadata, (trackIndex, newMetadata) => {
        // Save to custom metadata store
        const file = playlist[trackIndex].fileName;
        const size = playlist[trackIndex].duration || 0; // Use duration as size proxy
        
        customMetadataStore.save(file, size, newMetadata);
        
        // Update playlist entry
        playlist[trackIndex].metadata = {
            ...playlist[trackIndex].metadata,
            ...newMetadata,
            hasMetadata: true
        };
        
        // Re-render playlist to show changes
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
playlistRenderer.render();
        
        // If this is the currently playing track, update display
        if (trackIndex === currentTrackIndex) {
            displayMetadata(playlist[trackIndex].metadata);
        }
        
        // Save playlist with new metadata
        savePlaylistToStorage();
        
        debugLog(`✅ Metadata updated and saved for track ${trackIndex + 1}`, 'success');
    });
}

// ========== END METADATA EDITOR INTEGRATION ==========

// NOTE: crossfadeManager will be initialized later in setupAudioContext
crossfadeManager = null; // Initialize as null first
debugLog('âœ… Advanced systems prepared', 'success');

// Load saved preferences (with null checks)
const savedCrossfade = localStorage.getItem('crossfadeEnabled') === 'true';
const savedAutoEQ = localStorage.getItem('autoEQEnabled') === 'true';
if (savedCrossfade && crossfadeManager) crossfadeManager.setEnabled(true);
if (savedAutoEQ && autoEQManager) autoEQManager.setEnabled(true);

const autoLyricsToggle = document.getElementById('auto-lyrics-toggle');
const savedAutoLyrics = localStorage.getItem('autoLyricsEnabled') === 'true';

if (autoLyricsToggle) {
    autoLyricsToggle.checked = savedAutoLyrics;
    autoLyricsToggle.onchange = () => {
        localStorage.setItem('autoLyricsEnabled', autoLyricsToggle.checked);
        if (autoLyricsToggle.checked) {
            uiManager.showToast("Auto-Lyrics Enabled (Requires Internet)", "success");
        }
    };
}

    // Auto-fetch lyrics button
const autoLyricsBtn = document.getElementById('auto-lyrics-btn');

if (autoLyricsBtn) {
    autoLyricsBtn.onclick = () => {
        window.open('lyrics-fetcher.html', '_blank');
    };
}

    // Deep Analysis Tool button
const deepAnalysisBtn = document.getElementById('deep-analysis-btn');

if (deepAnalysisBtn) {
    deepAnalysisBtn.onclick = () => {
        window.open('deep-music-analysis.html', '_blank');
    };
}
    

// ========== BACKGROUND MUSIC ANALYSIS ==========
// REPLACE the entire startBackgroundAnalysis function with this:
async function startBackgroundAnalysis() {
    if (backgroundAnalysisRunning) return;
    if (playlist.length === 0) return;
    
    backgroundAnalysisRunning = true;
    debugLog('🔍 Starting parallel background analysis...', 'info');
    
    // Get tracks that need analysis
    const needsAnalysis = playlist
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => !track.hasDeepAnalysis && !track.analysis);
    
    if (needsAnalysis.length === 0) {
        debugLog('✅ All tracks already analyzed', 'success');
        backgroundAnalysisRunning = false;
        return;
    }
    
    debugLog(`📊 Analyzing ${needsAnalysis.length} tracks in parallel...`, 'info');
    
    // Process in batches of 3 (parallel)
    const batchSize = 3;
    let analyzedCount = 0;
    
    for (let i = 0; i < needsAnalysis.length; i += batchSize) {
        const batch = needsAnalysis.slice(i, i + batchSize);
        
        // Process batch in parallel
        const promises = batch.map(async ({ track, index }) => {
            try {
                const response = await fetch(track.audioURL);
                const blob = await response.blob();
                const file = new File([blob], track.fileName, { type: 'audio/mpeg' });
                
                const analysis = await analyzer.analyzeTrack(file, track.fileName);
                
                // Save to playlist
                playlist[index].analysis = analysis;
                analyzedCount++;
                
                // Update visualizer if this is the current track
                if (index === currentTrackIndex) {
                    visualizerManager.setTrackAnalysis(analysis);
                    debugLog('🎨 Current track visualizer upgraded!', 'success');
                }
                
                return { success: true, index };
            } catch (err) {
                debugLog(`Analysis failed for ${track.fileName}: ${err.message}`, 'error');
                return { success: false, index };
            }
        });
        
        // Wait for batch to complete
        await Promise.all(promises);
        
        // Update UI after each batch
        playlistRenderer.setPlaylist(playlist, currentTrackIndex);
        playlistRenderer.render();
        
        // Save progress every batch
        if (analyzedCount % batchSize === 0) {
            analyzer.saveAnalysesToStorage();
            debugLog(`💾 Saved ${analyzedCount}/${needsAnalysis.length} analyses`, 'info');
        }
        
        // Small delay between batches to avoid blocking UI
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Final save
    if (analyzedCount > 0) {
        analyzer.saveAnalysesToStorage();
        debugLog(`✅ Background analysis complete! ${analyzedCount} tracks analyzed`, 'success');
    }
    
    backgroundAnalysisRunning = false;
}
// ========== END BACKGROUND ANALYSIS ==========

    // Storage stats button
const storageStatsBtn = document.getElementById('storage-stats-btn');
if (storageStatsBtn) {
    storageStatsBtn.onclick = async () => {
        const stats = await folderPersistence.getStats();
        
        if (stats) {
            const history = await folderPersistence.getHistory();
            
            let message = `💾 STORAGE INFORMATION\n\n`;
            message += `Used: ${folderPersistence.formatBytes(stats.storageUsed)}\n`;
            message += `Available: ${folderPersistence.formatBytes(stats.storageQuota)}\n`;
            message += `Usage: ${stats.percentUsed}%\n\n`;
            
            if (stats.hasSavedFolder) {
                message += `📁 CURRENT FOLDER\n`;
                message += `Name: ${stats.folderName}\n`;
                message += `Tracks: ${stats.trackCount}\n`;
                message += `Last accessed: ${new Date(stats.lastAccessed).toLocaleString()}\n\n`;
            }
            
            if (history.length > 0) {
                message += `📚 RECENT FOLDERS (${history.length})\n`;
                history.slice(0, 5).forEach((entry, i) => {
                    const date = new Date(entry.timestamp).toLocaleDateString();
                    message += `${i + 1}. ${entry.folderName} (${entry.trackCount} tracks) - ${date}\n`;
                });
            }
            
            alert(message);
        } else {
            alert('Unable to retrieve storage information.');
        }
    };
}

    // ========== FALLBACK AUDIO DATA FUNCTION ==========
window.getAudioDataForVisualizer = () => {
    // Try to get audio data from multiple sources
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        return {
            dataArray: dataArray,
            bufferLength: bufferLength,
            analyser: analyser
        };
    } else if (window.sharedAnalyser && window.sharedDataArray) {
        window.sharedAnalyser.getByteFrequencyData(window.sharedDataArray);
        return {
            dataArray: window.sharedDataArray,
            bufferLength: window.sharedBufferLength,
            analyser: window.sharedAnalyser
        };
    } else if (audioContext && analyser) {
        // Create dataArray on the fly
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        console.log('⚠️ Created fallback dataArray for visualizer');
        return {
            dataArray: dataArray,
            bufferLength: bufferLength,
            analyser: analyser
        };
    }
    
    console.warn('⚠️ No audio data available for visualizer');
    return null;
};

    
debugLog('Music player initialized');

window.lyricsManager = lyricsManager;

}); // ← Only ONE closing for DOMContentLoaded