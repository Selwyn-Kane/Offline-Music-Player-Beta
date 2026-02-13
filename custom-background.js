/* ============================================
   Custom Background Manager
   ============================================ */

class CustomBackgroundManager {
    constructor(debugLog) {
        this.debugLog = debugLog;
        this.currentBackground = null;
        this.modal = null;
        
        this.init();
    }
    
    init() {
        // Load saved background
        this.loadSavedBackground();
        
        // Create modal
        this.createModal();
        
        // Attach button handler
        const bgButton = document.getElementById('custom-bg-button');
        if (bgButton) {
            bgButton.onclick = () => this.showModal();
        }
    }
    
    createModal() {
        this.modal = document.createElement('div');
        this.modal.id = 'custom-bg-modal';
        this.modal.innerHTML = `
            <div class="custom-bg-content">
                <h2>🎨 Custom Background</h2>
                
                <img id="bg-preview" class="custom-bg-preview" alt="Preview">
                
                <div class="custom-bg-options">
                    <button id="bg-upload-btn" class="btn-primary">
                        📁 Upload Image
                    </button>
                    
                    <button id="bg-url-btn" class="btn-secondary">
                        🌐 Use Image URL
                    </button>
                    
                    <button id="bg-reset-btn" class="btn-secondary">
                        🔄 Reset to Default
                    </button>
                    
                    <button id="bg-close-btn" class="btn-secondary">
                        ✕ Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        this.attachModalEvents();
    }
    
    attachModalEvents() {
        const preview = document.getElementById('bg-preview');
        
        // Upload button
        document.getElementById('bg-upload-btn').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.loadImageFile(file);
                }
            };
            
            input.click();
        };
        
        // URL button
        document.getElementById('bg-url-btn').onclick = () => {
            const url = prompt('Enter image URL:');
            if (url) {
                this.loadImageURL(url);
            }
        };
        
        // Reset button
        document.getElementById('bg-reset-btn').onclick = () => {
            this.resetBackground();
        };
        
        // Close button
        document.getElementById('bg-close-btn').onclick = () => {
            this.hideModal();
        };
        
        // Close on overlay click
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        };
    }
    
    async loadImageFile(file) {
        try {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const dataURL = e.target.result;
                this.applyBackground(dataURL);
                this.saveBackground(dataURL);
                this.showPreview(dataURL);
                this.debugLog('Custom background loaded from file', 'success');
            };
            
            reader.readAsDataURL(file);
        } catch (err) {
            this.debugLog(`Failed to load background: ${err.message}`, 'error');
        }
    }
    
    async loadImageURL(url) {
        try {
            // Test if image loads
            const img = new Image();
            
            img.onload = () => {
                this.applyBackground(url);
                this.saveBackground(url);
                this.showPreview(url);
                this.debugLog('Custom background loaded from URL', 'success');
            };
            
            img.onerror = () => {
                alert('Failed to load image from URL. Please check the URL and try again.');
                this.debugLog('Failed to load image from URL', 'error');
            };
            
            img.src = url;
        } catch (err) {
            this.debugLog(`Failed to load background: ${err.message}`, 'error');
        }
    }
    
    applyBackground(imageData) {
        document.body.style.backgroundImage = `url(${imageData})`;
        document.body.classList.add('custom-bg');
        this.currentBackground = imageData;
    }
    
    resetBackground() {
        document.body.style.backgroundImage = '';
        document.body.classList.remove('custom-bg');
        this.currentBackground = null;
        localStorage.removeItem('customBackground');
        this.hidePreview();
        this.debugLog('Background reset to default', 'info');
    }
    
    saveBackground(imageData) {
        try {
            // Check if data is too large for localStorage (5MB limit)
            if (imageData.length > 5 * 1024 * 1024) {
                alert('Image is too large. Please use a smaller image (under 5MB).');
                return;
            }
            
            localStorage.setItem('customBackground', imageData);
            this.debugLog('Background saved to storage', 'success');
        } catch (err) {
            alert('Failed to save background. Image may be too large.');
            this.debugLog(`Failed to save background: ${err.message}`, 'error');
        }
    }
    
    loadSavedBackground() {
        try {
            const saved = localStorage.getItem('customBackground');
            if (saved) {
                this.applyBackground(saved);
                this.debugLog('Loaded saved background', 'success');
            }
        } catch (err) {
            this.debugLog(`Failed to load saved background: ${err.message}`, 'error');
        }
    }
    
    showPreview(imageData) {
        const preview = document.getElementById('bg-preview');
        preview.src = imageData;
        preview.classList.add('show');
    }
    
    hidePreview() {
        const preview = document.getElementById('bg-preview');
        preview.src = '';
        preview.classList.remove('show');
    }
    
    showModal() {
        this.modal.classList.add('show');
        
        // Show current background in preview
        if (this.currentBackground) {
            this.showPreview(this.currentBackground);
        }
    }
    
    hideModal() {
        this.modal.classList.remove('show');
    }
}

window.CustomBackgroundManager = CustomBackgroundManager;