/* ============================================
   Chrome Extension Background Service Worker
   Manages the app window and lifecycle
   ============================================ */

let playerWindow = null;

// Track if extension was previously installed
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('🎵 Music Player extension installed');
        // Open music player on first install
        chrome.windows.create({
            url: getAppUrl(),
            type: 'popup',
            width: 1200,
            height: 800,
            focused: true
        }, (win) => {
            playerWindow = win;
            console.log('✅ Initial player window opened');
        });
    } else if (details.reason === 'update') {
        console.log('🔄 Music Player extension updated');
    }
});

// Handle extension icon click - open or focus window
chrome.action.onClicked.addListener(() => {
    console.log('🎵 Extension icon clicked');
    
    if (playerWindow && playerWindow.id) {
        // Check if window still exists
        chrome.windows.get(playerWindow.id, (win) => {
            if (chrome.runtime.lastError || !win) {
                // Window closed, create new one
                createPlayerWindow();
            } else {
                // Focus existing window
                chrome.windows.update(playerWindow.id, { focused: true });
                console.log('✅ Player window focused');
            }
        });
    } else {
        // No window, create new one
        createPlayerWindow();
    }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-player') {
        console.log('⌨ Keyboard shortcut activated');
        chrome.action.onClicked.trigger();
    }
});

// Handle window closed - cleanup
chrome.windows.onRemoved.addListener((windowId) => {
    if (playerWindow && playerWindow.id === windowId) {
        console.log('🔒 Player window closed');
        playerWindow = null;
    }
});

function createPlayerWindow() {
    chrome.windows.create({
        url: getAppUrl(),
        type: 'popup',
        width: 1200,
        height: 800,
        focused: true
    }, (win) => {
        playerWindow = win;
        console.log('✅ Player window created');
    });
}

function getAppUrl() {
    return chrome.runtime.getURL('index.html') + '?ext=chromeos';
}

// Broadcast that we're in extension mode
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get-extension-info') {
        sendResponse({
            isExtension: true,
            platform: 'chromeos',
            extensionId: chrome.runtime.id
        });
    } else if (request.action === 'keep-alive') {
        // Keep service worker alive during audio playback
        sendResponse({ alive: true });
    }
});

console.log('✅ Background service worker loaded');