/* ============================================
   Chrome OS Platform Detector
   Isolates platform-specific features
   ============================================ */

class ChromeOSDetector {
    constructor() {
        this.isChromeos = /CrOS/.test(navigator.userAgent);
        this.isExtension = this.checkIfExtension();
        this.isPWA = this.checkIfPWA();
        this.isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
        
        this.platformMode = this.determinePlatformMode();
        
        console.log(`🔍 Platform Detection:`);
        console.log(`   Chrome OS: ${this.isChromeos}`);
        console.log(`   Extension: ${this.isExtension}`);
        console.log(`   PWA: ${this.isPWA}`);
        console.log(`   Mobile: ${this.isMobile}`);
        console.log(`   Mode: ${this.platformMode}`);
        
        this.initPlatformFeatures();
    }
    
    checkIfExtension() {
        // Check if running inside Chrome extension
        return typeof chrome !== 'undefined' && 
               chrome.runtime && 
               chrome.runtime.id && 
               window.location.protocol === 'chrome-extension:';
    }
    
    checkIfPWA() {
        // Check if running as installed PWA
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }
    
    determinePlatformMode() {
        if (this.isExtension) return 'extension-chromeos';
        if (this.isChromeos && this.isPWA) return 'pwa-chromeos';
        if (this.isChromeos) return 'web-chromeos';
        if (this.isMobile) return 'mobile';
        return 'desktop-web';
    }
    
    initPlatformFeatures() {
        // Only initialize ChromeOS-specific features if on ChromeOS
        if (this.isChromeos) {
            this.setupChromeOSOptimizations();
        }
        
        if (this.isExtension) {
            this.setupExtensionOptimizations();
        }
        
        if (this.isPWA) {
            this.setupPWAOptimizations();
        }
    }
    
