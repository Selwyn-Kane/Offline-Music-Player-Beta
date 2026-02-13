# 🎵 Ultimate Local Music Player

> A powerful, feature-rich offline music player with AI-powered playlists, intelligent EQ, crossfading, DJ mode, and advanced analysis

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Chrome%20OS-green.svg)]()

---

## 🌟 Complete Features Overview

### 🎼 Core Playback
- **Multi-Format Support**: MP3, WAV, OGG, M4A, FLAC, AAC, WMA
- **Advanced Playlist Management**: Load, shuffle, loop (all/one), search, smart filtering
- **Smart Folder Loading**: One-click folder selection with auto-reload on startup
- **Folder Persistence**: Remembers your music folder across sessions via IndexedDB
- **Hardware Media Controls**: Works with keyboard shortcuts, media keys, headphone buttons, lock screen controls
- **Persistent Storage**: Remembers your playlist, settings, folder location, and custom metadata across sessions
- **Background Playback**: Continues playing when tab/app is minimized (PWA mode)
- **Seamless Crossfade**: Intelligent crossfading with BPM-aware start points and smooth transitions
- **Jump to Current**: Quickly scroll to the currently playing track in your playlist
- **Playlist Search**: Fast search through 10+ tracks with real-time filtering

### 🎨 Visual Experience
- **4 Professional Visualizer Modes**:
  - 🎚️ **Bars** - Classic frequency spectrum bars with smooth gradients
  - ⭕ **Circular** - Radial spectrum analyzer with pulsing center
  - 🌊 **Waveform** - Dual mirrored wave display
  - ✨ **Particles** - Interactive particle system that reacts to music
- **Mood-Based Visualizer Colors**: Real-time color adaptation based on track analysis (energetic=red/orange, calm=blue, bright=yellow, dark=purple)
- **BPM-Synced Visual Effects**: Visualizer pulses and animations sync with detected BPM
- **Energy-Modulated Animations**: Animation intensity scales with track energy levels
- **Fullscreen Visualizer**: Immersive full-window visualization with auto-hide controls
- **Fullscreen Lyrics Mode**: Dedicated lyrics view with edge visualizer effects
- **Dynamic Backgrounds**: Album art colors automatically influence UI theme
- **Custom Backgrounds**: Upload your own background images or use URLs
- **Album Art Extraction**: Automatic extraction and display from ID3 tags with color analysis

### 🎤 Lyrics System
- **WebVTT Support**: Time-synced lyrics with precise millisecond timing
- **Auto-Scroll**: Automatically follows current playback position
- **Click-to-Jump**: Tap any lyric line to seek to that position
- **Export Options**: Download lyrics as text file or copy to clipboard
- **Fullscreen Lyrics View**: Dedicated immersive lyrics mode with edge-based visualizer
- **🆕 Automatic Lyrics Fetcher**: Standalone tool to bulk-download synced lyrics from LRCLIB API
- **Lyrics Validation**: Automatic VTT file validation with error reporting

### 🎛️ Audio Controls
- **10 Professional EQ Presets**: 
  - Flat (Reference)
  - Bass Boost (Modern genres)
  - Treble Boost (Dull recordings)
  - Rock (Aggressive midrange)
  - Jazz (Warmth + air)
  - Electronic (V-curve)
  - Classical (Minimal, natural)
  - Acoustic (Midrange focus)
  - Podcast/Speech (Intelligibility)
  - Vocal Clarity (Smile curve)
- **3-Band Manual EQ**: Bass (200Hz), Mid (1kHz), Treble (3kHz) with ±12dB range
- **🆕 Auto-EQ System**: Intelligent preset selection based on analysis
  - Genre-based selection with audio analysis override
  - Context-aware scoring (35+ confidence threshold)
  - Vintage recording detection and handling
  - Speech/podcast detection
  - BPM and key compatibility checking
- **Volume Control**: Slider, keyboard shortcuts, mouse wheel scroll support
- **Mute Toggle**: Quick mute/unmute with volume memory

