/* ============================================
   GitHub Pages Configuration - FIXED FOR PWA
   ============================================ */

// Detect if running on GitHub Pages
const isGitHubPages = window.location.hostname.includes('github.io');

if (isGitHubPages) {
    // Extract username from hostname (e.g., "username.github.io")
    const username = window.location.hostname.split('.')[0];
    
    // Get the first path segment (potential repo name)
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const firstSegment = pathSegments[0];
    
    // Check if this is a USER/ORG site or PROJECT site
    // User site: username.github.io (no repo in URL)
    // Project site: username.github.io/repo-name
    
    if (!firstSegment || firstSegment === username) {
        // User/Org site - no base path needed
        window.BASE_PATH = '';
        console.log('🌐 GitHub Pages (User Site) - No base path');
    } else {
        // Project site - use the first path segment as repo name
        window.BASE_PATH = `/${firstSegment}`;
        console.log('🌐 GitHub Pages (Project Site), base path:', window.BASE_PATH);
    }
} else {
    // Local or custom domain
    window.BASE_PATH = '';
    console.log('🏠 Running locally or custom domain');
}

// Helper function to get correct paths
window.getPath = function(path) {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    if (window.BASE_PATH) {
        return `${window.BASE_PATH}/${cleanPath}`;
    }
    return `/${cleanPath}`;
};

// Store base path in localStorage for PWA
try {
    if (window.BASE_PATH) {
        localStorage.setItem('gh_base_path', window.BASE_PATH);
    } else if (localStorage.getItem('gh_base_path')) {
        // If PWA and we have stored base path, use it
        window.BASE_PATH = localStorage.getItem('gh_base_path');
        console.log('📦 PWA: Restored base path:', window.BASE_PATH);
    }
} catch (e) {
    console.warn('Could not access localStorage for base path');
}

console.log('✅ Base path configured:', window.BASE_PATH || '(root)');