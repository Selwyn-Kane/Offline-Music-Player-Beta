/* ============================================
   ANDROID BRIDGE v1.0
   Abstracts native Capacitor APIs vs. browser APIs.

   Loaded before all other app scripts in index.html.
   The rest of the codebase calls window.NativeBridge —
   it never imports Capacitor plugins directly, so the
   same code path works on both web and Android without
   any further platform checks elsewhere.
   ============================================ */

window.NativeBridge = (() => {

    // Capacitor injects window.Capacitor into the WebView at runtime.
    // On a desktop browser this object will not exist.
    const isNative = () => !!(window.Capacitor?.isNativePlatform?.());

    // Lazy-resolve a Capacitor plugin by name.
    // Returns null if we're not in a native context.
    const plugin = (name) => {
        if (!isNative()) return null;
        return window.Capacitor?.Plugins?.[name] ?? null;
    };

    return {

        /** Returns true when running inside the Android APK WebView. */
        isNative,

        // ─── File Picking ──────────────────────────────────────────────────

        /**
         * Open the native Android media picker for audio files.
         * Returns an array of Capacitor file descriptors:
         *   [{ name, mimeType, path, size }, ...]
         * Returns null on web (caller falls back to <input type="file">).
         */
        async pickAudioFiles() {
            const fp = plugin('FilePicker');
            if (!fp) return null;

            try {
                const result = await fp.pickFiles({
                    types:    ['audio/*'],
                    multiple: true,
                    readData: false,  // we'll read lazily via readFileAsBlob
                });
                return result?.files ?? [];
            } catch (err) {
                // User cancelled — surface as AbortError so callers handle it uniformly
                if (err.message?.toLowerCase().includes('cancel')) {
                    const abort = new Error('Cancelled');
                    abort.name  = 'AbortError';
                    throw abort;
                }
                throw err;
            }
        },

        /**
         * Read a file by its native URI and return a Blob.
         * Used to convert Capacitor file descriptors into standard Web File objects
         * so the rest of the pipeline (metadata parser, audio loading, etc.) is unchanged.
         *
         * @param {string} uri       - Native file path or content URI
         * @param {string} mimeType  - MIME type for the resulting Blob
         * @returns {Promise<Blob>}
         */
        async readFileAsBlob(uri, mimeType) {
            const fs = plugin('Filesystem');
            if (!fs) return null;

            const { data } = await fs.readFile({ path: uri });
            // data is base64-encoded by Capacitor
            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            return new Blob([bytes], { type: mimeType ?? 'audio/mpeg' });
        },

        // ─── Permissions ───────────────────────────────────────────────────

        /**
         * Check the current state of the Android media audio permission
         * without prompting the user.
         * Returns: 'granted' | 'denied' | 'prompt'
         */
        async checkMediaPermission() {
            const perms = plugin('Permissions');
            if (!perms) return 'granted';  // browser handles its own permissions

            try {
                const result = await perms.query({ name: 'readMediaAudio' });
                return result.state ?? 'prompt';
            } catch {
                return 'prompt';
            }
        },

        /**
         * Request the Android READ_MEDIA_AUDIO permission (Android 13+) or
         * READ_EXTERNAL_STORAGE (Android ≤12).
         * Returns true if the permission was granted.
         */
        async requestMediaPermission() {
            const perms = plugin('Permissions');
            if (!perms) return true;  // browser doesn't need this

            try {
                const result = await perms.request({ name: 'readMediaAudio' });
                return result.state === 'granted';
            } catch {
                return false;
            }
        },

        // ─── Wake Lock / Screen Keep-On ────────────────────────────────────

        /**
         * Prevent the screen from sleeping while music is playing.
         * On native, delegates to the KeepAwake Capacitor plugin.
         * On web, returns false so the caller falls back to the WakeLock API.
         *
         * @param {boolean} enable - true to keep screen on, false to release
         * @returns {Promise<boolean>} true if handled natively
         */
        async keepScreenOn(enable) {
            const ka = plugin('KeepAwake');
            if (!ka) return false;  // signal: caller should use navigator.wakeLock

            try {
                if (enable) {
                    await ka.keepAwake();
                } else {
                    await ka.allowSleep();
                }
                return true;
            } catch {
                return false;
            }
        },

    };
})();
