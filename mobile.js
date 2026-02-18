/* ============================================
   Mobile Integration — v2.0
   Handles touch, rotation, haptics, gestures,
   PWA install, and iOS/Android quirks.
   ============================================ */

class MobileOptimizer {

    constructor() {
        this.isMobile  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isIOS     = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        this.isAndroid = /Android/i.test(navigator.userAgent);
        this.isPWA     = window.matchMedia('(display-mode: standalone)').matches;

        this.initialized    = false;
        this._cleanupFns    = [];
        this._deferredPrompt = null;

        // Haptic is set up first so it's always safe to call
        this._setupHaptic();

        console.log(`📱 MobileOptimizer: mobile=${this.isMobile} iOS=${this.isIOS} Android=${this.isAndroid} PWA=${this.isPWA}`);
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    async init() {
        if (!this.isMobile || this.initialized) return;

        console.log('🚀 Initializing mobile optimizations…');

        if (document.readyState === 'loading') {
            await new Promise(resolve =>
                document.addEventListener('DOMContentLoaded', resolve, { once: true })
            );
        }

        this._setupViewport();
        this._preventZoom();
        this._setupTouchStyles();
        this._ensureMinTouchTargets();
        this._setupSwipeGestures();
        this._setupRotationHandling();
        this._setupScrollContainment();
        this._addFloatingPlayButton();
        this._setupPullToRefresh();
        this._showGestureHint();
        this._setupLongPressContextMenu();
        this._setupInstallPrompt();

        if (this.isIOS) {
            this._fixIOSAudio();
            this._fixIOSViewportHeight();
        }

        if (this.isAndroid) {
            this._setupAndroidFullscreen();
        }

        this._autoEnableCompactMode();

        this.initialized = true;
        console.log('✅ Mobile optimizations complete');
    }

    destroy() {
        console.log('🧹 Cleaning up mobile optimizations…');
        this._cleanupFns.forEach(fn => { try { fn(); } catch (_) {} });
        this._cleanupFns = [];
        this.initialized = false;
    }

    // Expose so external callers (e.g. context menu buttons) can use it
    triggerHaptic(type = 'light') {
        this._haptic(type);
    }

    // ─── Haptic (set up first, referenced everywhere) ─────────────────────────

    _setupHaptic() {
        const patterns = {
            light:   [10],
            medium:  [20],
            heavy:   [30],
            success: [10, 50, 10],
            error:   [50, 100, 50],
            warning: [20, 40, 20],
        };

        this._haptic = (type = 'light') => {
            if (!('vibrate' in navigator)) return;
            navigator.vibrate(patterns[type] || patterns.light);
        };

        // Global alias for legacy callers
        window.triggerHaptic = this._haptic;
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    _setupViewport() {
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = Object.assign(document.createElement('meta'), { name: 'viewport' });
            document.head.appendChild(meta);
        }
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

        // CSS variables for safe-area insets (notched devices)
        this._injectStyle('mobile-viewport', `
            :root {
                --sat: env(safe-area-inset-top,    0px);
                --sab: env(safe-area-inset-bottom, 0px);
                --sal: env(safe-area-inset-left,   0px);
                --sar: env(safe-area-inset-right,  0px);
            }
        `);
    }

    // ─── Zoom prevention ──────────────────────────────────────────────────────

    _preventZoom() {
        // Double-tap prevention
        let lastTouchEnd = 0;
        const onTouchEnd = e => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = now;
        };
        document.addEventListener('touchend', onTouchEnd, { passive: false });
        this._cleanupFns.push(() => document.removeEventListener('touchend', onTouchEnd));

        // Pinch-zoom prevention (Safari)
        if ('gesturestart' in window) {
            const prevent = e => e.preventDefault();
            ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => {
                document.addEventListener(ev, prevent, { passive: false });
                this._cleanupFns.push(() => document.removeEventListener(ev, prevent));
            });
        }
    }

    // ─── Touch styles ─────────────────────────────────────────────────────────

    _setupTouchStyles() {
        this._injectStyle('mobile-touch', `
            button, .playlist-item, .eq-slider {
                transition: transform 0.1s ease, opacity 0.1s ease !important;
            }
            button:active, .playlist-item:active {
                transform: scale(0.95) !important;
                opacity: 0.8 !important;
            }

            @media (max-width: 768px) {
                button {
                    padding: 16px 20px !important;
                    font-size: 16px !important;
                    min-height: 48px !important;
                    min-width: 48px !important;
                    touch-action: manipulation;
                }
                .playlist-item {
                    padding: 16px 12px !important;
                    min-height: 70px !important;
                    touch-action: manipulation;
                }
                #volume-slider, .eq-slider {
                    min-height: 44px !important;
                    touch-action: none;
                }
                .lyric-line            { font-size: 1.4em !important; padding: 12px 10px !important; }
                .lyric-line.active     { font-size: 1.7em !important; }
                #controls              { gap: 12px !important; justify-content: space-around !important; flex-wrap: wrap; }
                #metadata-container    { flex-direction: column !important; text-align: center !important; }
                #cover-art-container   { width: min(300px, 80vw) !important; height: min(300px, 80vw) !important; margin: 0 auto 20px !important; }
            }

            @media (max-width: 480px) {
                button               { font-size: 14px !important; padding: 14px 16px !important; }
                #cover-art-container { width: min(250px, 90vw) !important; height: min(250px, 90vw) !important; }
            }
        `);
    }

    // ─── Minimum touch-target enforcement ─────────────────────────────────────

    _ensureMinTouchTargets() {
        document.querySelectorAll('button, input[type="checkbox"], input[type="radio"]').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width  < 44) el.style.minWidth  = '44px';
            if (r.height < 44) el.style.minHeight = '44px';
        });
    }

    // ─── Swipe gestures ───────────────────────────────────────────────────────

    _setupSwipeGestures() {
        const container = document.getElementById('metadata-container');
        if (!container) return;

        const MIN_DIST   = 50;
        const MAX_TIME   = 350;
        const MAX_ANGLE  = 35; // degrees from horizontal

        let startX = 0, startY = 0, startTime = 0, active = false;

        const onStart = e => {
            startX    = e.touches[0].clientX;
            startY    = e.touches[0].clientY;
            startTime = Date.now();
            active    = true;
        };

        const onMove = e => {
            if (!active) return;
            const dx = Math.abs(e.touches[0].clientX - startX);
            const dy = Math.abs(e.touches[0].clientY - startY);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            // Prevent vertical scroll only when swipe is clearly horizontal
            if (dx > 10 && angle < MAX_ANGLE) e.preventDefault();
        };

        const onEnd = e => {
            if (!active) return;
            active = false;

            const dx   = e.changedTouches[0].clientX - startX;
            const dy   = e.changedTouches[0].clientY - startY;
            const dt   = Date.now() - startTime;
            const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;

            if (Math.abs(dx) >= MIN_DIST && dt <= MAX_TIME && angle < MAX_ANGLE) {
                if (dx > 0) { this._prevTrack(); }
                else        { this._nextTrack(); }
            }
        };

        container.addEventListener('touchstart', onStart, { passive: true  });
        container.addEventListener('touchmove',  onMove,  { passive: false });
        container.addEventListener('touchend',   onEnd,   { passive: true  });

        this._cleanupFns.push(() => {
            container.removeEventListener('touchstart', onStart);
            container.removeEventListener('touchmove',  onMove);
            container.removeEventListener('touchend',   onEnd);
        });
    }

    _prevTrack() {
        const btn = document.getElementById('prev-button');
        if (btn && !btn.disabled) {
            btn.click();
            this._showSwipeFeedback('⏮ Previous');
            this._haptic('medium');
        }
    }

    _nextTrack() {
        const btn = document.getElementById('next-button');
        if (btn && !btn.disabled) {
            btn.click();
            this._showSwipeFeedback('⏭ Next');
            this._haptic('medium');
        }
    }

    _showSwipeFeedback(text) {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = `
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.92); color: #fff;
            padding: 18px 36px; border-radius: 12px;
            font-size: 1.4em; font-weight: bold;
            z-index: 10000; pointer-events: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            opacity: 1; transition: opacity 0.35s ease;
        `;
        document.body.appendChild(el);

        // Trigger fade-out on next frame so the transition actually fires
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity = '0';
            });
        });

        setTimeout(() => el.remove(), 700);
    }

    // ─── Rotation / resize ────────────────────────────────────────────────────

    _setupRotationHandling() {
        const handle = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);

            const canvas = document.getElementById('visualizer');
            if (canvas?.parentElement) {
                canvas.width  = canvas.parentElement.offsetWidth;
                canvas.height = canvas.parentElement.offsetHeight;
            }

            if (this.isMobile) window.scrollTo(0, 0);
        };

        // Prefer the modern orientation API
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handle);
            this._cleanupFns.push(() => screen.orientation.removeEventListener('change', handle));
        }

        // Resize catches everything else (address-bar show/hide on Android etc.)
        let raf = null;
        const onResize = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { raf = null; handle(); });
        };
        window.addEventListener('resize', onResize, { passive: true });
        this._cleanupFns.push(() => {
            window.removeEventListener('resize', onResize);
            if (raf) cancelAnimationFrame(raf);
        });

        this._injectStyle('mobile-vh', `
            .full-height { height: calc(var(--vh, 1vh) * 100); }
        `);

        handle(); // initial
    }

    // ─── Scroll containment ───────────────────────────────────────────────────

    _setupScrollContainment() {
        ['playlist-items', 'lyrics-display', 'debug-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            el.style.webkitOverflowScrolling = 'touch';
            el.style.overscrollBehavior      = 'contain';

            let startY = 0;
            const onStart = e => { startY = e.touches[0].clientY; };
            const onMove  = e => {
                const dy      = e.touches[0].clientY - startY;
                const atTop   = el.scrollTop === 0;
                const atBot   = el.scrollTop + el.clientHeight >= el.scrollHeight;
                if ((atTop && dy > 0) || (atBot && dy < 0)) e.preventDefault();
            };

            el.addEventListener('touchstart', onStart, { passive: true  });
            el.addEventListener('touchmove',  onMove,  { passive: false });
            this._cleanupFns.push(() => {
                el.removeEventListener('touchstart', onStart);
                el.removeEventListener('touchmove',  onMove);
            });
        });
    }

    // ─── Floating play/pause button ───────────────────────────────────────────

    _addFloatingPlayButton() {
        const player = document.getElementById('audio-player');
        if (!player) return;

        const btn = document.createElement('button');
        btn.id = 'mobile-play-btn';
        btn.setAttribute('aria-label', 'Play / Pause');
        btn.innerHTML = '▶️';
        btn.style.cssText = `
            position: fixed;
            bottom: calc(20px + var(--sab, 0px));
            right:  calc(20px + var(--sar, 0px));
            width: 64px; height: 64px;
            border-radius: 50%;
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: #fff; font-size: 26px; border: none;
            box-shadow: 0 4px 20px rgba(220,53,69,0.5);
            z-index: 9999; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.15s ease;
            touch-action: manipulation;
        `;

        const sync = () => { btn.innerHTML = player.paused ? '▶️' : '⏸️'; };

        btn.addEventListener('click', () => {
            if (player.paused) { player.play(); } else { player.pause(); }
            this._haptic('light');
        });

        player.addEventListener('play',  sync);
        player.addEventListener('pause', sync);

        document.body.appendChild(btn);
        sync();

        this._cleanupFns.push(() => {
            player.removeEventListener('play',  sync);
            player.removeEventListener('pause', sync);
            btn.remove();
        });
    }

    // ─── Pull-to-refresh ──────────────────────────────────────────────────────

    _setupPullToRefresh() {
        const list = document.getElementById('playlist-items');
        if (!list) return;

        const THRESHOLD = 80;
        const MAX_PULL  = 150;
        let startY = 0, currentY = 0, dragging = false;
        let indicator = null;

        const getIndicator = () => {
            if (indicator) return indicator;
            indicator = document.createElement('div');
            indicator.style.cssText = `
                position: absolute; top: -56px; left: 0;
                width: 100%; height: 56px;
                background: linear-gradient(180deg, #1a1a1a, transparent);
                color: #fff; display: flex; align-items: center;
                justify-content: center; font-size: 13px;
                z-index: 1000; pointer-events: none;
                transition: transform 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            `;
            list.style.position = 'relative';
            list.insertBefore(indicator, list.firstChild);
            return indicator;
        };

        const hideIndicator = () => {
            if (!indicator) return;
            indicator.style.transform = '';
            indicator.style.opacity   = '0';
        };

        const onStart = e => {
            if (list.scrollTop === 0) {
                startY   = e.touches[0].clientY;
                dragging = true;
            }
        };

        const onMove = e => {
            if (!dragging) return;
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            if (diff <= 0 || list.scrollTop > 0) return;

            e.preventDefault();
            const ind      = getIndicator();
            const pull     = Math.min(diff, MAX_PULL);
            const progress = Math.min(diff / THRESHOLD, 1);
            ind.style.transform = `translateY(${pull}px)`;
            ind.style.opacity   = String(progress);
            ind.textContent     = progress >= 1 ? '🔄 Release to refresh' : '⬇️ Pull to refresh';
            if (progress >= 1) this._haptic('light');
        };

        const onEnd = async () => {
            if (!dragging) return;
            dragging = false;

            const diff = currentY - startY;
            if (diff < THRESHOLD) { hideIndicator(); return; }

            const ind = getIndicator();
            ind.textContent     = '⏳ Refreshing…';
            ind.style.transform = 'translateY(0)';
            ind.style.opacity   = '1';

            try {
                // Use the app instance if available
                const app = window.musicPlayerApp;
                if (app && app.state.folderHandle) {
                    await app.loadFromFolder(app.state.folderHandle);
                    ind.textContent = '✅ Refreshed!';
                    this._haptic('success');
                } else {
                    ind.textContent = '⚠️ No folder loaded';
                    this._haptic('warning');
                }
            } catch (err) {
                ind.textContent = '❌ Refresh failed';
                this._haptic('error');
                console.error('Pull-to-refresh error:', err);
            }

            setTimeout(hideIndicator, 1500);
        };

        list.addEventListener('touchstart', onStart, { passive: true  });
        list.addEventListener('touchmove',  onMove,  { passive: false });
        list.addEventListener('touchend',   onEnd,   { passive: true  });

        this._cleanupFns.push(() => {
            list.removeEventListener('touchstart', onStart);
            list.removeEventListener('touchmove',  onMove);
            list.removeEventListener('touchend',   onEnd);
            indicator?.remove();
        });
    }

    // ─── One-time gesture hint ────────────────────────────────────────────────

    _showGestureHint() {
        // Guard with sessionStorage so it only shows once per session
        // (avoids failing in private browsing unlike localStorage)
        let shown = false;
        try { shown = !!sessionStorage.getItem('mobileHintShown'); } catch (_) {}
        if (shown) return;
        try { sessionStorage.setItem('mobileHintShown', '1'); } catch (_) {}

        const hint = document.createElement('div');
        hint.textContent = '⬅️  Swipe cover for prev / next  ➡️';
        hint.style.cssText = `
            position: fixed; bottom: 110px; left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.88); color: #fff;
            padding: 11px 22px; border-radius: 8px; font-size: 13px;
            z-index: 9998; pointer-events: none;
            opacity: 0; transition: opacity 0.5s ease;
            border: 1px solid #dc3545;
            white-space: nowrap;
        `;
        document.body.appendChild(hint);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => { hint.style.opacity = '1'; });
        });

        setTimeout(() => {
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 600);
        }, 3500);
    }

    // ─── Long-press context menu ──────────────────────────────────────────────

    _setupLongPressContextMenu() {
        const list = document.getElementById('playlist-items');
        if (!list) return;

        let timer = null;
        let suppressNextClick = false;

        const cancel = () => {
            if (timer) { clearTimeout(timer); timer = null; }
        };

        const onStart = e => {
            const item = e.target.closest('.playlist-item');
            if (!item) return;
            cancel();
            timer = setTimeout(() => {
                timer = null;
                suppressNextClick = true;
                this._showContextMenu(item, e.touches[0].clientX, e.touches[0].clientY);
                this._haptic('heavy');
            }, 500);
        };

        // Suppress the click that fires after a long-press touchend
        const onClickCapture = e => {
            if (suppressNextClick) {
                suppressNextClick = false;
                e.stopPropagation();
            }
        };

        list.addEventListener('touchstart', onStart, { passive: true });
        list.addEventListener('touchend',   cancel,  { passive: true });
        list.addEventListener('touchmove',  cancel,  { passive: true });
        list.addEventListener('click',      onClickCapture, true); // capture phase

        this._cleanupFns.push(() => {
            cancel();
            list.removeEventListener('touchstart', onStart);
            list.removeEventListener('touchend',   cancel);
            list.removeEventListener('touchmove',  cancel);
            list.removeEventListener('click',      onClickCapture, true);
        });
    }

    _showContextMenu(item, x, y) {
        document.getElementById('mobile-context-menu')?.remove();

        const title  = item.querySelector('.playlist-item-title')?.textContent  || 'Track';
        const artist = item.querySelector('.playlist-item-artist')?.textContent || 'Unknown';

        const menu = document.createElement('div');
        menu.id = 'mobile-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${Math.max(10, Math.min(x, window.innerWidth  - 215))}px;
            top:  ${Math.max(10, Math.min(y, window.innerHeight - 210))}px;
            background: #1a1a1a; border: 2px solid #dc3545;
            border-radius: 12px; padding: 8px;
            z-index: 10001; box-shadow: 0 8px 32px rgba(0,0,0,0.9);
            min-width: 200px;
        `;

        const options = [
            { icon: '▶️', label: 'Play Now',  action: () => item.click() },
            { icon: 'ℹ️', label: 'Track Info', action: () => alert(`🎵 ${title}\n👤 ${artist}`) },
            { icon: '✖️', label: 'Close',      action: () => {} },
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = `${opt.icon}  ${opt.label}`;
            btn.style.cssText = `
                width: 100%; padding: 13px 16px; margin: 3px 0;
                background: #252525; color: #fff; border: none;
                border-radius: 8px; text-align: left; font-size: 15px;
                cursor: pointer; touch-action: manipulation;
            `;
            btn.onclick = () => {
                opt.action();
                this._haptic('light');
                menu.remove();
            };
            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        // Auto-close after 5 s, or on outside tap
        const tid = setTimeout(() => menu.remove(), 5000);
        const onOutside = e => {
            if (!menu.contains(e.target)) { clearTimeout(tid); menu.remove(); }
        };
        setTimeout(() => document.addEventListener('touchstart', onOutside, { once: true, passive: true }), 80);
    }

    // ─── PWA install prompt ───────────────────────────────────────────────────

    _setupInstallPrompt() {
        if (this.isPWA) return;

        this._injectStyle('mobile-install-anim', `
            @keyframes pulse-install { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        `);

        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault();
            this._deferredPrompt = e;

            const btn = document.createElement('button');
            btn.id = 'mobile-install-btn';
            btn.innerHTML = '📲 Install App';
            btn.style.cssText = `
                position: fixed;
                top:   calc(20px + var(--sat, 0px));
                right: calc(20px + var(--sar, 0px));
                z-index: 9999;
                background: linear-gradient(135deg, #28a745, #1e7e34);
                color: #fff; border: none; padding: 12px 20px;
                border-radius: 8px; font-size: 14px; font-weight: bold;
                box-shadow: 0 4px 16px rgba(40,167,69,0.4);
                animation: pulse-install 2s infinite;
                cursor: pointer; touch-action: manipulation;
            `;

            btn.onclick = async () => {
                if (!this._deferredPrompt) return;
                this._deferredPrompt.prompt();
                const { outcome } = await this._deferredPrompt.userChoice;
                if (outcome === 'accepted') this._haptic('success');
                this._deferredPrompt = null;
                btn.remove();
            };

            document.body.appendChild(btn);
            this._cleanupFns.push(() => btn.remove());
        });

        window.addEventListener('appinstalled', () => {
            document.getElementById('mobile-install-btn')?.remove();
            this._haptic('success');
            console.log('✅ PWA installed');
        });
    }

    // ─── iOS fixes ────────────────────────────────────────────────────────────

    _fixIOSAudio() {
        let unlocked = false;
        const unlock = async () => {
            if (unlocked) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                await ctx.resume();
                unlocked = true;
                console.log('✅ iOS audio context unlocked');
            } catch (err) {
                console.warn('⚠️ iOS audio unlock:', err);
            }
        };
        ['touchstart', 'touchend', 'click'].forEach(ev =>
            document.addEventListener(ev, unlock, { once: true, passive: true })
        );
    }

    _fixIOSViewportHeight() {
        // Update --vh on resize so 100vh elements are correct in Safari
        // NOTE: Do NOT set position:fixed on body — that breaks scrolling.
        const set = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        set();
        window.addEventListener('resize', set, { passive: true });
        this._cleanupFns.push(() => window.removeEventListener('resize', set));
    }

    // ─── Android fullscreen ───────────────────────────────────────────────────

    _setupAndroidFullscreen() {
        // Fullscreen is opt-in via a button rather than auto-triggering on play,
        // because auto-trigger is disruptive and blocked by most browsers anyway.
        const existing = document.getElementById('android-fullscreen-btn');
        if (existing) return; // already added by HTML

        // Expose a helper so the app can offer fullscreen if it wants
        window.requestMobileFullscreen = async () => {
            const el = document.documentElement;
            try {
                if      (el.requestFullscreen)       await el.requestFullscreen();
                else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
            } catch (err) {
                console.warn('Fullscreen not available:', err);
            }
        };
    }

    // ─── Auto compact mode ────────────────────────────────────────────────────

    _autoEnableCompactMode() {
        if (window.innerWidth > 768) return;

        // Wait for the app to finish initialising, then switch mode
        const apply = () => {
            const app = window.musicPlayerApp;
            if (app && typeof app.applyViewMode === 'function') {
                const saved = localStorage.getItem('compactMode');
                // Only override if the user has never set a preference
                if (!saved) {
                    app.state.compactMode = 'compact';
                    app.applyViewMode('compact');
                    console.log('📱 Auto-applied compact mode');
                }
            }
        };

        // Try immediately, then retry once after a short delay in case app isn't ready
        apply();
        setTimeout(apply, 1200);
    }

    // ─── Utility ──────────────────────────────────────────────────────────────

    _injectStyle(id, css) {
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = css;
        document.head.appendChild(s);
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const mobileOptimizer = new MobileOptimizer();

if (mobileOptimizer.isMobile) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mobileOptimizer.init());
    } else {
        mobileOptimizer.init();
    }
}

window.mobileOptimizer = mobileOptimizer;
console.log('✅ mobile.js v2.0 loaded');
