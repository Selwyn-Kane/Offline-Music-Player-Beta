/* ============================================
   CHROMEOS PLATFORM DETECTOR v1.1
   Isolates platform-specific features.
   ============================================ */

class ChromeOSDetector {

    constructor() {
        this.isChromeos  = /CrOS/.test(navigator.userAgent);
        this.isExtension = this._checkExtension();
        this.isPWA       = this._checkPWA();
        this.isMobile    = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
        this.platformMode = this._detectMode();

        // All tracked for cleanup
        this._listeners  = [];   // { element, event, handler }
        this._styleNodes = [];   // injected <style> elements
        this._domNodes   = [];   // injected DOM elements

        this._init();

        console.log(`🔍 Platform: ${this.platformMode} | ChromeOS=${this.isChromeos} | Extension=${this.isExtension} | PWA=${this.isPWA} | Mobile=${this.isMobile}`);
    }

    // ─── Detection ────────────────────────────────────────────────────────────

    _checkExtension() {
        return typeof chrome !== 'undefined' &&
               !!chrome.runtime?.id &&
               window.location.protocol === 'chrome-extension:';
    }

    _checkPWA() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    _detectMode() {
        if (this.isExtension)                   return 'extension-chromeos';
        if (this.isChromeos && this.isPWA)       return 'pwa-chromeos';
        if (this.isChromeos)                     return 'web-chromeos';
        if (this.isMobile)                       return 'mobile';
        return 'desktop-web';
    }

    // ─── Bootstrap ────────────────────────────────────────────────────────────

    _init() {
        // Run setup that needs the DOM.
        // If DOMContentLoaded has already fired (normal for deferred scripts),
        // _whenReady runs the callback synchronously via setTimeout(0).
        if (this.isChromeos)  this._whenReady(() => this._setupChromeOS());
        if (this.isExtension) this._whenReady(() => this._setupExtension());
        if (this.isPWA)       this._setupPWA();   // no DOM dependency
    }

    /**
     * Runs `fn` after the DOM is ready, whether or not DOMContentLoaded
     * has already fired. Uses setTimeout(0) to keep the constructor non-blocking.
     */
    _whenReady(fn) {
        if (document.readyState === 'loading') {
            const handler = () => { document.removeEventListener('DOMContentLoaded', handler); fn(); };
            document.addEventListener('DOMContentLoaded', handler);
        } else {
            setTimeout(fn, 0);
        }
    }

    // ─── ChromeOS ─────────────────────────────────────────────────────────────

    _setupChromeOS() {
        // Ensure the folder picker button is visible if the API is available
        const folderBtn = document.getElementById('folder-button');
        if (folderBtn && 'showDirectoryPicker' in window) {
            folderBtn.style.display = 'inline-block';
        }

        // ChromeOS-specific keyboard shortcuts
        const kbHandler = (e) => {
            // Alt+M — toggle mini/sticky player
            if (e.altKey && e.key === 'm') {
                e.preventDefault();
                document.getElementById('sticky-toggle')?.click();
            }

            // Ctrl+Shift+L — open folder picker
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();
                const btn = document.getElementById('folder-button');
                if (btn && !btn.disabled) btn.click();
            }
        };

        document.addEventListener('keydown', kbHandler);
        this._listeners.push({ element: document, event: 'keydown', handler: kbHandler });

        // Touch-target sizing for hybrid touch+keyboard devices
        this._setupHybridInput();
    }

    _setupHybridInput() {
        // Flag touch use so CSS or other code can react
        const onTouch = () => document.body.classList.add('touch-active');
        document.addEventListener('touchstart', onTouch, { passive: true });
        this._listeners.push({ element: document, event: 'touchstart', handler: onTouch });

        // Larger tap targets on coarse-pointer (touchscreen) devices
        const style = document.createElement('style');
        style.textContent = `
            @media (hover: none) and (pointer: coarse) {
                button, input[type="range"] {
                    min-height: 48px;
                    padding: 14px 20px !important;
                }
            }
        `;
        document.head.appendChild(style);
        this._styleNodes.push(style);
    }

    // ─── Extension ────────────────────────────────────────────────────────────

    _setupExtension() {
        // Ping background script — always check lastError to avoid uncaught errors
        chrome.runtime.sendMessage({ action: 'get-extension-info' }, (response) => {
            if (chrome.runtime.lastError) return; // background not ready — silently ignore
            if (response) {
                console.log(`🔌 Extension connected (ID: ${response.extensionId}, platform: ${response.platform})`);
            }
        });

        // Keep the service worker alive while audio is playing
        const player = document.getElementById('audio-player');
        if (player) {
            const keepAlive = () => {
                chrome.runtime.sendMessage({ action: 'keep-alive' }, () => {
                    if (chrome.runtime.lastError) {} // ignore
                });
            };
            player.addEventListener('play', keepAlive);
            this._listeners.push({ element: player, event: 'play', handler: keepAlive });
        }

        // Inject a window-minimize button for the extension popup
        this._setupWindowControls();
    }

    _setupWindowControls() {
        // Guard against duplicate injection
        if (document.getElementById('minimize-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'minimize-btn';
        btn.textContent = '−';
        btn.style.cssText = [
            'position:fixed', 'top:10px', 'right:10px',
            'width:32px', 'height:32px', 'border-radius:50%',
            'padding:0', 'font-size:20px', 'z-index:9999',
            'background:linear-gradient(135deg,#666 0%,#555 100%)',
            'cursor:pointer', 'border:none', 'color:#fff',
        ].join(';');

        btn.onclick = () => {
            chrome.windows.getCurrent(win => {
                chrome.windows.update(win.id, { state: 'minimized' });
            });
        };

        document.body.appendChild(btn);
        this._domNodes.push(btn);
    }

    // ─── PWA ─────────────────────────────────────────────────────────────────
    // No DOM manipulation needed here — background-audio-handler already handles
    // persistent storage. We keep this hook for any future PWA-specific needs.

    _setupPWA() {
        // Reserved for future PWA-specific behaviour
    }

    // ─── Public capability queries ────────────────────────────────────────────

    canAccessFilesystem()          { return 'showDirectoryPicker' in window; }
    canUseBluetoothAPI()           { return 'bluetooth' in navigator; }
    supportsLauncherIntegration()  { return this.isExtension || this.isPWA; }

    getStorageRecommendation() {
        return this.isExtension
            ? { type: 'chrome.storage.local', limitMB: 10 }
            : { type: 'localStorage',         limitMB:  5 };
    }

    logPlatformInfo() {
        console.table({
            mode:                this.platformMode,
            isChromeos:          this.isChromeos,
            isExtension:         this.isExtension,
            isPWA:               this.isPWA,
            isMobile:            this.isMobile,
            filesystemAccess:    this.canAccessFilesystem(),
            bluetoothAccess:     this.canUseBluetoothAPI(),
            launcherIntegration: this.supportsLauncherIntegration(),
        });
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        this._listeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this._listeners = [];

        this._styleNodes.forEach(n => n.parentNode?.removeChild(n));
        this._styleNodes = [];

        this._domNodes.forEach(n => n.parentNode?.removeChild(n));
        this._domNodes = [];
    }
}

// ─── Global instance ──────────────────────────────────────────────────────────

window.chromeosPlatform = new ChromeOSDetector();
