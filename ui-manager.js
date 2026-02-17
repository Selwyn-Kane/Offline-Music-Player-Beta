/* ============================================
   UI MANAGER v2.0
   Toast notifications, status updates, and UI interactions
   ============================================ */

class UIManager {

    constructor(debugLog) {
        this._log = debugLog || (() => {});
        
        // DOM references
        this._statusEl = document.getElementById('playlist-status');
        this._toastContainer = null;
        
        // Toast queue
        this._toasts = new Set();
        this._maxToasts = 5;
        
        // Theme colors (can be overridden)
        this._colors = {
            info:    '#007bff',
            success: '#28a745',
            warning: '#ffc107',
            error:   '#dc3545',
        };
        
        this._init();
    }

    // ─── Initialization ───────────────────────────────────────────────────────

    _init() {
        this._createToastContainer();
        this._setupKeyboardHandlers();
    }

    _createToastContainer() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            c.className = 'ui-toast-container';
            c.setAttribute('role', 'status');
            c.setAttribute('aria-live', 'polite');
            c.setAttribute('aria-atomic', 'false');
            Object.assign(c.style, {
                position:      'fixed',
                bottom:        '20px',
                right:         '20px',
                zIndex:        '10000',
                display:       'flex',
                flexDirection: 'column',
                gap:           '10px',
                pointerEvents: 'none',
            });
            document.body.appendChild(c);
        }
        this._toastContainer = c;
    }

    _setupKeyboardHandlers() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.clearAllToasts();
        });
    }

    // ─── Toast API ────────────────────────────────────────────────────────────

    /**
     * Show a toast notification.
     * @param {string}  message  - Text to display
     * @param {string}  type     - 'info' | 'success' | 'warning' | 'error'
     * @param {number}  duration - Auto-dismiss after ms (0 = manual)
     */
    showToast(message, type = 'info', duration = 3000) {
        // Enforce max concurrent toasts
        if (this._toasts.size >= this._maxToasts) {
            const oldest = [...this._toasts][0];
            this._removeToast(oldest);
        }

        const toast = this._createToast(message, type);
        this._toasts.add(toast);
        this._toastContainer.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('ui-toast-visible');
        });

        // Auto-dismiss
        if (duration > 0) {
            const timer = setTimeout(() => this._removeToast(toast), duration);
            toast._timer = timer;
        }

        return toast;
    }

    /**
     * Alias for showToast with type inference.
     */
    notify(message, type = 'info') {
        const d = (type === 'error' || type === 'warning') ? 5000 : 3000;
        return this.showToast(message, type, d);
    }

    /**
     * Remove all toasts.
     */
    clearAllToasts() {
        this._toasts.forEach(t => this._removeToast(t));
    }

    // ─── Status updates ───────────────────────────────────────────────────────

    /**
     * Update the main status element.
     */
    updateStatus(message, isError = false) {
        if (this._statusEl) {
            this._statusEl.textContent = message;
            this._statusEl.style.color = isError ? this._colors.error : '';
        }
        this._log(message, isError ? 'error' : 'info');
    }

    // ─── Toast internals ──────────────────────────────────────────────────────

    _createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = 'ui-toast';
        toast.setAttribute('role', 'alert');
        toast.style.cssText = `
            background: ${this._colors[type] || this._colors.info};
            color: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            font-size: 14px;
            font-weight: 500;
            min-width: 200px;
            max-width: 350px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            pointer-events: auto;
            user-select: none;
        `;
        toast.textContent = message;

        // Click to dismiss
        toast.addEventListener('click', () => this._removeToast(toast));

        return toast;
    }

    _removeToast(toast) {
        if (!toast || !this._toasts.has(toast)) return;

        // Cancel auto-dismiss timer
        if (toast._timer) {
            clearTimeout(toast._timer);
            delete toast._timer;
        }

        // Animate out
        toast.style.opacity    = '0';
        toast.style.transform  = 'translateY(20px)';

        setTimeout(() => {
            this._toasts.delete(toast);
            toast.remove();
        }, 300);
    }

    // ─── Customization ────────────────────────────────────────────────────────

    /**
     * Override default colors.
     * @param {object} colors - { info, success, warning, error }
     */
    setColors(colors) {
        Object.assign(this._colors, colors);
    }

    /**
     * Set max concurrent toasts.
     */
    setMaxToasts(n) {
        this._maxToasts = Math.max(1, n);
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    destroy() {
        this.clearAllToasts();
        this._toastContainer?.remove();
        this._log('🧹 UIManager destroyed', 'info');
    }
}

// ─── Module export ────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