### 🧠 Advanced Analysis & Intelligence
- **🆕 Deep Music Analysis Tool**: Standalone HTML tool for comprehensive track analysis
  - Analyzes ENTIRE track duration (not just samples)
  - BPM detection (40-200 BPM range)
  - Energy calculation (LUFS-based, EBU R128 inspired)
  - Spectral centroid analysis
  - Dynamic range measurement (crest factor in dB)
  - 6-band frequency analysis (sub-bass to brilliance)
  - Vocal prominence detection
  - Vintage recording detection
  - Mood classification (energetic, calm, bright, dark, neutral)
  - Tempo classification (slow, moderate, fast, very-fast)
  - Exports analysis as .txt files
  - Batch processing with progress tracking
  - ZIP download for all analysis files
- **Analysis Text Parser**: Loads pre-generated .txt analysis files
- **Background Analysis**: Automatically analyzes tracks loaded without deep analysis
- **Analysis Caching**: Saves results to memory for instant playlist generation

### ✏️ Metadata System
- **Custom Metadata Editor**: Edit title, artist, album, year, genre, composer, comments
- **Persistent Custom Tags**: Survives browser restarts using localStorage
- **Custom Metadata Storage**: File-based storage system (name + size keys)
- **ID3 Tag Reading**: Automatic extraction from audio files (via jsmediatags)
- **Multi-Format Support**: MP3, M4A, FLAC, OGG, WAV, AAC, WMA metadata parsing
- **Playlist Integration**: Updates display instantly across all views
- **Album Art Extraction**: Automatic extraction and display from ID3 tags
- **Metadata Preview**: Live preview in editor modal

### 🧠 Smart Playlist Generator
- **AI-Powered Analysis**: Analyzes BPM, energy, mood, key, danceability, loudness
- **Enhanced Mood Detection**: Considers tempo (BPM) alongside energy and spectral brightness
- **8 Intelligent Templates**:
  - 💪 **High Energy Workout** - Energetic tracks to power through workouts
  - 📚 **Focus & Study** - Calm, consistent tracks for concentration
  - 🎧 **Seamless DJ Mix** - BPM and key-matched for smooth transitions
  - ☀️ **Gentle Wake Up** - Gradually increasing energy
  - 🎉 **Party Mix** - High energy, danceable tracks
  - 😌 **Chill Vibes** - Relaxed, mellow atmosphere
  - 🏃 **Running Pace** - Consistent tempo for running (150-180 BPM)
  - 😴 **Sleep & Relaxation** - Descending energy for winding down
- **Analysis Caching**: Save analysis results to memory for instant playlist generation
- **Enhanced Visualizer Integration**: Mood analysis influences visualizer colors and effects
- **Detailed Stats**: Track count, duration, average BPM, energy levels, mood distribution
- **Playlist Preview**: Review generated playlist before loading
- **One-Click Loading**: Load smart playlist directly to player

### 🎚️ Advanced Mixing Features
- **🆕 Crossfade Manager**: Intelligent track transitions
  - Configurable fade duration (1-10 seconds)
  - BPM-aware crossfade timing
  - Smart intro detection and skipping
  - Key compatibility checking
  - Dual audio system with preloading
  - Smooth volume ramping
- **🆕 DJ Mode**: Automatic playlist reordering
  - BPM and key matching for seamless transitions
  - Harmonic mixing using Camelot wheel
  - Mood compatibility checking
  - Energy flow optimization
  - Danceability consistency
  - Automatic mix generation
  - Original playlist restoration

### 📱 Mobile Optimizations
- **Touch Gestures**: 
  - Swipe right/left on cover art for previous/next track
  - Pull-to-refresh on playlist to reload folder
  - Long-press on tracks for context menu
- **Haptic Feedback**: Physical button feel on all interactions (light, medium, heavy, success, error)
- **Responsive UI**: Adapts perfectly to any screen size
- **PWA Support**: Install as native app on iOS/Android
- **Status Bar Auto-Hide**: Fullscreen experience on Android
- **Mobile Context Menu**: Long-press for track options
- **Gesture Indicators**: Visual hints for swipe gestures
- **Optimized Button Sizes**: 48px minimum touch targets

