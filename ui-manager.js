/* ============================================
   UI Manager
   Centralizes UI interactions and notifications
   ============================================ */

class UIManager {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.statusElement = document.getElementById('playlist-status');
        this.toastContainer = this.createToastContainer();
    }

    /**
     * Create a container for non-intrusive toast notifications
     */
    createToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Show a non-intrusive toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        const colors = {
            info: '#007bff',
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545'
        };

        toast.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: sans-serif;
            font-size: 14px;
            min-width: 200px;
            max-width: 350px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            cursor: pointer;
        `;
        toast.textContent = message;

        this.toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);

        // Auto-remove
        const removeToast = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        };

        const timer = setTimeout(removeToast, duration);
        toast.onclick = () => {
            clearTimeout(timer);
            removeToast();
        };
    }

    /**
     * Update the main status display
     */
    updateStatus(message, isError = false) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.style.color = isError ? '#dc3545' : '';
        }
        this.debugLog(message, isError ? 'error' : 'info');
    }

    /**
     * Enhanced alert replacement
     */
    notify(message, type = 'info') {
        if (type === 'error' || type === 'warning') {
            this.showToast(message, type, 5000);
        } else {
            this.showToast(message, type);
        }
    }
}
