/* Service Worker - Enhanced Widget Support */

const CACHE_NAME = 'music-player-v4';

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './mobile.js',
  './gh-pages-config.js',
  './sw-init.js'
];

let currentState = {
  isPlaying: false,
  currentTrack: {
    title: 'No track loaded',
    artist: '--',
    album: '--',
    albumArt: null
  },
  progress: 0,
  currentTime: 0,
  duration: 0
};

// Install
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache).catch(() => Promise.resolve()))
      .then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(response => {
          if (response) {
            return response;
          }
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Not found', { status: 404 });
        });
      })
  );
});

// Message handler
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  const { type, state, action } = event.data;
  
  switch (type) {
    case 'UPDATE_STATE':
      currentState = { ...currentState, ...state };
      console.log('[SW] State updated:', currentState);
      broadcastToWidgets();
      break;
      
    case 'WIDGET_COMMAND':
      forwardCommandToMainApp(action);
      break;
      
    case 'GET_STATE':
      // Send current state back to requesting client
      event.source.postMessage({
        type: 'STATE_UPDATE',
        state: currentState
      });
      break;
      
    case 'KEEP_ALIVE':
      event.waitUntil(Promise.resolve());
      break;
  }
});

// Broadcast state to all widget clients
function broadcastToWidgets() {
  self.clients.matchAll({ includeUncontrolled: true })
    .then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'STATE_UPDATE',
          state: currentState
        });
        // Also send with WIDGET_STATE_UPDATE for compatibility with some widgets
        client.postMessage({
          type: 'WIDGET_STATE_UPDATE',
          state: currentState
        });
      });
      console.log('[SW] Broadcasted to', clients.length, 'clients');
    });
}

// Forward commands to main app
function forwardCommandToMainApp(action) {
  self.clients.matchAll({ type: 'window' })
    .then(clients => {
      const mainApp = clients.find(c => 
        c.url.includes('index.html') || 
        c.url.endsWith('/') ||
        c.focused
      );
      
      if (mainApp) {
        mainApp.postMessage({
          type: 'WIDGET_COMMAND',
          action: action
        });
        console.log('[SW] Forwarded command to main app:', action);
      } else {
        // Open the app if not found
        self.clients.openWindow('./index.html');
        console.log('[SW] Opened main app');
      }
    });
}

// Periodic Background Sync for widgets (Android 13+)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  
  if (event.tag === 'update-widget') {
    event.waitUntil(
      // Request state update from main app
      self.clients.matchAll({ type: 'window' })
        .then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'WIDGET_REQUEST_UPDATE' });
          });
        })
        .then(() => broadcastToWidgets())
    );
  }
});

// Notification click handler (optional - for future features)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then(clients => {
        const client = clients.find(c => c.focused);
        if (client) {
          return client.focus();
        }
        return self.clients.openWindow('./index.html');
      })
  );
});

console.log('[SW] Loaded with widget support');