### 🖥️ Chrome OS Features
- **Extension Mode**: Runs as Chrome extension with dedicated window
- **PWA Mode**: Installable web app with offline support
- **Folder Persistence**: Remembers last used folder with auto-reload
- **Optimized Keyboard Shortcuts**: Chrome OS-specific shortcuts
- **Hybrid Input Support**: Optimized for touchscreen + keyboard usage
- **Platform Detection**: Automatic Chrome OS feature detection

### 🎯 Advanced Features
- **Picture-in-Picture**: Floating mini-player always on top (Chrome/Edge)
  - Multi-strategy fallback system for maximum compatibility
  - Main video, custom stream, and audio-only modes
  - Automatic video cleanup and resource management
- **Sticky Mini Player**: Keeps controls visible while scrolling
- **3 View Modes**: Full, Compact, Mini for different workflows
- **Debug Console**: Real-time logging for troubleshooting
- **Performance Manager**: Adaptive frame rates based on visibility and mode
- **Color Extraction**: Dominant color extraction from album art with caching (50-item LRU cache)
- **Drag & Drop**: Drop audio/VTT files anywhere to load instantly
- **Error Recovery System**: Automatic retry with exponential backoff
- **Custom Progress Bar**: Click anywhere to seek, smooth scrubbing
- **Playlist Status**: Real-time track count, loop mode, shuffle status
- **Volume Scroll**: Mouse wheel control over volume slider
- **Keyboard Shortcuts**: 15+ shortcuts for efficient control

### 🔧 System Features
- **Modular Architecture:** Cleanly separated components for audio processing, UI management, and file handling.
- **UI Manager:** Centralized UI interaction system with non-intrusive toast notifications.
- **Error Recovery System:** Circuit breaker pattern and automatic retries with global error reporting.
- **Service Worker:** Offline functionality with cache-first strategy.
- **GitHub Pages Support:** Automatic base path detection and configuration.
- **Folder Handle Persistence:** IndexedDB storage with permission verification.
- **Custom Metadata Storage:** localStorage-based with size/name keys.
- **Analysis Cache:** In-memory caching with localStorage backup.
- **Color Cache:** LRU cache (50 items) for album art colors.
- **Playlist Persistence:** localStorage with timestamp tracking.
- **Auto-Reload Preference:** Remember folder auto-load setting.

---

## 🚀 Quick Start

### 🌐 Web Browser (Any Device)

1. **Open** `index.html` in any modern browser
2. **Click** "📂 Load Music & Lyrics"
3. **Select** your music files (+ optional .vtt lyric files)
4. **Enjoy!** 🎉

### 📁 Folder Mode (Desktop/Chrome OS)

1. **Click** "📁 Select Music Folder"
2. **Grant permission** when prompted
3. **Auto-loads** all music in folder
4. **Next time**: Automatically reloads last folder on startup

### 🔍 Deep Analysis Workflow

1. **Open** `deep-music-analysis.html` in browser
2. **Select** your music folder
3. **Click** "Analyze All Songs" (analyzes entire tracks)
4. **Wait** for processing (30-60s per song)
5. **Download** analysis files as ZIP
6. **Extract** .txt files to music folder
7. **Load** in main player - enhanced features activate!

### 📲 Progressive Web App (Mobile)

**Android:**
1. Chrome → Menu (⋮) → "Add to Home Screen"
2. Tap icon to launch fullscreen app

**iOS:**
1. Safari → Share → "Add to Home Screen"
2. Tap icon to launch

### 🔌 Chrome Extension (Chrome OS)

1. Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select project folder
5. Click extension icon to open

---

