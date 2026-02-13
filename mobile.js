/* ============================================
   Mobile Integration - COMPLETELY REWRITTEN
   Professional mobile experience with proper rotation,
   touch handling, and performance optimization
   ============================================ */

class MobileOptimizer {
    constructor() {
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isAndroid = /Android/i.test(navigator.userAgent);
        this.isPWA = window.matchMedia('(display-mode: standalone)').matches;
        
        this.initialized = false;
        this.cleanupFunctions = [];
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.deferredPrompt = null;
        
        console.log(`📱 Mobile Optimizer: Mobile=${this.isMobile}, iOS=${this.isIOS}, Android=${this.isAndroid}, PWA=${this.isPWA}`);
    }
    
    async init() {
        if (!this.isMobile || this.initialized) return;
        
        console.log('🚀 Initializing mobile optimizations...');
        
        // Wait for DOM to be fully ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
        }
        
        // Initialize all features
        this.setupViewport();
        this.preventZoom();
        this.setupTouchFeedback();
        this.enlargeInteractiveElements();
        this.setupSwipeGestures();
        this.setupRotationHandling();
        this.setupScrollOptimization();
        this.addFloatingControls();
        this.setupHapticFeedback();
        this.setupPullToRefresh();
        this.addGestureIndicators();
        this.setupMobileContextMenu();
        this.optimizeFileLoading();
        this.setupInstallPrompt();
        
        // Platform-specific fixes
        if (this.isIOS) {
            this.fixIOSAudio();
            this.fixIOSViewport();
        }
        
        if (this.isAndroid) {
            this.setupAndroidFullscreen();
        }
        
        // Auto-enable compact mode on small screens
        this.autoEnableCompactMode();
        
