// Enhanced PWA registration with GitHub Pages support
if ('serviceWorker' in navigator) {
  const isExtension = window.location.protocol === 'chrome-extension:';
  
  if (isExtension) {
    console.log('⏭️ Skipping service worker registration (extension mode)');
    
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        console.log(`💾 Persistent storage: ${granted ? 'granted' : 'denied'}`);
      });
    }
  } else {
    // Wait for BASE_PATH to be defined
    const checkAndRegister = () => {
      if (typeof window.BASE_PATH === 'undefined') {
        // BASE_PATH not ready yet, try from localStorage
        const storedPath = localStorage.getItem('gh_base_path') || '';
        window.BASE_PATH = storedPath;
      }
      
      const basePath = window.BASE_PATH || '';
      
      // Use relative path for SW - it will resolve correctly
      const swPath = './service-worker.js';
      const scope = './';
      
      console.log(`📍 Registering SW at: ${swPath}`);
      console.log(`📍 Scope: ${scope}`);
      console.log(`📍 Base path: ${basePath || '(root)'}`);
      
      navigator.serviceWorker.register(swPath, { scope })
        .then(registration => {
          console.log('✅ Service Worker registered (PWA mode)');
          console.log('Scope:', registration.scope);
          
          if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(granted => {
              console.log(`💾 Persistent storage: ${granted ? 'granted' : 'denied'}`);
            });
          }
        })
        .catch(err => {
          console.error('❌ Service Worker registration failed:', err);
          console.error('Attempted path:', swPath);
          console.error('Current location:', window.location.href);
        });
    };
    
    // Give gh-pages-config.js time to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkAndRegister);
    } else {
      checkAndRegister();
    }
  }
}