## ⌨️ Complete Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play/Pause |
| **N** | Next track |
| **P** | Previous track |
| **M** | Mute/Unmute |
| **→** | Skip forward 5s |
| **←** | Rewind 5s |
| **C** | Cycle view mode (Full → Compact → Mini) |
| **S** | Toggle sticky player |
| **F** | Picture-in-Picture |
| **V** | Fullscreen visualizer |
| **D** | Debug panel |
| **O** | Open folder picker |
| **ESC** | Close fullscreen modes |

**Chrome OS Exclusive:**
- **Alt+M**: Toggle mini player
- **Ctrl+Shift+L**: Open folder picker

---

## 📖 Complete Usage Guide

### 🎵 Loading Music

**Method 1: File Picker**
```
Click "📂 Load Music & Lyrics"
→ Select files (Ctrl+Click for multiple)
→ Include .vtt files for lyrics
→ Include .txt analysis files for enhanced features
→ Player loads automatically
```

**Method 2: Folder Picker** (Desktop/Chrome OS only)
```
Click "📁 Select Music Folder"
→ Grant permission
→ All music auto-loads
→ Enable auto-reload to remember folder
→ Click "🗑️ Forget Folder" to reset
```

**Method 3: Drag & Drop**
```
Drag music files onto page
→ Drop anywhere
→ Instant load
```

### 🔍 Deep Analysis Workflow

**Using the Analysis Tool:**
1. Open `deep-music-analysis.html`
2. Select your music folder (MP3, M4A, FLAC, WAV, OGG)
3. Click "Analyze All Songs"
4. Wait for comprehensive analysis (entire track duration)
5. Download generated .txt files as ZIP
6. Extract ZIP to your music folder
7. Load music in main player

**What Gets Analyzed:**
- **Duration**: Total track length
- **BPM**: Tempo detection (40-200 BPM)
- **Key**: Musical key detection
- **Tempo**: Classification (slow/moderate/fast/very-fast)
- **Mood**: Enhanced detection (energetic/calm/bright/dark/neutral)
- **Energy (LUFS)**: Professional loudness measurement
- **Danceability**: Beat consistency and groove
- **Loudness**: Perceptual loudness
- **Spectral Centroid**: Brightness measurement
- **Vocal Prominence**: Voice detection ratio
- **Dynamic Range**: Crest factor in dB
- **Frequency Bands**: 6-band analysis (sub-bass to brilliance)
- **Vintage Detection**: Identifies old recordings

**Benefits of Deep Analysis:**
- Enhanced visualizer with mood-based colors
- BPM-synced visual effects
- Accurate Auto-EQ preset selection
- Better smart playlist generation
- Mood indicators in playlist
- DJ mode compatibility

### 🎤 Adding Lyrics

#### Manual Method:

1. **Name your VTT file** to match audio:
   ```
   Song.mp3
   Song.vtt  ← Must match exactly!
   ```

2. **VTT Format:**
   ```
   WEBVTT

   00:00:00.000 --> 00:00:05.000
   First line of lyrics

   00:00:05.000 --> 00:00:10.000
   Second line of lyrics
   ```

3. **Load together** with music files

#### 🆕 Automatic Method (Lyrics Fetcher):

1. **Open** `lyrics-fetcher.html` in your browser
2. **Click** "📁 Select Music Folder"
3. **Choose** your music folder
4. **Click** "🎤 Fetch Lyrics for All Songs"
5. **Wait** for automatic processing (uses LRCLIB API)
6. **Download** generated VTT files as ZIP
7. **Extract** ZIP and place VTT files in your music folder
8. **Reload** music player - lyrics appear automatically!

### 🎛️ Using the Equalizer

**Quick Presets:**
1. Click dropdown → Select preset
2. Instant apply (saved automatically)

**Manual Adjustment:**
1. Drag vertical sliders
2. Bass: Low frequencies (drums, bass)
3. Mid: Vocals, guitars
4. Treble: High frequencies (cymbals, hi-hats)
5. Reset: Click "Reset" button