        this.initialized = true;
        console.log('✅ Mobile optimization complete');
    }
    
    // ========== VIEWPORT MANAGEMENT ==========
    setupViewport() {
        // Ensure proper viewport meta tag
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        
        // Add safe area support for notched devices
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --safe-area-inset-top: env(safe-area-inset-top);
                --safe-area-inset-bottom: env(safe-area-inset-bottom);
                --safe-area-inset-left: env(safe-area-inset-left);
                --safe-area-inset-right: env(safe-area-inset-right);
            }
            
            body {
                padding-top: var(--safe-area-inset-top);
                padding-bottom: var(--safe-area-inset-bottom);
                padding-left: var(--safe-area-inset-left);
                padding-right: var(--safe-area-inset-right);
            }
        `;
        document.head.appendChild(style);
    }
    
    // ========== PREVENT ZOOM ==========
    preventZoom() {
        // Prevent double-tap zoom
        let lastTouchEnd = 0;
        const preventDoubleTap = (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        };
        
        document.addEventListener('touchend', preventDoubleTap, { passive: false });
        this.cleanupFunctions.push(() => {
            document.removeEventListener('touchend', preventDoubleTap);
        });
        
        // Prevent pinch zoom
        if ('gesturestart' in window) {
            const preventGesture = (e) => e.preventDefault();
            document.addEventListener('gesturestart', preventGesture, { passive: false });
            document.addEventListener('gesturechange', preventGesture, { passive: false });
            document.addEventListener('gestureend', preventGesture, { passive: false });
            
            this.cleanupFunctions.push(() => {
                document.removeEventListener('gesturestart', preventGesture);
                document.removeEventListener('gesturechange', preventGesture);
                document.removeEventListener('gestureend', preventGesture);
            });
        }
    }
    
    // ========== TOUCH FEEDBACK ==========
    setupTouchFeedback() {
        const style = document.createElement('style');
        style.id = 'mobile-touch-feedback';
        style.textContent = `
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
                
                .lyric-line {
                    font-size: 1.4em !important;
                    padding: 12px 10px !important;
                }
                
                .lyric-line.active {
                    font-size: 1.7em !important;
                }
                
                #controls {
                    gap: 12px !important;
                    justify-content: space-around !important;
                    flex-wrap: wrap;
                }
                
                #metadata-container {
                    flex-direction: column !important;
                    text-align: center !important;
                }
                
                #cover-art-container {
                    width: min(300px, 80vw) !important;
                    height: min(300px, 80vw) !important;
                    margin: 0 auto 20px !important;
                }
            }
            
            @media (max-width: 480px) {
                button {
                    font-size: 14px !important;
                    padding: 14px 16px !important;
                }
                
                #cover-art-container {
                    width: min(250px, 90vw) !important;
                    height: min(250px, 90vw) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // ========== ENLARGE INTERACTIVE ELEMENTS ==========
    enlargeInteractiveElements() {
        // Ensure all interactive elements meet minimum touch target size (44x44px)
        const ensureMinSize = (element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width < 44 || rect.height < 44) {
                element.style.minWidth = '44px';
                element.style.minHeight = '44px';
            }
        };
        
        document.querySelectorAll('button, input[type="checkbox"], input[type="radio"]').forEach(ensureMinSize);
    }
    
    // ========== SWIPE GESTURES (IMPROVED) ==========
    setupSwipeGestures() {
        const metadataContainer = document.getElementById('metadata-container');
        if (!metadataContainer) return;
        
        let startX = 0, startY = 0, startTime = 0;
        let isDragging = false;
        const minSwipeDistance = 50;
        const maxSwipeTime = 300;
        const angleThreshold = 30; // degrees
        
        const onTouchStart = (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startTime = Date.now();
            isDragging = true;
        };
        
        const onTouchMove = (e) => {
            if (!isDragging) return;
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = Math.abs(currentX - startX);
            const diffY = Math.abs(currentY - startY);
            
            // Calculate swipe angle
            const angle = Math.abs(Math.atan2(diffY, diffX) * 180 / Math.PI);
            
            // If swipe is mostly horizontal, prevent scrolling
            if (angle < angleThreshold || angle > (180 - angleThreshold)) {
                if (diffX > 10) {
                    e.preventDefault();
                }
            }
        };
        
        const onTouchEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = endX - startX;
            const diffY = endY - startY;
            const elapsedTime = Date.now() - startTime;
            
            // Check if it's a valid swipe
            if (Math.abs(diffX) > minSwipeDistance && 
                Math.abs(diffX) > Math.abs(diffY) && 
                elapsedTime < maxSwipeTime) {
                
                if (diffX > 0) {
                    // Swipe right - previous
                    this.handlePrevious();
                } else {
                    // Swipe left - next
                    this.handleNext();
                }
            }
        };
        
        metadataContainer.addEventListener('touchstart', onTouchStart, { passive: true });
        metadataContainer.addEventListener('touchmove', onTouchMove, { passive: false });
        metadataContainer.addEventListener('touchend', onTouchEnd, { passive: true });
        
        this.cleanupFunctions.push(() => {
            metadataContainer.removeEventListener('touchstart', onTouchStart);
            metadataContainer.removeEventListener('touchmove', onTouchMove);
            metadataContainer.removeEventListener('touchend', onTouchEnd);
        });
    }
    
    handlePrevious() {
        const prevBtn = document.getElementById('prev-button');
        if (prevBtn && !prevBtn.disabled) {
            prevBtn.click();
            this.showSwipeFeedback('⏮️ Previous');
            this.triggerHaptic('medium');
        }
    }
    
    handleNext() {
        const nextBtn = document.getElementById('next-button');
        if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
            this.showSwipeFeedback('⏭️ Next');
            this.triggerHaptic('medium');
        }
    }
    
    showSwipeFeedback(text) {
        const feedback = document.createElement('div');
        feedback.textContent = text;
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            color: white;
            padding: 20px 40px;
            border-radius: 12px;
            font-size: 1.5em;
            font-weight: bold;
            z-index: 10000;
            pointer-events: none;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            feedback.style.opacity = '0';
            feedback.style.transition = 'opacity 0.3s ease';
        }, 500);
        
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 800);
    }
    
    // ========== ROTATION HANDLING (FIXED) ==========
    setupRotationHandling() {
        const handleRotation = () => {
            // Update canvas dimensions
            const canvas = document.getElementById('visualizer');
            if (canvas) {
                const container = canvas.parentElement;
                if (container) {
                    canvas.width = container.offsetWidth;
                    canvas.height = container.offsetHeight;
                }
            }
            
            // Force layout recalculation
            document.body.style.minHeight = `${window.innerHeight}px`;
            
            // Update viewport height CSS variable for responsive sizing
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
            
            // Fix for mobile address bar
            if (this.isMobile) {
                window.scrollTo(0, 0);
            }
            
            console.log(`📱 Rotation handled: ${window.innerWidth}x${window.innerHeight}`);
        };
        
        // Modern API: screen.orientation
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleRotation);
            this.cleanupFunctions.push(() => {
                screen.orientation.removeEventListener('change', handleRotation);
            });
        }
        
        // Fallback: window resize (catches rotation on all devices)
        let resizeTimeout;
        const onResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleRotation, 100);
        };
        
        window.addEventListener('resize', onResize, { passive: true });
        this.cleanupFunctions.push(() => {
            window.removeEventListener('resize', onResize);
        });
        
        // Initial call
        handleRotation();
        
        // Add CSS for viewport height
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --vh: 1vh;
            }
            
            .full-height {
                height: calc(var(--vh, 1vh) * 100);
            }
        `;
        document.head.appendChild(style);
    }
    
    // ========== SCROLL OPTIMIZATION ==========
    setupScrollOptimization() {
        // Mark scrollable containers
        const scrollContainers = [
            'playlist-items',
            'lyrics-display',
            'debug-panel'
        ];
        
        scrollContainers.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.webkitOverflowScrolling = 'touch';
                element.style.overscrollBehavior = 'contain';
            }
        });
        
        // Prevent body scroll when at top/bottom of scrollable containers
        scrollContainers.forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;
            
            let startY = 0;
            
            element.addEventListener('touchstart', (e) => {
                startY = e.touches[0].clientY;
            }, { passive: true });
            
            element.addEventListener('touchmove', (e) => {
                const currentY = e.touches[0].clientY;
                const isAtTop = element.scrollTop === 0;
                const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight;
                
                // Prevent pull-down when at top
                if (isAtTop && currentY > startY) {
                    e.preventDefault();
                }
                
                // Prevent push-up when at bottom
                if (isAtBottom && currentY < startY) {
                    e.preventDefault();
                }
            }, { passive: false });
        });
    }
    
    // ========== FLOATING CONTROLS ==========
    addFloatingControls() {
        const floatingBtn = document.createElement('button');
        floatingBtn.id = 'mobile-play-btn';
        floatingBtn.innerHTML = '▶️';
        floatingBtn.setAttribute('aria-label', 'Play/Pause');
        floatingBtn.style.cssText = `
            position: fixed;
            bottom: calc(20px + var(--safe-area-inset-bottom));
            right: calc(20px + var(--safe-area-inset-right));
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            color: white;
            font-size: 28px;
            border: none;
            box-shadow: 0 4px 20px rgba(220, 53, 69, 0.5);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s ease;
            touch-action: manipulation;
        `;
        
        floatingBtn.addEventListener('click', () => {
            const player = document.getElementById('audio-player');
            if (player) {
                if (player.paused) {
                    player.play();
                    floatingBtn.innerHTML = '⏸️';
                    this.triggerHaptic('light');
                } else {
                    player.pause();
                    floatingBtn.innerHTML = '▶️';
                    this.triggerHaptic('light');
                }
            }
        });
        
        document.body.appendChild(floatingBtn);
        
        // Sync with player state
        const player = document.getElementById('audio-player');
        if (player) {
            player.addEventListener('play', () => {
                floatingBtn.innerHTML = '⏸️';
            });
            
            player.addEventListener('pause', () => {
                floatingBtn.innerHTML = '▶️';
            });
        }
        
        this.cleanupFunctions.push(() => {
            if (floatingBtn.parentNode) {
                floatingBtn.parentNode.removeChild(floatingBtn);
            }
        });
    }
    
    // ========== HAPTIC FEEDBACK ==========
    setupHapticFeedback() {
        // Make available globally
        window.triggerHaptic = (type = 'light') => {
            if (!('vibrate' in navigator)) return;
            
            const patterns = {
                light: [10],
                medium: [20],
                heavy: [30],
                success: [10, 50, 10],
                error: [50, 100, 50],
                warning: [20, 40, 20],
                double: [10, 50, 10]
            };
            
            navigator.vibrate(patterns[type] || patterns.light);
        };
        
        this.triggerHaptic = window.triggerHaptic;
    }
    
    // ========== PULL TO REFRESH ==========
    setupPullToRefresh() {
        const playlistContainer = document.getElementById('playlist-items');
        if (!playlistContainer) return;
        
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let indicator = null;
        const threshold = 80;
        const maxPull = 150;
        
        const createIndicator = () => {
            if (indicator) return indicator;
            
            indicator = document.createElement('div');
            indicator.id = 'pull-refresh-indicator';
            indicator.style.cssText = `
                position: absolute;
                top: -60px;
                left: 0;
                width: 100%;
                height: 60px;
                background: linear-gradient(180deg, #1a1a1a 0%, transparent 100%);
                color: #fff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                transition: transform 0.3s ease;
                z-index: 1000;
                pointer-events: none;
            `;
            
            playlistContainer.style.position = 'relative';
            playlistContainer.insertBefore(indicator, playlistContainer.firstChild);
            return indicator;
        };
        
        const onTouchStart = (e) => {
            if (playlistContainer.scrollTop === 0) {
                startY = e.touches[0].clientY;
                isDragging = true;
            }
        };
        
        const onTouchMove = (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            
            if (diff > 0 && diff < maxPull && playlistContainer.scrollTop === 0) {
                e.preventDefault();
                const ind = createIndicator();
                const progress = Math.min(diff / threshold, 1);
                
                ind.style.transform = `translateY(${Math.min(diff, maxPull)}px)`;
                ind.style.opacity = progress;
                
                if (progress >= 1) {
                    ind.innerHTML = '🔄 Release to refresh';
                    this.triggerHaptic('light');
                } else {
                    ind.innerHTML = '⬇️ Pull to refresh';
                }
            }
        };
        
        const onTouchEnd = async () => {
            if (!isDragging) return;
            isDragging = false;
            
            const diff = currentY - startY;
            const ind = createIndicator();
            
            if (diff > threshold) {
                ind.innerHTML = '⏳ Refreshing...';
                ind.style.transform = 'translateY(0)';
                ind.style.opacity = '1';
                
                try {
                    // Reload folder if available
                    if (typeof folderHandle !== 'undefined' && folderHandle && typeof loadFromFolder === 'function') {
                        await loadFromFolder();
                        ind.innerHTML = '✅ Refreshed!';
                        this.triggerHaptic('success');
                    } else {
                        ind.innerHTML = '⚠️ No folder loaded';
                        this.triggerHaptic('warning');
                    }
                } catch (err) {
                    ind.innerHTML = '❌ Refresh failed';
                    this.triggerHaptic('error');
                    console.error('Pull-to-refresh error:', err);
                }
                
                setTimeout(() => {
                    ind.style.transform = 'translateY(-60px)';
                    ind.style.opacity = '0';
                }, 1500);
            } else {
                ind.style.transform = 'translateY(-60px)';
                ind.style.opacity = '0';
            }
        };
        
        playlistContainer.addEventListener('touchstart', onTouchStart, { passive: true });
        playlistContainer.addEventListener('touchmove', onTouchMove, { passive: false });
        playlistContainer.addEventListener('touchend', onTouchEnd, { passive: true });
        
        this.cleanupFunctions.push(() => {
            playlistContainer.removeEventListener('touchstart', onTouchStart);
            playlistContainer.removeEventListener('touchmove', onTouchMove);
            playlistContainer.removeEventListener('touchend', onTouchEnd);
            if (indicator && indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        });
    }
    
    // ========== GESTURE INDICATORS ==========
    addGestureIndicators() {
        if (localStorage.getItem('mobile-gesture-hint-shown')) return;
        
        const hint = document.createElement('div');
        hint.className = 'mobile-gesture-hint';
        hint.textContent = '⬅️ Swipe for previous/next ➡️';
        hint.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 9998;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.5s ease;
            border: 2px solid #dc3545;
        `;
        document.body.appendChild(hint);
        
        setTimeout(() => {
            hint.style.opacity = '1';
        }, 1000);
        
        setTimeout(() => {
            hint.style.opacity = '0';
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.parentNode.removeChild(hint);
                }
            }, 500);
        }, 4000);
        
        localStorage.setItem('mobile-gesture-hint-shown', 'true');
    }
    
    // ========== MOBILE CONTEXT MENU ==========
    setupMobileContextMenu() {
        const playlistItems = document.getElementById('playlist-items');
        if (!playlistItems) return;
        
        let pressTimer;
        let longPressTriggered = false;
        
        const onTouchStart = (e) => {
            const item = e.target.closest('.playlist-item');
            if (!item) return;
            
            longPressTriggered = false;
            pressTimer = setTimeout(() => {
                longPressTriggered = true;
                this.showContextMenu(item, e.touches[0].clientX, e.touches[0].clientY);
                this.triggerHaptic('heavy');
            }, 500);
        };
        
        const onTouchEnd = () => {
            clearTimeout(pressTimer);
        };
        
        const onTouchMove = () => {
            clearTimeout(pressTimer);
        };
        
        playlistItems.addEventListener('touchstart', onTouchStart, { passive: true });
        playlistItems.addEventListener('touchend', onTouchEnd, { passive: true });
        playlistItems.addEventListener('touchmove', onTouchMove, { passive: true });
        
        this.cleanupFunctions.push(() => {
            playlistItems.removeEventListener('touchstart', onTouchStart);
            playlistItems.removeEventListener('touchend', onTouchEnd);
            playlistItems.removeEventListener('touchmove', onTouchMove);
        });
    }
    
    showContextMenu(item, x, y) {
        // Remove existing menu
        const existing = document.getElementById('mobile-context-menu');
        if (existing) existing.remove();
        
        const menu = document.createElement('div');
        menu.id = 'mobile-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${Math.max(10, Math.min(x, window.innerWidth - 210))}px;
            top: ${Math.max(10, Math.min(y, window.innerHeight - 200))}px;
            background: #1a1a1a;
            border: 2px solid #dc3545;
            border-radius: 12px;
            padding: 8px;
            z-index: 10001;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
            min-width: 200px;
        `;
        
        const title = item.querySelector('.playlist-item-title')?.textContent || 'Track';
        const artist = item.querySelector('.playlist-item-artist')?.textContent || 'Unknown';
        
        const options = [
            { icon: '▶️', text: 'Play Now', action: () => item.click() },
            { icon: 'ℹ️', text: 'Info', action: () => this.showTrackInfo(title, artist) },
            { icon: '❌', text: 'Cancel', action: () => menu.remove() }
        ];
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.innerHTML = `${opt.icon} ${opt.text}`;
            btn.style.cssText = `
                width: 100%;
                padding: 14px 16px;
                margin: 4px 0;
                background: #222;
                color: white;
                border: none;
                border-radius: 8px;
                text-align: left;
                font-size: 15px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            btn.onclick = () => {
                opt.action();
                this.triggerHaptic('light');
                menu.remove();
            };
            menu.appendChild(btn);
        });
        
        document.body.appendChild(menu);
        
        // Auto-close
        setTimeout(() => {
            if (menu.parentNode) menu.remove();
        }, 5000);
        
        // Close on tap outside
        const closeOnTap = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('touchstart', closeOnTap);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('touchstart', closeOnTap, { once: true, passive: true });
        }, 100);
    }
    
    showTrackInfo(title, artist) {
        alert(`🎵 Track Info\n\nTitle: ${title}\nArtist: ${artist}`);
    }
    
    // ========== FILE LOADING OPTIMIZATION ==========
    optimizeFileLoading() {
        const loadButton = document.getElementById('load-button');
        const folderButton = document.getElementById('folder-button');
        
        // Hide folder button on unsupported browsers
        if (folderButton && !('showDirectoryPicker' in window)) {
            folderButton.style.display = 'none';
        }
        
        // Add helper text
        if (loadButton) {
            const helper = document.createElement('div');
            helper.textContent = 'Tap to select music files';
            helper.style.cssText = `
                text-align: center;
                color: #888;
                font-size: 13px;
                margin: 8px 0;
            `;
            
            if (loadButton.parentNode) {
                loadButton.parentNode.insertBefore(helper, loadButton.nextSibling);
            }
        }
    }
    
    // ========== INSTALL PROMPT ==========
    setupInstallPrompt() {
        if (this.isPWA) return; // Already installed
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            
            const installBtn = document.createElement('button');
            installBtn.id = 'mobile-install-btn';
            installBtn.innerHTML = '📲 Install App';
            installBtn.style.cssText = `
                position: fixed;
                top: calc(20px + var(--safe-area-inset-top));
                right: calc(20px + var(--safe-area-inset-right));
                z-index: 9999;
                background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 16px rgba(40, 167, 69, 0.4);
                animation: pulse-install 2s infinite;
                cursor: pointer;
            `;
            
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse-install {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
            `;
            document.head.appendChild(style);
            
            installBtn.onclick = async () => {
                if (this.deferredPrompt) {
                    this.deferredPrompt.prompt();
                    const { outcome } = await this.deferredPrompt.userChoice;
                    console.log(`📲 Install ${outcome}`);
                    
                    if (outcome === 'accepted') {
                        this.triggerHaptic('success');
                    }
                    
                    this.deferredPrompt = null;
                    installBtn.remove();
                }
            };
            
            document.body.appendChild(installBtn);
        });
        
        window.addEventListener('appinstalled', () => {
            const installBtn = document.getElementById('mobile-install-btn');
            if (installBtn) installBtn.remove();
            console.log('✅ App installed');
            this.triggerHaptic('success');
        });
    }
    
    // ========== iOS FIXES ==========
    fixIOSAudio() {
        let unlocked = false;
        
        const unlockAudio = async () => {
            if (unlocked) return;
            
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                await audioCtx.resume();
                
                const player = document.getElementById('audio-player');
                if (player) {
                    const playPromise = player.play();
                    if (playPromise !== undefined) {
                        await playPromise.catch(() => {});
                        player.pause();
                        player.currentTime = 0;
                    }
                }
                
                unlocked = true;
                console.log('✅ iOS audio unlocked');
            } catch (err) {
                console.log('⚠️ iOS audio unlock attempt failed:', err);
            }
        };
        
        // Try on first interaction
        const events = ['touchstart', 'touchend', 'click'];
        events.forEach(event => {
            document.addEventListener(event, unlockAudio, { once: true, passive: true });
        });
    }
    
    fixIOSViewport() {
        // Fix iOS Safari viewport height bug
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight, { passive: true });
        
        // Prevent iOS Safari from hiding the address bar on scroll
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
    }
    
    // ========== ANDROID FULLSCREEN ==========
    setupAndroidFullscreen() {
        const player = document.getElementById('audio-player');
        if (!player) return;
        
        const enterFullscreen = async () => {
            try {
                const elem = document.documentElement;
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) {
                    await elem.webkitRequestFullscreen();
                } else if (elem.mozRequestFullScreen) {
                    await elem.mozRequestFullScreen();
                }
                console.log('✅ Entered fullscreen');
            } catch (err) {
                console.log('Fullscreen not available:', err);
            }
        };
        
        // Optional: auto-enter fullscreen on play
        // Commented out as it might be intrusive
        // player.addEventListener('play', enterFullscreen, { once: true });
    }
    
    // ========== AUTO COMPACT MODE ==========
    autoEnableCompactMode() {
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                if (typeof setCompactMode === 'function') {
                    setCompactMode('compact');
                    console.log('📱 Auto-enabled compact mode');
                }
            }, 1000);
        }
    }
    
    // ========== CLEANUP ==========
    destroy() {
        console.log('🧹 Cleaning up mobile optimizations...');
        this.cleanupFunctions.forEach(fn => {
            try {
                fn();
            } catch (err) {
                console.error('Cleanup error:', err);
            }
        });
        this.initialized = false;
    }
}

// ========== INITIALIZATION ==========
const mobileOptimizer = new MobileOptimizer();

if (mobileOptimizer.isMobile) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            mobileOptimizer.init();
        });
    } else {
        mobileOptimizer.init();
    }
}

// Make available globally for debugging
window.mobileOptimizer = mobileOptimizer;

console.log('✅ mobile.js loaded (Professional Rewrite)');