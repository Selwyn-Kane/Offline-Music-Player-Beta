/* ============================================
   Fullscreen Helper
   Cross-browser fullscreen API support with mobile enhancements
   ============================================ */

class FullscreenHelper {
    constructor() {
        this.isFullscreen = false;
        this.element = null;
    }

    /**
     * Request fullscreen on an element with cross-browser support
     * @param {HTMLElement} element - The element to make fullscreen
     * @returns {Promise} - Resolves when fullscreen is entered
     */
    async requestFullscreen(element) {
        if (!element) {
            console.error('FullscreenHelper: No element provided');
            return Promise.reject('No element provided');
        }

        this.element = element;

        try {
            // Try standard API first
            if (element.requestFullscreen) {
                await element.requestFullscreen();
            }
            // WebKit (Safari, older Chrome)
            else if (element.webkitRequestFullscreen) {
                await element.webkitRequestFullscreen();
            }
            // Firefox
            else if (element.mozRequestFullScreen) {
                await element.mozRequestFullScreen();
            }
            // IE/Edge
            else if (element.msRequestFullscreen) {
                await element.msRequestFullscreen();
            }
            // iOS Safari - use alternative approach
            else if (element.webkitEnterFullscreen) {
                // For video elements on iOS
                element.webkitEnterFullscreen();
            }
            else {
                console.warn('FullscreenHelper: Fullscreen API not supported');
                // Fallback: simulate fullscreen with CSS
                this.simulateFullscreen(element);
                return Promise.resolve();
            }

            this.isFullscreen = true;
            console.log('✅ Fullscreen entered successfully');
            return Promise.resolve();

        } catch (error) {
            console.error('FullscreenHelper: Error entering fullscreen:', error);
            // Fallback to simulated fullscreen
            this.simulateFullscreen(element);
            return Promise.resolve();
        }
    }

    /**
     * Exit fullscreen with cross-browser support
     * @returns {Promise} - Resolves when fullscreen is exited
     */
    async exitFullscreen() {
        try {
            // Try standard API first
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            }
            // WebKit
            else if (document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            }
            // Firefox
            else if (document.mozCancelFullScreen) {
                await document.mozCancelFullScreen();
            }
            // IE/Edge
            else if (document.msExitFullscreen) {
                await document.msExitFullscreen();
            }
            // iOS Safari video
            else if (this.element && this.element.webkitExitFullscreen) {
                this.element.webkitExitFullscreen();
            }
            else {
                // Exit simulated fullscreen
                this.exitSimulatedFullscreen();
            }

            this.isFullscreen = false;
            console.log('✅ Fullscreen exited successfully');
            return Promise.resolve();

        } catch (error) {
            console.error('FullscreenHelper: Error exiting fullscreen:', error);
            this.exitSimulatedFullscreen();
            return Promise.resolve();
        }
    }

    /**
     * Toggle fullscreen state
     * @param {HTMLElement} element - The element to toggle fullscreen
     * @returns {Promise}
     */
    async toggleFullscreen(element) {
        if (this.isFullscreenActive()) {
            return this.exitFullscreen();
        } else {
            return this.requestFullscreen(element);
        }
    }

    /**
     * Check if currently in fullscreen mode
     * @returns {boolean}
     */
    isFullscreenActive() {
        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            this.isFullscreen
        );
    }

    /**
     * Simulate fullscreen using CSS (fallback for unsupported browsers)
     * @param {HTMLElement} element
     */
    simulateFullscreen(element) {
        if (!element) return;

        element.classList.add('simulated-fullscreen');
        element.style.position = 'fixed';
        element.style.top = '0';
        element.style.left = '0';
        element.style.width = '100vw';
        element.style.height = '100vh';
        element.style.zIndex = '99999';
        element.style.background = '#000';

        this.isFullscreen = true;
        console.log('⚠️ Using simulated fullscreen (native API not available)');
    }

    /**
     * Exit simulated fullscreen
     */
    exitSimulatedFullscreen() {
        if (!this.element) return;

        this.element.classList.remove('simulated-fullscreen');
        this.element.style.position = '';
        this.element.style.top = '';
        this.element.style.left = '';
        this.element.style.width = '';
        this.element.style.height = '';
        this.element.style.zIndex = '';
        this.element.style.background = '';

        this.isFullscreen = false;
    }

    /**
     * Listen for fullscreen change events
     * @param {Function} callback - Called when fullscreen state changes
     */
    onFullscreenChange(callback) {
        const events = [
            'fullscreenchange',
            'webkitfullscreenchange',
            'mozfullscreenchange',
            'MSFullscreenChange'
        ];

        events.forEach(event => {
            document.addEventListener(event, () => {
                this.isFullscreen = this.isFullscreenActive();
                callback(this.isFullscreen);
            });
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FullscreenHelper;
}