**🆕 Auto-EQ Mode:**
1. Click "🎛️ Auto-EQ" button to enable
2. Player automatically selects optimal preset per track
3. Based on genre tags and audio analysis
4. Respects vintage recordings (uses flat or gentle presets)
5. Adapts to speech content (uses podcast preset)
6. 35% confidence threshold for activation

### ✏️ Editing Metadata

1. **Hover** over track in playlist
2. **Click** ✏️ (edit button)
3. **Modify** title, artist, album, year, genre, composer, comments
4. **Preview** changes in real-time
5. **Click** "💾 Save Changes"
6. Changes persist across sessions via localStorage
7. Custom metadata stored by filename + size

### 🧠 Smart Playlists

1. **Click** "🧠 Smart Playlists" button
2. **Analyze** your music library (one-time process)
3. **Wait** for enhanced mood detection with tempo analysis
4. **Choose** a playlist template:
   - Workout, Study, DJ Mix, Wake Up, Party, Chill, Running, Sleep
5. **Review** generated playlist with detailed stats
6. **Load** to main player with one click
7. **Enhanced**: Visualizer adapts to playlist mood

**🆕 Benefits of Smart Playlists:**
- Mood-based visualizer colors
- BPM-synced effects
- Energy-modulated animations
- Perfect for different activities
- Saves analysis cache for future use

### 🎚️ Crossfade & DJ Mode

**Crossfade:**
1. Click "🎚️ Crossfade" to enable
2. Tracks blend smoothly (2-5 seconds)
3. BPM-aware start points
4. Skips quiet intros on high-energy tracks
5. Adjustable duration (1-10 seconds)

**DJ Mode:**
1. Click "🎧 DJ Mode" to enable
2. Playlist automatically reordered for seamless mixing
3. BPM and key matching
4. Harmonic mixing (Camelot wheel)
5. Mood compatibility
6. Click again to restore original order

### 🖼️ Custom Background

1. **Click** "🎨 Background"
2. **Choose**:
   - "📤 Upload Image" → Select file (under 5MB)
   - "🌐 Use Image URL" → Paste link
3. **Preview** before applying
4. **Reset** anytime to default gradient

### 🌌 Fullscreen Visualizer

1. **Click** "🌌 Fullscreen Visualizer" (or press **V**)
2. **🆕 Enhanced Features**:
   - Mood-based color schemes (red=energetic, blue=calm, etc.)
   - BPM-synced pulses
   - Energy-modulated animation speed
3. **Switch modes**: Bars / Circular / Waveform / Particles
4. **Controls**:
   - Auto-hide after 3 seconds
   - Move mouse to reveal
   - 👁️ button to force hide/show
5. **Navigate**: Previous/Next/Play/Pause
6. **Close**: ✕ button or press **ESC**

### 🎤 Fullscreen Lyrics

1. **Click** "🎤 Fullscreen Lyrics"
2. **Features**:
   - Edge-based visualizer effects
   - Auto-scroll to current line
   - Click any line to jump
3. **Navigate**: Previous/Next buttons at bottom
4. **Close**: ✕ button or press **ESC**

---

## 🎨 View Modes

### Full View (Default)
- All features visible
- Visualizer, EQ, lyrics, playlist
- Best for desktop

### Compact Mode
- Hides visualizer, EQ, lyrics
- Shows player essentials + playlist
- Good for multitasking

### Mini Mode
- Minimal: Now playing + progress bar only
- Maximum space savings
- Perfect for background music

**Toggle:** Click "📐 Full View" button or press **C**

---

## 📌 Sticky Player

**Enable sticky mode:**
1. Click "📌 Sticky Off"
2. Player sticks to bottom of window
3. Stays visible while scrolling
4. Perfect with mini mode
5. Press **S** to toggle

**Use case:** Browse playlist while controlling playback

---

## 🔧 Advanced Features

### Picture-in-Picture (Desktop)
1. Click "📺 Float"
2. Creates draggable mini window
3. Always on top of other windows
4. Shows track info and visualizer
5. **Multi-strategy fallback system** for maximum compatibility:
   - Primary: Uses main video element
   - Fallback 1: Creates custom video stream
   - Fallback 2: Minimal audio-only approach