    setupChromeOSOptimizations() {
        console.log('⚙️ Initializing Chrome OS optimizations...');
        
        // Force enable folder picker (only available on Chrome OS in extension/PWA)
        document.addEventListener('DOMContentLoaded', () => {
            const folderButton = document.getElementById('folder-button');
            if (folderButton && 'showDirectoryPicker' in window) {
                folderButton.style.display = 'inline-block';
                console.log('✅ Folder picker enabled on Chrome OS');
            }
        });
        
        // Add Chrome OS specific keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Alt+M to toggle mini player (Chrome OS specific)
            if (e.altKey && e.key === 'm') {
                e.preventDefault();
                const stickyToggle = document.getElementById('sticky-toggle');
                if (stickyToggle) stickyToggle.click();
                console.log('⌨ Chrome OS Alt+M shortcut: Toggle sticky player');
            }
            
            // Ctrl+Shift+L to load folder (Chrome OS specific)
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();
                const folderButton = document.getElementById('folder-button');
                if (folderButton && !folderButton.disabled) {
                    folderButton.click();
                    console.log('⌨ Chrome OS Ctrl+Shift+L shortcut: Open folder');
                }
            }
        });
        
        // Optimize for touchscreen + keyboard hybrid input
        this.setupHybridInput();
    }
    
    setupExtensionOptimizations() {
        console.log('🔌 Initializing extension-specific optimizations...');
        
        // Request extension info from background script
        chrome.runtime.sendMessage({ action: 'get-extension-info' }, (response) => {
            if (response) {
                console.log('✅ Connected to extension background');
                console.log(`   Extension ID: ${response.extensionId}`);
                console.log(`   Platform: ${response.platform}`);
            }
        });
        
        // Keep service worker alive during playback
        const player = document.getElementById('audio-player');
        if (player) {
            player.addEventListener('play', () => {
                chrome.runtime.sendMessage({ action: 'keep-alive' }, () => {});
            });
        }
        
        // Window control optimizations
        this.setupWindowControls();
    }
    
    setupPWAOptimizations() {
        console.log('📦 Initializing PWA optimizations...');
        
        // Service worker already registered in HTML
        // Just add some PWA-specific behaviors
        
        // Detect if PWA loses connectivity
        window.addEventListener('offline', () => {
            console.log('📴 Going offline - PWA mode');
            // Could show offline indicator
        });
        
        window.addEventListener('online', () => {
            console.log('📡 Back online - PWA mode');
            // Resume normal operations
        });
    }
    
    setupHybridInput() {
        // Chrome OS devices often support both touch and keyboard/mouse
        
        // Detect primary input method
        document.addEventListener('touchstart', () => {
            document.body.classList.add('touch-active');
        });
        
        document.addEventListener('mousemove', () => {
            if (document.body.classList.contains('touch-active')) {
                // User switched from touch to mouse - might be using stylus or touchpad
            }
        });
        
        // Make buttons bigger for touch on Chrome OS
        const style = document.createElement('style');
        style.textContent = `
            @media (hover: none) and (pointer: coarse) {
                /* Touch devices */
                button, input[type="range"] {
                    min-height: 48px;
                    padding: 14px 20px !important;
                }
            }
        `;
        document.head.appendChild(style);
        
        console.log('✅ Hybrid input (touch + keyboard) configured');
    }
    
    setupWindowControls() {
        // Extension-specific window management
        console.log('🪟 Setting up window controls for extension...');
        
        // Add minimize button (only in extension mode)
        const controls = document.getElementById('controls');
        if (controls && this.isExtension) {
            const minimizeBtn = document.createElement('button');
            minimizeBtn.id = 'minimize-btn';
            minimizeBtn.textContent = '−';
            minimizeBtn.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                padding: 0;
                font-size: 20px;
                z-index: 9999;
                background: linear-gradient(135deg, #666 0%, #555 100%);
            `;
            
            minimizeBtn.onclick = () => {
                chrome.windows.getCurrent((win) => {
                    chrome.windows.update(win.id, { state: 'minimized' });
                });
            };
            
            document.body.appendChild(minimizeBtn);
            console.log('✅ Minimize button added');
        }
    }
    
    // Public methods for the app to check platform capabilities
    
    canAccessFilesystem() {
        return 'showDirectoryPicker' in window;
    }
    
    canUseBluetoothAPI() {
        return 'bluetooth' in navigator && this.isChromeos;
    }
    
    supportsLauncherIntegration() {
        return this.isExtension || this.isPWA;
    }
    
    getStorageRecommendation() {
        // Chrome OS and extensions have different storage limits
        if (this.isExtension) {
            return {
                type: 'chrome.storage.local',
                limit: 10 * 1024 * 1024 // 10MB
            };
        }
        return {
            type: 'localStorage',
            limit: 5 * 1024 * 1024 // 5MB
        };
    }
    
    async requestPersistentStorage() {
        // Try to get persistent storage (important for offline functionality)
        if (navigator.storage && navigator.storage.persist) {
            try {
                const persistent = await navigator.storage.persist();
                console.log(`💾 Persistent storage: ${persistent ? 'granted' : 'denied'}`);
                return persistent;
            } catch (err) {
                console.warn('Persistent storage request failed:', err);
                return false;
            }
        }
        return false;
    }
    
    logPlatformInfo() {
        console.log('═══════════════════════════════════════');
        console.log('🎵 Music Player - Platform Information');
        console.log('═══════════════════════════════════════');
        console.log(`Mode: ${this.platformMode}`);
        console.log(`Chrome OS: ${this.isChromeos}`);
        console.log(`Extension: ${this.isExtension}`);
        console.log(`PWA: ${this.isPWA}`);
        console.log(`Mobile: ${this.isMobile}`);
        console.log(`Filesystem Access: ${this.canAccessFilesystem()}`);
        console.log(`Bluetooth Access: ${this.canUseBluetoothAPI()}`);
        console.log(`Launcher Integration: ${this.supportsLauncherIntegration()}`);
        console.log('═══════════════════════════════════════');
    }
}

// Initialize detector immediately
const chromeosPlatform = new ChromeOSDetector();

// Make available globally
window.chromeosPlatform = chromeosPlatform;

// Log on load
window.addEventListener('load', () => {
    chromeosPlatform.logPlatformInfo();
});