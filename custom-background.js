/* ============================================
   CUSTOM BACKGROUND MANAGER v1.1
   ============================================ */

class CustomBackgroundManager {

    // localStorage items larger than this are rejected.
    // Base64 is ~133% of raw size; 3 MB raw → ~4 MB string, safely under typical 5 MB quota.
    static MAX_STORAGE_CHARS = 4 * 1024 * 1024;

    constructor(debugLog = console.log) {
        this._log = debugLog;

        this._current  = null;  // currently applied image data / URL
        this._modal    = null;  // modal root element
        this._preview  = null;  // <img> inside the modal (cached ref)
        this._listeners = [];   // { element, event, handler } for teardown

        this._loadSaved();
        this._createModal();
    }

    // ─── Modal ────────────────────────────────────────────────────────────────

    _createModal() {
        this._modal = document.createElement('div');
        this._modal.id = 'custom-bg-modal';
        this._modal.innerHTML = `
            <div class="custom-bg-content">
                <h2>🎨 Custom Background</h2>
                <img id="bg-preview" class="custom-bg-preview" alt="Preview">
                <div class="custom-bg-options">
                    <button id="bg-upload-btn" class="btn-primary">📁 Upload Image</button>
                    <button id="bg-url-btn"    class="btn-secondary">🌐 Use Image URL</button>
                    <button id="bg-reset-btn"  class="btn-secondary">🔄 Reset to Default</button>
                    <button id="bg-close-btn"  class="btn-secondary">✕ Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(this._modal);

        // Cache the preview element — it exists for the manager's lifetime
        this._preview = this._modal.querySelector('#bg-preview');

        this._wireModal();
    }

    _wireModal() {
        const wire = (el, event, handler) => {
            el.addEventListener(event, handler);
            this._listeners.push({ element: el, event, handler });
        };

        wire(this._modal.querySelector('#bg-upload-btn'), 'click', () => this._pickFile());
        wire(this._modal.querySelector('#bg-url-btn'),    'click', () => this._promptURL());
        wire(this._modal.querySelector('#bg-reset-btn'),  'click', () => this.resetBackground());
        wire(this._modal.querySelector('#bg-close-btn'),  'click', () => this.hideModal());

        // Close on backdrop click
        wire(this._modal, 'click', (e) => { if (e.target === this._modal) this.hideModal(); });
    }

    // ─── File / URL loading ───────────────────────────────────────────────────

    _pickFile() {
        const input    = document.createElement('input');
        input.type     = 'file';
        input.accept   = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', (e) => {
            document.body.removeChild(input);
            const file = e.target.files?.[0];
            if (file) this._loadFile(file);
        }, { once: true });

        // Clean up if user cancels without selecting
        window.addEventListener('focus', () => {
            setTimeout(() => { if (input.parentNode) document.body.removeChild(input); }, 500);
        }, { once: true });

        input.click();
    }

    _loadFile(file) {
        const reader = new FileReader();
        reader.onload = ({ target }) => {
            const dataURL = target.result;
            if (!this._save(dataURL)) return; // too large — save() logs the warning
            this.applyBackground(dataURL);
            this._showPreview(dataURL);
            this._log('✅ Background loaded from file', 'success');
            this.hideModal();
        };
        reader.onerror = () => this._log('❌ FileReader error reading image', 'error');
        reader.readAsDataURL(file);
    }

    _promptURL() {
        const url = prompt('Enter image URL:');
        if (!url?.trim()) return;

        // Use the cached preview element to test the URL — if it loads, apply it
        const testImg = new Image();

        testImg.onload = () => {
            this._save(url);            // URLs are short — never too large
            this.applyBackground(url);
            this._showPreview(url);
            this._log('✅ Background loaded from URL', 'success');
            this.hideModal();
        };

        testImg.onerror = () => {
            this._log('❌ Could not load image from URL', 'error');
            this._log('Please check the URL and try again.', 'warning');
        };

        testImg.src = url;
    }

    // ─── Apply / reset ────────────────────────────────────────────────────────

    applyBackground(imageData) {
        Object.assign(document.body.style, {
            backgroundImage:     `url(${imageData})`,
            backgroundSize:      'cover',
            backgroundPosition:  'center',
            backgroundRepeat:    'no-repeat',
            backgroundAttachment:'fixed',
        });
        document.body.classList.add('custom-bg');
        this._current = imageData;
    }

    resetBackground() {
        Object.assign(document.body.style, {
            backgroundImage:     '',
            backgroundSize:      '',
            backgroundPosition:  '',
            backgroundRepeat:    '',
            backgroundAttachment:'',
        });
        document.body.classList.remove('custom-bg');
        this._current = null;
        localStorage.removeItem('customBackground');
        this._hidePreview();
        this._log('Background reset to default', 'info');
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    _save(imageData) {
        if (imageData.length > CustomBackgroundManager.MAX_STORAGE_CHARS) {
            this._log(
                `⚠️ Image too large to save (${(imageData.length / 1_048_576).toFixed(1)} MB) — ` +
                'background applied for this session only', 'warning'
            );
            return false;
        }
        try {
            localStorage.setItem('customBackground', imageData);
            return true;
        } catch (err) {
            this._log(`⚠️ Could not save background: ${err.message}`, 'warning');
            return false;
        }
    }

    _loadSaved() {
        try {
            const saved = localStorage.getItem('customBackground');
            if (saved) {
                this.applyBackground(saved);
                this._log('✅ Saved background restored', 'success');
            }
        } catch (err) {
            this._log(`⚠️ Could not restore background: ${err.message}`, 'warning');
        }
    }

    // ─── Preview ──────────────────────────────────────────────────────────────

    _showPreview(src) {
        if (!this._preview) return;
        this._preview.src = src;
        this._preview.classList.add('show');
    }

    _hidePreview() {
        if (!this._preview) return;
        this._preview.src = '';
        this._preview.classList.remove('show');
    }

    // ─── Modal visibility ─────────────────────────────────────────────────────

    showModal() {
        if (!this._modal) return;
        this._modal.classList.add('show');
        if (this._current) this._showPreview(this._current);
    }

    hideModal() {
        this._modal?.classList.remove('show');
    }

    // ─── Teardown ─────────────────────────────────────────────────────────────

    destroy() {
        this._listeners.forEach(({ element, event, handler }) => {
            try { element.removeEventListener(event, handler); } catch (_) {}
        });
        this._listeners = [];

        this._modal?.parentNode?.removeChild(this._modal);
        this._modal   = null;
        this._preview = null;

        this._log('✅ CustomBackgroundManager destroyed', 'success');
    }
}

window.CustomBackgroundManager = CustomBackgroundManager;