6. Automatic resource cleanup
7. Works on Chrome, Edge, and Chrome OS

### Debug Mode
- Press **D** or click "🛠 Debug"
- Shows real-time console logs
- Displays metadata extraction info
- Analysis status and errors
- Helpful for troubleshooting

### Performance Optimization
- **Adaptive Frame Rates**: Adjusts based on visibility
- **Tab Hidden**: Reduces CPU usage when tab not visible
- **Compact/Mini Mode**: Disables visualizer to save resources
- **Smart Caching**: Color extraction, analysis results, metadata
- **Canvas Performance**: Optimized drawing algorithms

### 🎨 Enhanced Visualizer Integration
**New: Mood-based visual effects!**
- **Energetic tracks**: Red/orange color scheme with strong pulses
- **Calm tracks**: Blue color scheme with gentle waves
- **Bright tracks**: Yellow/gold colors with sparkles
- **Dark tracks**: Purple/indigo colors with deep effects
- **Neutral**: Default red scheme

**How it works:**
1. Track is analyzed for mood (energy + BPM + brightness)
2. Mood classification influences visualizer colors
3. BPM affects pulse speed and animation intensity
4. Energy level controls visualizer sensitivity
5. Real-time synchronization with music analysis

---

## 📱 Complete Mobile Gestures

| Gesture | Action |
|---------|--------|
| **Swipe Right** on cover art | Previous track |
| **Swipe Left** on cover art | Next track |
| **Pull Down** on playlist | Refresh folder |
| **Long Press** on track | Context menu (Play Now / Add to Queue / Show Info) |
| **Tap** lyric line | Jump to that time |

**Haptic Feedback Types:**
- Light: Play/pause, volume changes
- Medium: Track changes
- Heavy: Long press detection
- Success: Playlist loaded
- Error: Operation failed

---

## 🎯 Tips & Tricks

### 🎵 Best Audio Quality
- Use FLAC or high-bitrate MP3 (320kbps)
- Enable Auto-EQ for intelligent preset selection
- Use Bass Boost preset for EDM/Electronic
- Use Vocal preset for podcasts
- Use Classical preset for orchestral music

### 🎤 Perfect Lyrics
- Use the **Lyrics Fetcher** tool for bulk downloads
- Manual VTT files: Match filename exactly with audio
- Create VTT files with proper timestamps (HH:MM:SS.mmm)
- Example: `Song.mp3` needs `Song.vtt` (exact match)
- Any filename difference prevents VTT matching

### 🔍 Deep Analysis Benefits
- **Always run** deep analysis for best experience
- Enhanced visualizer with mood colors
- BPM-synced effects
- Accurate Auto-EQ
- Better smart playlists
- Clear analysis cache (`musicAnalysisCache` in localStorage) after updates

### 🧠 Smart Playlists
- **Improved Mood Detection**: Uses tempo + energy + brightness
- Analyze your library once, reuse forever
- Save analysis cache for instant generation
- Try different templates for same music
- DJ Mode works best with analyzed tracks

### 🎚️ Crossfade & DJ Mode
- Enable both for ultimate DJ experience
- DJ Mode auto-disables shuffle (incompatible)
- Crossfade respects track intros and BPM
- Works best with similar genres
- DJ Mode uses Camelot wheel for harmonic mixing

### ⚡ Performance
- Use Compact or Mini mode if visualizer lags
- Close unused browser tabs
- Disable visualizer in settings for maximum battery life
- Smart Playlists: Analyze in batches if you have 100+ tracks
- Deep analysis: Process overnight for large libraries

### 💾 Storage
- Browser cache: ~50 tracks (color cache)
- Folder mode: Unlimited (direct file access)
- Playlists persist in localStorage
- Custom metadata stored separately by file
- Analysis cache in memory + localStorage backup
- IndexedDB for folder handles

