# Ultimate Local Music Player 🎵

Your music. Your device. No cloud, no subscriptions, no nonsense.

It started because of a memory leak in every other browser-based player out there. It's stayed because it actually works.

---

## What it is

A music player that runs entirely in your browser. Drop in some files, hit play. Everything happens locally: playback, metadata, lyrics, EQ, crossfade. Nothing leaves your device unless you explicitly let it.

---

## What it does

### Playback

Plays MP3, WAV, FLAC, OGG, M4A, AAC, and WMA. Load individual files or point it at a whole folder. It remembers the folder between sessions so your library is already there the next time you open it. Shuffle, loop, search, jump to current track.

### Looks

Three view modes: full, compact, and mini. Album art pulls dominant colors and themes the whole UI around them. It adapts.

### Lyrics

Drop a .vtt file with the same name as your track and lyrics sync automatically. Click any line to jump to that position in the song. There's also a standalone lyrics fetcher tool that grabs synced lyrics from LRCLIB in bulk.

### EQ

3-band manual EQ plus 10 presets. Auto-EQ reads your track's analysis data and picks a preset automatically. You can override it anytime.

### Crossfade

Calculates fade timing based on BPM and energy difference between tracks. Gapless mode for same-album playback. Toggle it on, set your duration, forget about it.

### Memory

Volume per track, custom metadata edits, folder handle, EQ settings, view mode. All of it survives browser restarts.

### Analysis

The Deep Music Analysis tool runs sample-based analysis on your tracks for BPM, energy, frequency content, dynamic range, and mood. Export as .txt files and load them back into the player for smarter crossfades and Auto-EQ decisions.

### Offline

PWA support means you can install it and use it with zero internet connection.

### Hardware

Keyboard shortcuts, hardware media keys, lock screen controls, mobile swipe gestures, haptic feedback, Chrome OS support.

---

## Standalone tools

- deep-music-analysis.html: batch analyze your library and export .txt files
- lyrics-fetcher.html: bulk download synced lyrics from LRCLIB
- true-metadata-editor.html: edit tags with a proper interface

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Arrow Right / Left | Next / Previous track |
| Shift + Arrow Right / Left | Seek forward / back 5s |
| Arrow Up / Down | Volume up / down |
| M | Mute |
| S | Shuffle |
| L | Loop mode |
| F | Fullscreen lyrics |
| C | Cycle view modes |
| D | Debug console |

---

## Tech

No frameworks. No build step. Open index.html and it works. Uses the Web Audio API for the full signal chain: source, EQ filters, volume control, crossfade gain, analyser, destination. Service worker handles offline support. IndexedDB for folder persistence. localStorage for everything else.

Uses [LRCLIB](https://lrclib.net) for lyrics fetching (free, no API key needed).

---

*"Impossible is a social construct. Anything is possible if you don't know it shouldn't be."*

**Enjoy your music! 🎵🎧🎶**

*Built for offline freedom. Enhanced with intelligence. Powered by the web.*
