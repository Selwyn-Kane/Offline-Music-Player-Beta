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
let analyzer = null;
let generator = null;
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
let audioPipeline = null;

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
    // Initialize Worker Manager
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

    audioPipeline = new AudioPipeline(debugLog);
    window.audioPipeline = audioPipeline;

    analyzer = new MusicAnalyzer(debugLog);
    
    // Initialize File Loading Manager
    fileLoadingManager = new EnhancedFileLoadingManager(debugLog);
    window.fileLoadingManager = fileLoadingManager;

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

    // Smart reconnection system
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

    // Initialize playlist renderer
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
            debugLog(`${indices.length} tracks removed`, 'success');
            savePlaylistToStorage();
        },
        onSmartPlaylist: (type, criteria) => {
            if (type === 'similar') {
                const currentTrack = playlist[currentTrackIndex];
                if (!currentTrack || !currentTrack.analysis) {
                    alert('Please play a track with analysis data first!');
                    return;
                }
                
                const similarTracks = playlist.filter(t => {
                    if (!t.analysis || t === currentTrack) return false;
                    const bpmDiff = Math.abs(t.analysis.bpm - currentTrack.analysis.bpm);
                    const energyDiff = Math.abs(t.analysis.energy - currentTrack.analysis.energy);
                    return bpmDiff < 15 && energyDiff < 0.2;
                });
                
                // Fallback: highlight them in playlist or show alert
                alert(`Found ${similarTracks.length} similar tracks! Try generating a "Similar" smart playlist.`);
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
                    
                    const colorSettings = perfManager.getColorExtractionSettings();
                    const sampleSize = colorSettings.sampleSize;
                    
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
                    for (let i = 0; i < imageData.data.length; i += 64) {
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
                    
                    // Cache eviction BEFORE adding new entry
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
            getAudioData: () => {
                // Try multiple ways to get audio data
                if (analyser && dataArray) {
                    audioPipeline.getFrequencyData();
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
                        audioPipeline.getFrequencyData();
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

    function setupAudioContext() {
        if (!audioPipeline) return;
        
        const player = document.getElementById('audio-player');
        audioPipeline.init(player);
        
        // Sync local variables with pipeline
        audioContext = audioPipeline.audioContext;
        analyser = audioPipeline.analyser;
        audioSource = audioPipeline.audioSource;
        bassFilter = audioPipeline.bassFilter;
        midFilter = audioPipeline.midFilter;
        trebleFilter = audioPipeline.trebleFilter;
        dataArray = audioPipeline.dataArray;
        bufferLength = audioPipeline.bufferLength;

        // Initialize managers if they don't exist
        if (!audioPresetsManager && bassFilter && midFilter && trebleFilter) {
            audioPresetsManager = new AudioPresetsManager(bassFilter, midFilter, trebleFilter, debugLog);
            audioPresetsManager.loadSavedPreset();
            populatePresetDropdown();
        }
        
        if (!autoEQManager && audioPresetsManager) {
            autoEQManager = new AutoEQManager(audioPresetsManager, debugLog);
        }
        
        if (!crossfadeManager && audioContext) {
            crossfadeManager = new CrossfadeManager(audioContext, debugLog);
        }

        // Initialize visualizer
        if (visualizerManager && !visualizerManager.canvas && canvas && analyser && dataArray) {
            visualizerManager.initMainVisualizer(canvas, analyser, dataArray, bufferLength);
        }
    }

    function reconnectAudioChainWithVolumeControl() {
        if (!audioPipeline) return false;
        audioPipeline.connectNodes();
        return true;
    }
            
    function startVisualizer() {
        if (perfManager.shouldRunVisualizer() && analyser) {
            // CRITICAL: Always ensure dataArray exists
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

    // PWA FIX: Resume AudioContext on any user interaction
    const resumeAudioOnInteraction = () => {
        if (audioContext && audioContext.state === 'suspended') {
            console.log('🔓 Resuming AudioContext on user interaction');
            audioPipeline.resume().then(() => {
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
            audioPipeline.setBass(parseFloat(savedBass));
            bassValue.textContent = `${savedBass} dB`;
        }
        if (savedMid !== null) {
            eqMidSlider.value = savedMid;
            audioPipeline.setMid(parseFloat(savedMid));
            midValue.textContent = `${savedMid} dB`;
        }
        if (savedTreble !== null) {
            eqTrebleSlider.value = savedTreble;
            audioPipeline.setTreble(parseFloat(savedTreble));
            trebleValue.textContent = `${savedTreble} dB`;
        }
        
        eqBassSlider.oninput = (e) => {
            const value = parseFloat(e.target.value);
            audioPipeline.setBass(value);
            bassValue.textContent = `${value} dB`;
            localStorage.setItem('eqBass', value);
        };
        
        eqMidSlider.oninput = (e) => {
            const value = parseFloat(e.target.value);
            audioPipeline.setMid(value);
            midValue.textContent = `${value} dB`;
            localStorage.setItem('eqMid', value);
        };
        
        eqTrebleSlider.oninput = (e) => {
            const value = parseFloat(e.target.value);
            audioPipeline.setTreble(value);
            trebleValue.textContent = `${value} dB`;
            localStorage.setItem('eqTreble', value);
        };
        
        eqResetBtn.onclick = () => {
            eqBassSlider.value = 0;
            eqMidSlider.value = 0;
            eqTrebleSlider.value = 0;
            audioPipeline.setBass(0);
            audioPipeline.setMid(0);
            audioPipeline.setTreble(0);
            bassValue.textContent = '0 dB';
            midValue.textContent = '0 dB';
            trebleValue.textContent = '0 dB';
            localStorage.removeItem('eqBass');
            localStorage.removeItem('eqMid');
            localStorage.removeItem('eqTreble');
            
            // Reset preset dropdown
            const presetSelect = document.getElementById('eq-preset-select');
            if (presetSelect) presetSelect.value = '';
            
            debugLog('Equalizer reset to flat');
        };
    }
    
    setupEqualizerControls();

    function clearMetadata() {
        coverArt.src = '';
        coverArt.classList.remove('loaded');
        coverPlaceholder.style.display = 'flex';
        trackTitle.textContent = 'No track loaded';
        trackArtist.textContent = '--';
        trackAlbum.textContent = '--';
        metadataContainer.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)';
        metadataContainer.style.boxShadow = '0 8px 32px rgba(220, 53, 69, 0.2)';
        document.body.style.backgroundColor = '#0a0a0a';
        
        if (lyricsManager) lyricsManager.clearLyrics();
        if (visualizerManager) visualizerManager.clearTrackAnalysis();
        
        // Reset Media Session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = null;
        }
    }

    async function displayMetadata(metadata) {
        if (!metadata) return;
        
        trackTitle.textContent = metadata.title || 'Unknown Title';
        trackArtist.textContent = metadata.artist || 'Unknown Artist';
        trackAlbum.textContent = metadata.album || 'Unknown Album';
        
        if (metadata.image) {
            coverArt.src = metadata.image;
            coverArt.onload = () => {
                coverArt.classList.add('loaded');
                coverPlaceholder.style.display = 'none';
                
                // Extract and apply dominant color
                extractDominantColor(metadata.image).then(color => {
                    currentDominantColor = color;
                    applyDynamicBackground(color);
                });
            };
            coverArt.onerror = () => {
                coverArt.src = '';
                coverArt.classList.remove('loaded');
                coverPlaceholder.style.display = 'flex';
                applyDynamicBackground(null);
            };
        } else {
            coverArt.src = '';
            coverArt.classList.remove('loaded');
            coverPlaceholder.style.display = 'flex';
            applyDynamicBackground(null);
        }
    }

    function updatePlaylistStatus() {
        const count = playlist.length;
        playlistStatus.textContent = `${count} track${count !== 1 ? 's' : ''} loaded ${isShuffled ? '(Shuffled)' : ''}`;
        
        if (count > 0) {
            clearButton.disabled = false;
            shuffleButton.disabled = false;
            loopButton.disabled = false;
        } else {
            clearButton.disabled = true;
            shuffleButton.disabled = true;
            loopButton.disabled = true;
        }
    }

    function updateMediaSession() {
        if ('mediaSession' in navigator && currentTrackIndex !== -1) {
            const track = playlist[currentTrackIndex];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.metadata?.title || track.fileName,
                artist: track.metadata?.artist || 'Unknown Artist',
                album: track.metadata?.album || 'Unknown Album',
                artwork: track.metadata?.image ? [{ src: track.metadata.image, sizes: '512x512', type: 'image/png' }] : []
            });
        }
    }

    async function handleAutoLyrics(track) {
        const autoLyricsEnabled = localStorage.getItem('autoLyricsEnabled') === 'true';
        if (!autoLyricsEnabled) return;
        
        debugLog(`🔍 Auto-fetching lyrics for: ${track.fileName}`, 'info');
        
        try {
            // This would call an external API or search
            // For now, we'll just log it
            debugLog('Auto-lyrics fetch initiated (Simulation)', 'info');
        } catch (err) {
            debugLog(`Auto-lyrics failed: ${err.message}`, 'warning');
        }
    }

    async function loadTrack(index) {
        if (index < 0 || index >= playlist.length) return;
        
        currentTrackIndex = index;
        const track = playlist[index];
        
        debugLog(`Loading track ${index + 1}: ${track.fileName}`);
        
        // Display metadata immediately if available
        if (track.metadata) {
            displayMetadata(track.metadata);
        } else {
            clearMetadata();
            trackTitle.textContent = track.fileName;
        }

        // Apply saved volume for this track (if exists) with smart normalization
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

        // Pass analysis data to visualizer if available
        if (visualizerManager) {
            if (track.analysis) {
                visualizerManager.setTrackAnalysis(track.analysis);
                debugLog(`🎨 Enhanced visualizer mode: BPM=${track.analysis.bpm}, Energy=${(track.analysis.energy * 100).toFixed(0)}%, Mood=${track.analysis.mood}`, 'success');
            } else {
                visualizerManager.clearTrackAnalysis();
                debugLog('🎨 Standard visualizer mode (no analysis data)', 'info');
            }
        }

        // Ensure visualizer has dataArray
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
                
                // SMART SKIP: Skip initial silence if detected
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
            
            // Auto-fetch lyrics if VTT is missing
            handleAutoLyrics(track);
        }

        playlistRenderer.updateHighlight(currentTrackIndex);
        prevButton.disabled = false;
        nextButton.disabled = false;

        // Ensure audio context is ready
        if (!audioContext) {
            setupAudioContext();
        } else if (audioContext.state === 'suspended') {
            audioPipeline.resume();
        }

        updateMediaSession();
        playlistRenderer.updateJumpButton();

        // Start crossfade monitoring AFTER metadata loads
        if (crossfadeManager && crossfadeManager.enabled && currentTrackIndex + 1 < playlist.length) {
            const nextTrack = playlist[currentTrackIndex + 1];
            
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
                const onPlayForCrossfade = () => {
                    if (startCrossfadeMonitoring()) {
                        player.removeEventListener('play', onPlayForCrossfade);
                    }
                };
                player.addEventListener('play', onPlayForCrossfade);
                
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

        // Return a promise that resolves when track is loaded
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
        
        // Remember volume for current track before switching
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
        
        loadTrack(nextIndex);
    }

    function playPrevious() {
        // Remember volume for current track before switching
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

    // --- Custom Controls Handlers ---
    
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
            } catch (err) {
                debugLog(`Seek failed: ${err.message}`, 'error');
            }
        }
    };

    // --- Playlist Persistence ---
    function savePlaylistToStorage() {
        try {
            const playlistData = playlist.map(track => ({
                fileName: track.fileName,
                metadata: track.metadata,
                hasVTT: !!track.vtt,
                duration: track.duration
            }));
            
            localStorage.setItem('savedPlaylist', JSON.stringify(playlistData));
            localStorage.setItem('playlistTimestamp', Date.now().toString());
            debugLog(`Playlist saved: ${playlistData.length} tracks`, 'info');
        } catch (error) {
            debugLog(`Failed to save playlist: ${error.message}`, 'error');
        }
    }

    function loadPlaylistFromStorage() {
        try {
            const savedData = localStorage.getItem('savedPlaylist');
            const timestamp = localStorage.getItem('playlistTimestamp');
            
            if (!savedData || !timestamp) return null;
            
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
            fileLoadingManager.cleanupPlaylist(playlist);
            
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
            audioPipeline.resume();
        }
        
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
            audioPipeline.suspend();
        }
        
        if (backgroundAudioHandler) {
            backgroundAudioHandler.updatePlaybackState('paused');
        }
        
        perfManager.setPlayState(false);
        updateMediaSession();
        if (visualizerController) {
            visualizerController.onPlayStateChange();
        }
        if (crossfadeManager) {
            crossfadeManager.cancelFade();
        }
    });

    player.addEventListener('loadedmetadata', () => {
        durationDisplay.textContent = formatTime(player.duration);
    });

    player.addEventListener('timeupdate', () => {
        if (isSeekingProg) return;
        
        if (perfManager.shouldUpdate('progress')) {
            const percent = (player.currentTime / player.duration) * 100;
            progressBar.style.width = `${percent}%`;
            currentTimeDisplay.textContent = formatTime(player.currentTime);
        }
        
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
            const currentTrack = playlist[currentTrackIndex];
            shuffleArray(playlist);
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

    const crossfadeButton = document.getElementById('crossfade-button');
    if (crossfadeButton) {
        crossfadeButton.onclick = () => {
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

    const autoEQButton = document.getElementById('auto-eq-button');
    if (autoEQButton) {
        autoEQButton.onclick = () => {
            if (currentTrackIndex === -1 || playlist.length === 0) {
                alert('Please load a track first!');
                return;
            }
            
            const newState = !autoEQManager.enabled;
            autoEQManager.setEnabled(newState);
            
            autoEQButton.classList.toggle('active', newState);
            autoEQButton.textContent = newState ? '🪄 Auto-EQ On' : '🪄 Auto-EQ Off';
            
            if (newState) {
                autoEQManager.applyAutoEQ(playlist[currentTrackIndex]);
            }
            
            debugLog(`Auto-EQ ${newState ? 'enabled' : 'disabled'}`, 'info');
        };
    }

    // --- Folder Selection Handlers ---
    const folderButton = document.getElementById('folder-button');

    if (folderButton) {
        folderButton.onclick = async () => {
            try {
                const history = await folderPersistence.getHistory();
                const currentMetadata = await folderPersistence.getFolderMetadata();
                
                if (history.length > 0 || currentMetadata) {
                    showFolderHistoryModal();
                    return;
                }
                
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
    }

    const clearFolderButton = document.getElementById('clear-folder-button');

    if (clearFolderButton) {
        clearFolderButton.onclick = async () => {
            if (confirm('Forget the saved music folder? You\'ll need to select it again next time.')) {
                try {
                    await folderPersistence.deleteFolderHandle();
                    folderHandle = null;
                    
                    if (folderButton) {
                        folderButton.textContent = '📁 Select Music Folder';
                        folderButton.classList.remove('active');
                    }
                    clearFolderButton.style.display = 'none';
                    
                    debugLog('Folder forgotten', 'success');
                } catch (err) {
                    debugLog(`Error clearing folder: ${err.message}`, 'error');
                }
            }
        };
    }

    function updateFolderButtons() {
        if (folderHandle) {
            clearFolderButton.style.display = 'inline-block';
        } else {
            clearFolderButton.style.display = 'none';
        }
    }

    const folderHistoryModal = document.getElementById('folder-history-modal');
    const folderHistoryClose = document.querySelector('.folder-history-close');
    const folderHistoryOverlay = document.querySelector('.folder-history-overlay');
    const folderHistoryNew = document.getElementById('folder-history-new');
    const folderHistoryClear = document.getElementById('folder-history-clear');

    if (folderHistoryClose) folderHistoryClose.onclick = closeFolderHistoryModal;
    if (folderHistoryOverlay) folderHistoryOverlay.onclick = closeFolderHistoryModal;
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
        
        const history = await folderPersistence.getHistory();
        const currentMetadata = await folderPersistence.getFolderMetadata();
        
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
                
                if (!isCurrent) {
                    item.style.cursor = 'pointer';
                    item.onclick = async () => {
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
            if (!('showDirectoryPicker' in window)) {
                debugLog('📱 Using mobile folder selection fallback', 'info');
                const result = await fileLoadingManager.triggerMobileFolderFallback();
                if (result && result.success) {
                    uiManager.notify('Folder loaded successfully!', 'success');
                }
                return;
            }

            debugLog('Requesting folder access...', 'info');
            
            const handle = await window.showDirectoryPicker({
                mode: 'read',
                startIn: 'music'
            });
            
            if (expectedName && handle.name !== expectedName) {
                if (!confirm(`You selected "${handle.name}" but expected "${expectedName}".\n\nContinue with "${handle.name}"?`)) {
                    return;
                }
            }
            
            debugLog(`Folder selected: ${handle.name}`, 'success');
            
            const saveResult = await folderPersistence.saveFolderHandle(handle, {
                trackCount: 0,
                hasLyrics: false,
                hasAnalysis: false,
                totalSize: 0
            });
            
            if (!saveResult.success) {
                debugLog(`Failed to save folder: ${saveResult.error}`, 'error');
            }
            
            folderHandle = handle;
            folderButton.textContent = `📁 ${handle.name} (Click to reload)`;
            folderButton.classList.add('active');
            updateFolderButtons();
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

    async function loadFromFolder() {
        if (!folderHandle) {
            alert('No folder selected. Please click "Select Music Folder" first.');
            return;
        }
        
        try {
            await fileLoadingManager.loadFromFolderHandle(folderHandle);
            
            const tracks = fileLoadingManager.getPlaylist();
            if (tracks.length > 0) {
                playlist = tracks;
                currentTrackIndex = -1;
                
                playlistRenderer.setPlaylist(playlist, currentTrackIndex);
                playlistRenderer.render();
                updatePlaylistStatus();
                
                const stats = await fileLoadingManager.getFolderStats();
                await folderPersistence.updateFolderStats(folderHandle.name, stats);
                
                debugLog(`Successfully loaded ${tracks.length} tracks from folder`, 'success');
                uiManager.notify(`Loaded ${tracks.length} tracks`, 'success');
                
                savePlaylistToStorage();
                startBackgroundAnalysis();
            } else {
                debugLog('No audio files found in the selected folder', 'warning');
                uiManager.notify('No audio files found', 'warning');
            }
        } catch (err) {
            debugLog(`Error loading from folder: ${err.message}`, 'error');
            uiManager.notify(`Load failed: ${err.message}`, 'error');
        }
    }

    // --- UI Mode Handlers ---
    const compactToggle = document.getElementById('compact-toggle');
    const compactElements = {
        visualizer: document.getElementById('visualizer-container'),
        eq: document.getElementById('eq-container'),
        lyrics: document.getElementById('lyrics-container'),
        playlist: document.getElementById('playlist-container'),
        volume: document.getElementById('volume-container'),
        progress: document.getElementById('custom-progress-container'),
        time: document.getElementById('time-display')
    };

    function setCompactMode(mode) {
        compactMode = mode;
        
        if (uiManager) {
            uiManager.showToast(`Switched to ${mode} view`, 'info');
        }
        
        document.body.classList.remove('compact-mode', 'mini-mode');
        compactToggle.classList.remove('compact', 'mini');
        
        switch(mode) {
            case 'full':
                Object.values(compactElements).forEach(el => {
                    if (el) {
                        el.classList.remove('compact-hidden');
                        el.style.display = '';
                    }
                });
                
                compactToggle.textContent = '📐 Full View';
                visualizerEnabled = true;
                
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
                visualizerEnabled = false;
                stopVisualizer();
                
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
                
                visualizerEnabled = false;
                
                Object.entries(compactElements).forEach(([key, el]) => {
                    if (el && key !== 'progress') {
                        el.classList.add('compact-hidden');
                    }
                });
                
                if (compactElements.progress) compactElements.progress.classList.remove('compact-hidden');
                
                compactToggle.textContent = '📐 Mini';
                
                stopVisualizer();
                debugLog('Mini mode: Now playing only (saves maximum CPU)', 'success');
                break;
        }
        
        localStorage.setItem('compactMode', mode);
    }
    
    compactToggle.onclick = () => {
        const modes = ['full', 'compact', 'mini'];
        const currentIndex = modes.indexOf(compactMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        setCompactMode(nextMode);
    };
    
    const savedCompactMode = localStorage.getItem('compactMode');
    if (savedCompactMode && ['full', 'compact', 'mini'].includes(savedCompactMode)) {
        setCompactMode(savedCompactMode);
    }

    // --- Picture-in-Picture Mode ---
    let currentPipVideo = null;

    if (!document.pictureInPictureEnabled) {
        pipToggle.disabled = true;
        pipToggle.title = 'Picture-in-Picture not supported in this browser';
        debugLog('Picture-in-Picture not supported', 'warning');
    } else {
        pipToggle.onclick = async () => {
            try {
                if (currentTrackIndex === -1 || playlist.length === 0) {
                    alert('Please load a track first!');
                    return;
                }

                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                    cleanupPip();
                    return;
                }

                if (!player.src) {
                    alert('Please load and play a track first!');
                    return;
                }

                debugLog('Starting PiP activation sequence...', 'info');

                try {
                    await attemptMainVideoPip();
                    return;
                } catch (mainError) {
                    debugLog(`Main video PiP failed: ${mainError.message}`, 'warning');
                }

                try {
                    await attemptFallbackPip();
                    return;
                } catch (fallbackError) {
                    debugLog(`Fallback PiP failed: ${fallbackError.message}`, 'warning');
                }

                try {
                    await attemptAudioOnlyPip();
                    return;
                } catch (audioError) {
                    debugLog(`Audio-only PiP failed: ${audioError.message}`, 'error');
                    throw new Error('All PiP methods failed. Please try playing the track for a few seconds first.');
                }

            } catch (err) {
                debugLog(`All PiP methods failed: ${err.message}`, 'error');
                alert(`Picture-in-Picture failed: ${err.message}`);
            }
        };

        async function attemptMainVideoPip() {
            debugLog('Attempting PiP with main video element...', 'info');
            const mainVideo = document.getElementById('audio-player');
            
            if (!mainVideo.src) {
                throw new Error('No audio source loaded');
            }

            if (mainVideo.readyState < 1) {
                mainVideo.load();
                await new Promise(resolve => {
                    const onCanPlay = () => {
                        mainVideo.removeEventListener('canplay', onCanPlay);
                        resolve();
                    };
                    mainVideo.addEventListener('canplay', onCanPlay);
                    setTimeout(resolve, 2000);
                });
            }

            await mainVideo.requestPictureInPicture();
            currentPipVideo = mainVideo;
            
            pipToggle.textContent = '📺 Unfloat';
            document.body.classList.add('pip-active');
            debugLog('Main video PiP activated successfully', 'success');
            
            setupPipVisualizer();
        }

        async function attemptFallbackPip() {
            debugLog('Attempting fallback PiP...', 'info');
            
            const fallbackVideo = document.createElement('video');
            fallbackVideo.style.display = 'none';
            fallbackVideo.muted = true;
            fallbackVideo.playsInline = true;
            document.body.appendChild(fallbackVideo);
            
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const ctx = canvas.getContext('2d');
            
            drawPipFrame(ctx, canvas.width, canvas.height, true);
            
            const stream = canvas.captureStream(5);
            fallbackVideo.srcObject = stream;
            
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
            
            try {
                await fallbackVideo.play();
            } catch (playErr) {
                debugLog('Fallback video play warning (continuing anyway)', 'warning');
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await fallbackVideo.requestPictureInPicture();
            currentPipVideo = fallbackVideo;
            
            pipToggle.textContent = '📺 Unfloat';
            document.body.classList.add('pip-active');
            debugLog('Fallback PiP activated', 'success');
            
            startPipCanvasUpdates(canvas);
            
            fallbackVideo.addEventListener('leavepictureinpicture', () => {
                cleanupVideo(fallbackVideo);
                cleanupPip();
            }, { once: true });
        }

        async function attemptAudioOnlyPip() {
            debugLog('Attempting audio-only PiP...', 'info');
            
            const track = playlist[currentTrackIndex];
            const status = `${track.metadata?.title || 'Playing'} - ${track.metadata?.artist || 'Unknown Artist'}`;
            
            const audioOnlyVideo = document.createElement('video');
            audioOnlyVideo.style.display = 'none';
            audioOnlyVideo.muted = true;
            audioOnlyVideo.playsInline = true;
            document.body.appendChild(audioOnlyVideo);
            
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(status, canvas.width / 2, canvas.height / 2);
            
            const stream = canvas.captureStream(1);
            audioOnlyVideo.srcObject = stream;
            
            await audioOnlyVideo.play();
            await audioOnlyVideo.requestPictureInPicture();
            
            currentPipVideo = audioOnlyVideo;
            pipToggle.textContent = '📺 Unfloat';
            document.body.classList.add('pip-active');
            
            audioOnlyVideo.addEventListener('leavepictureinpicture', () => {
                cleanupVideo(audioOnlyVideo);
                cleanupPip();
            }, { once: true });
        }

        function drawPipFrame(ctx, width, height, isInitial = false) {
            const track = playlist[currentTrackIndex];
            if (!track) return;
            
            ctx.fillStyle = '#121212';
            ctx.fillRect(0, 0, width, height);
            
            if (currentDominantColor) {
                const { r, g, b } = currentDominantColor;
                const gradient = ctx.createLinearGradient(0, 0, width, height);
                gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);
            }
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(track.metadata?.title || track.fileName, width / 2, height / 2 - 10);
            
            ctx.fillStyle = '#aaa';
            ctx.font = '18px Arial';
            ctx.fillText(track.metadata?.artist || 'Unknown Artist', width / 2, height / 2 + 25);
            
            if (!isInitial && analyser && dataArray) {
                audioPipeline.getFrequencyData();
                const barWidth = width / bufferLength * 2.5;
                let x = 0;
                
                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * 50;
                    ctx.fillStyle = `rgba(255, 255, 255, 0.3)`;
                    ctx.fillRect(x, height - barHeight, barWidth, barHeight);
                    x += barWidth + 1;
                }
            }
        }

        function startPipCanvasUpdates(canvas) {
            const ctx = canvas.getContext('2d');
            const updateCanvas = () => {
                if (!document.pictureInPictureElement) return;
                drawPipFrame(ctx, canvas.width, canvas.height);
                requestAnimationFrame(updateCanvas);
            };
            requestAnimationFrame(updateCanvas);
        }

        function setupPipVisualizer() {
            debugLog('PiP visualizer setup initiated', 'info');
        }

        function cleanupVideo(video) {
            if (video) {
                video.pause();
                video.src = '';
                video.srcObject = null;
                if (video.parentNode) {
                    video.parentNode.removeChild(video);
                }
            }
        }

        function cleanupPip() {
            pipToggle.textContent = '📺 Float';
            document.body.classList.remove('pip-active');
            document.title = 'Ultimate Local Music Player';
            debugLog('PiP fully cleaned up', 'info');
        }

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
        
        localStorage.setItem('stickyMode', enable ? 'true' : 'false');
    }
    
    stickyToggle.onclick = () => {
        toggleSticky(!isStickyEnabled);
    };
    
    if (stickyClose) {
        stickyClose.onclick = (e) => {
            e.stopPropagation();
            toggleSticky(false);
        };
    }
    
    const savedSticky = localStorage.getItem('stickyMode');
    if (savedSticky === 'true') {
        toggleSticky(true);
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            stickyToggle.click();
        }
    });

    function populatePresetDropdown() {
        const presetSelect = document.getElementById('eq-preset-select');
        if (presetSelect && audioPresetsManager) {
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

    function openMetadataEditorForTrack(index) {
        if (index < 0 || index >= playlist.length) return;
        
        const track = playlist[index];
        const currentMetadata = track.metadata || {
            title: track.fileName,
            artist: 'Unknown Artist',
            album: 'Unknown Album'
        };
        
        metadataEditor.openEditor(index, currentMetadata, (trackIndex, newMetadata) => {
            const file = playlist[trackIndex].fileName;
            const size = playlist[trackIndex].duration || 0;
            
            customMetadataStore.save(file, size, newMetadata);
            
            playlist[trackIndex].metadata = {
                ...playlist[trackIndex].metadata,
                ...newMetadata,
                hasMetadata: true
            };
            
            playlistRenderer.setPlaylist(playlist, currentTrackIndex);
            playlistRenderer.render();
            
            if (trackIndex === currentTrackIndex) {
                displayMetadata(playlist[trackIndex].metadata);
            }
            
            savePlaylistToStorage();
            debugLog(`✅ Metadata updated and saved for track ${trackIndex + 1}`, 'success');
        });
    }

    debugLog('✅ Advanced systems prepared', 'success');

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

    const autoLyricsBtn = document.getElementById('auto-lyrics-btn');
    if (autoLyricsBtn) {
        autoLyricsBtn.onclick = () => {
            window.open('lyrics-fetcher.html', '_blank');
        };
    }

    const deepAnalysisBtn = document.getElementById('deep-analysis-btn');
    if (deepAnalysisBtn) {
        deepAnalysisBtn.onclick = () => {
            window.open('deep-music-analysis.html', '_blank');
        };
    }

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
        
    async function startBackgroundAnalysis() {
        if (backgroundAnalysisRunning) return;
        if (playlist.length === 0) return;
        
        backgroundAnalysisRunning = true;
        debugLog('🔍 Starting parallel background analysis...', 'info');
        
        const needsAnalysis = playlist
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => !track.hasDeepAnalysis && !track.analysis);
        
        if (needsAnalysis.length === 0) {
            debugLog('✅ All tracks already analyzed', 'success');
            backgroundAnalysisRunning = false;
            return;
        }
        
        debugLog(`📊 Analyzing ${needsAnalysis.length} tracks in parallel...`, 'info');
        
        const batchSize = 3;
        let analyzedCount = 0;
        
        for (let i = 0; i < needsAnalysis.length; i += batchSize) {
            const batch = needsAnalysis.slice(i, i + batchSize);
            
            const promises = batch.map(async ({ track, index }) => {
                try {
                    const response = await fetch(track.audioURL);
                    const blob = await response.blob();
                    const file = new File([blob], track.fileName, { type: 'audio/mpeg' });
                    
                    const analysis = await analyzer.analyzeTrack(file, track.fileName);
                    
                    playlist[index].analysis = analysis;
                    analyzedCount++;
                    
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
            
            await Promise.all(promises);
            
            playlistRenderer.setPlaylist(playlist, currentTrackIndex);
            playlistRenderer.render();
            
            if (analyzedCount % batchSize === 0) {
                analyzer.saveAnalysesToStorage();
                debugLog(`💾 Saved ${analyzedCount}/${needsAnalysis.length} analyses`, 'info');
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (analyzedCount > 0) {
            analyzer.saveAnalysesToStorage();
            debugLog(`✅ Background analysis complete! ${analyzedCount} tracks analyzed`, 'success');
        }
        
        backgroundAnalysisRunning = false;
    }

    window.getAudioDataForVisualizer = () => {
        if (analyser && dataArray) {
            audioPipeline.getFrequencyData();
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
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            audioPipeline.getFrequencyData();
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

});