### 🔒 Privacy
- All processing happens locally on your device
- No data sent to servers (except LRCLIB for lyrics)
- Music files never leave your device
- No tracking, no analytics, no ads
- Analysis files stay local

---

## 🌐 Browser Support

| Browser | Desktop | Mobile | Features |
|---------|---------|--------|----------|
| **Chrome** | ✅ Full | ✅ Full | All features including PiP, folder access |
| **Edge** | ✅ Full | ✅ Full | All features including PiP, folder access |
| **Firefox** | ✅ Most | ✅ Most | No folder picker, PiP support varies |
| **Safari** | ⚠️ Limited | ⚠️ Limited | No folder picker, no PiP, basic features only |

**Recommended:** Chrome 86+ or Edge 86+ for best experience

**Minimum Requirements:**
- ES6+ JavaScript support
- Web Audio API
- Canvas API
- FileReader API
- LocalStorage API
- Media Session API (for background playback)

---

## 📂 Complete Project Structure

```
├── index.html                          # Main app HTML
├── style.css                           # All styling
├── script.js                           # Main app logic (2000+ lines)
│
├── Core Audio:
├── audio-presets-manager.js            # 10 EQ presets with professional curves
├── visualizer-manager.js               # 4-mode visualizer (enhanced with mood)
├── performance-manager.js              # Adaptive frame rates
│
├── Metadata & Parsing:
├── metadata-parser.js                  # Multi-format ID3 reader (MP3/M4A/FLAC/OGG/WAV/AAC/WMA)
├── vtt-parser.js                       # Lyrics parsing with validation
├── metadata-editor.js                  # Custom metadata editing UI
├── analysis-text-parser.js             # Deep analysis .txt file parser
│
├── Smart Features:
├── music-analyzer.js                   # BPM, energy, mood, key detection
├── smart-playlist-generator.js         # 8 AI playlist templates
├── auto-eq-manager.js                  # Intelligent EQ preset selection
├── crossfade-manager.js                # Seamless track transitions
├── dj-mode-manager.js                  # Automatic playlist reordering
│
├── UI & UX:
├── custom-background.js                # Background image manager
├── mobile.js                           # Touch gestures + haptics
├── error-recovery.js                   # Exponential backoff retry
├── config-constants.js                 # App configuration
│
├── Platform Support:
├── chromeOS-detector.js                # Platform detection
├── background.js                       # Chrome extension service worker
├── background-audio-handler.js         # Media Session API + wake locks
├── gh-pages-config.js                  # GitHub Pages base path
├── sw-init.js                          # Service worker initialization
├── service-worker.js                   # PWA offline support
│
├── Standalone Tools:
├── lyrics-fetcher.html                 # Bulk lyrics downloader (LRCLIB API)
├── deep-music-analysis.html            # Comprehensive track analyzer
├── smart-playlist-ui.html              # Smart playlist demo/tester
│
├── PWA Assets:
├── manifest.webmanifest                # PWA manifest
├── icon-192.png                        # App icon (192x192)
├── icon-512.png                        # App icon (512x512)
│
└── Widget Support (Android 12+):
    ├── widget-minimal.html             # Minimal widget
    ├── widget-full.html                # Full widget with album art
    ├── widget-data-*.json              # Widget data templates
    └── widget-adaptive-cards.json      # Adaptive card templates
```

**Total Lines of Code:** ~15,000+
**JavaScript Files:** 25+
**Features:** 100+

---

## 🆕 What's New in Latest Version

### Enhanced Mood Detection & Visualizer Integration
- **🎨 Enhanced Mood Detection**: Analyzes tempo (BPM) + energy + spectral brightness
- **🎨 5 Accurate Mood Classifications**: Energetic, Calm, Bright, Dark, Neutral
- **🎨 Mood-Based Visualizer Colors**: Real-time color adaptation
- **🎨 BPM-Synced Visual Effects**: Pulses sync with detected BPM
- **🎨 Energy-Modulated Animations**: Intensity scales with track energy
- **🎨 Album Art Color Integration**: Uses dominant colors when available

### Deep Analysis Tool
- **🔍 Comprehensive Track Analysis**: Analyzes entire track duration
- **🔍 Professional Metrics**: LUFS energy, crest factor, frequency bands
- **🔍 Batch Processing**: Analyze entire music library
- **🔍 Export System**: Download all analysis as .txt files (ZIP)
- **🔍 Integration**: Load .txt files for enhanced player features

### Auto-EQ System
- **🎛️ Intelligent Preset Selection**: Context-aware scoring system
- **🎛️ Genre Recognition**: Automatic genre-based presets
- **🎛️ Vintage Detection**: Special handling for old recordings
- **🎛️ Speech Detection**: Podcast preset for speech content
- **🎛️ 35% Confidence Threshold**: Only applies when confident

### Crossfade & DJ Mode
- **🎚️ Seamless Transitions**: BPM-aware crossfading
- **🎚️ Smart Intro Skipping**: Detects and skips quiet intros
- **🎧 Harmonic Mixing**: Camelot wheel key matching
- **🎧 Automatic Reordering**: Intelligent playlist sequencing
- **🎧 Mood Compatibility**: Smooth emotional transitions

### Enhanced Mobile Experience
- **📱 Pull-to-Refresh**: Reload folder with gesture
- **📱 Haptic Feedback**: 6 types (light, medium, heavy, success, error, warning)
- **📱 Context Menu**: Long-press for track options
- **📱 Gesture Indicators**: Visual swipe hints

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Test thoroughly across browsers
4. Commit changes (`git commit -m 'Add AmazingFeature'`)
5. Push to branch (`git push origin feature/AmazingFeature`)
6. Submit pull request

**Areas for Contribution:**
- Additional visualizer modes
- More EQ presets and Auto-EQ improvements
- Smart playlist templates
- Mobile gesture improvements
- Browser compatibility fixes
- Performance optimizations
- Translation/localization
- Better analysis algorithms
- Machine learning integration

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

This means you can:
- ✅ Use commercially
- ✅ Modify freely
- ✅ Distribute
- ✅ Use privately

---

## 🙏 Credits

**Libraries Used:**
- [jsmediatags](https://github.com/aadsm/jsmediatags) - Metadata tag reading
- [JSZip](https://stuk.github.io/jszip/) - ZIP file generation (lyrics fetcher)

**APIs Used:**
- [LRCLIB](https://lrclib.net) - Synced lyrics database (free, no API key required)

**Inspiration:**
Built with ❤️ for music lovers who want complete control over their listening experience without cloud dependencies or subscriptions.

---

## 📞 Support

Found a bug? Have a feature request?

- 📧 Email: pieredino@gmail.com

**Common Issues:**
- **No sound**: Check browser audio permissions
- **Folder not loading**: Grant filesystem permissions
- **Lyrics not showing**: Ensure VTT filename matches audio exactly
- **PiP not working**: Use Chrome/Edge, try refreshing page
- **Slow performance**: Try Compact/Mini mode
- **🆕 Mood detection issues**: Clear analysis cache (`musicAnalysisCache` in localStorage) after updates

---

## 🔮 Roadmap

**Planned Features:**
- [ ] Playlist import/export (M3U, PLS)
- [ ] Audio effects (reverb, echo, etc.)
- [ ] Podcast support with chapters
- [ ] Radio streaming support
- [ ] Wrapped-Like Listening Reports
- [ ] More smart playlist templates
- [ ] Advanced mood detection with machine learning
- [ ] Custom visualizer color themes
- [ ] Crossfade between tracks

---

## ⭐ Show Your Support

If you like this project:
- ⭐ Star this repository
- 🍴 Fork and customize
- 📢 Share with friends
- 💖 Contribute improvements

---

*"Impossible is a social construct. Anything is possible if you don't know it shouldn't be."*

**Enjoy your music! 🎵🎧🎶**

*Built for offline freedom. Enhanced with intelligence. Powered by the web.*