// ============================================
// CHATHUB SERVICE WORKER
// Advanced offline functionality & caching
// ============================================

'use strict';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // Cache names with versioning
    CACHES: {
        STATIC: 'chathub-static-v2',
        DYNAMIC: 'chathub-dynamic-v1',
        IMAGES: 'chathub-images-v1',
        API: 'chathub-api-v1'
    },

    // Assets to precache during install
    PRECACHE_ASSETS: [
        '/',
        '/index.html',
        '/styles.css',
        '/app.js',
        '/manifest.json',
        '/offline.html'
    ],

    // External resources to cache
    EXTERNAL_ASSETS: [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
        'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
    ],

    // Cache limits
    LIMITS: {
        DYNAMIC: 50,
        IMAGES: 100,
        API: 30
    },

    // Network timeout (ms)
    NETWORK_TIMEOUT: 10000,

    // API cache duration (ms)
    API_CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

    // Sync tags
    SYNC_TAGS: {
        MESSAGES: 'sync-messages',
        NOTIFICATIONS: 'sync-notifications'
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Log with service worker prefix
 */
function log(message, type = 'info') {
    const prefix = '[ChatHub SW]';
    switch (type) {
        case 'error':
            console.error(prefix, message);
            break;
        case 'warn':
            console.warn(prefix, message);
            break;
        default:
            console.log(prefix, message);
    }
}

/**
 * Check if request is for an API endpoint
 */
function isApiRequest(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/api/');
}

/**
 * Check if request is for a static asset
 */
function isStaticAsset(request) {
    const url = new URL(request.url);
    return /\.(js|css|html|json|woff2?|ttf|eot)$/i.test(url.pathname);
}

/**
 * Check if request is for an image
 */
function isImageRequest(request) {
    const url = new URL(request.url);
    return /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname) ||
           request.destination === 'image';
}

/**
 * Check if request is a navigation request
 */
function isNavigationRequest(request) {
    return request.mode === 'navigate';
}

/**
 * Check if response is valid for caching
 */
function isValidResponse(response) {
    if (!response) return false;
    if (response.status === 0) return true; // Opaque response
    return response.status >= 200 && response.status < 400;
}

/**
 * Create a timeout promise
 */
function timeout(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), ms);
    });
}

/**
 * Race fetch against timeout
 */
async function fetchWithTimeout(request, timeoutMs = CONFIG.NETWORK_TIMEOUT) {
    return Promise.race([
        fetch(request),
        timeout(timeoutMs)
    ]);
}

/**
 * Clone response safely
 */
function safeClone(response) {
    try {
        return response.clone();
    } catch (e) {
        log(`Clone failed: ${e.message}`, 'warn');
        return null;
    }
}

/**
 * Trim cache to specified limit
 */
async function trimCache(cacheName, maxItems) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();

        if (keys.length > maxItems) {
            log(`Trimming cache ${cacheName}: ${keys.length} -> ${maxItems}`);
            const deleteCount = keys.length - maxItems;
            const keysToDelete = keys.slice(0, deleteCount);

            await Promise.all(
                keysToDelete.map(key => cache.delete(key))
            );
        }
    } catch (e) {
        log(`Cache trim failed: ${e.message}`, 'error');
    }
}

/**
 * Get all cache names to delete (old versions)
 */
function getOldCacheNames(currentCaches) {
    const currentNames = Object.values(currentCaches);
    return caches.keys().then(names => 
        names.filter(name => 
            name.startsWith('chathub-') && !currentNames.includes(name)
        )
    );
}

/**
 * Send message to all clients
 */
async function messageClients(message) {
    const allClients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: 'window'
    });

    allClients.forEach(client => {
        client.postMessage(message);
    });
}

/**
 * Create offline response for API requests
 */
function createOfflineApiResponse(request) {
    const isGetRequest = request.method === 'GET';
    
    const responseData = {
        error: isGetRequest 
            ? 'You are offline. Showing cached data if available.'
            : 'You are offline. Your request has been queued.',
        offline: true,
        queued: !isGetRequest,
        timestamp: Date.now()
    };

    return new Response(JSON.stringify(responseData), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
            'Content-Type': 'application/json',
            'X-Offline': 'true'
        }
    });
}

/**
 * Create offline HTML page
 */
function createOfflinePage() {
    const html = `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ChatHub - Offline</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            text-align: center;
            max-width: 400px;
        }
        .icon {
            font-size: 80px;
            margin-bottom: 24px;
            animation: float 3s ease-in-out infinite;
        }
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        h1 {
            font-size: 28px;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        p {
            color: #a0a0b8;
            margin-bottom: 24px;
            line-height: 1.6;
        }
        button {
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: white;
            border: none;
            padding: 14px 32px;
            font-size: 16px;
            font-weight: 600;
            border-radius: 12px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);
        }
        button:active {
            transform: translateY(0);
        }
        .status {
            margin-top: 24px;
            padding: 12px 20px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            font-size: 14px;
            color: #6b6b80;
        }
        .status.online {
            background: rgba(34, 197, 94, 0.1);
            color: #22c55e;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📡</div>
        <h1>You're Offline</h1>
        <p>It looks like you've lost your internet connection. Don't worry, ChatHub will automatically reconnect when you're back online.</p>
        <button onclick="location.reload()">Try Again</button>
        <div class="status" id="status">Waiting for connection...</div>
    </div>
    <script>
        const statusEl = document.getElementById('status');
        
        function updateStatus() {
            if (navigator.onLine) {
                statusEl.textContent = 'Connection restored! Reloading...';
                statusEl.classList.add('online');
                setTimeout(() => location.reload(), 1000);
            } else {
                statusEl.textContent = 'Still offline...';
                statusEl.classList.remove('online');
            }
        }
        
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        
        // Check periodically
        setInterval(updateStatus, 3000);
    </script>
</body>
</html>
    `;

    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8'
        }
    });
}

// ============================================
// CACHING STRATEGIES
// ============================================

/**
 * Cache First Strategy
 * Try cache, fall back to network
 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        // Background update for stale content
        fetchAndCache(request, cacheName).catch(() => {});
        return cachedResponse;
    }

    return fetchAndCache(request, cacheName);
}

/**
 * Network First Strategy
 * Try network, fall back to cache
 */
async function networkFirst(request, cacheName, timeoutMs = CONFIG.NETWORK_TIMEOUT) {
    const cache = await caches.open(cacheName);

    try {
        const networkResponse = await fetchWithTimeout(request, timeoutMs);

        if (isValidResponse(networkResponse)) {
            const clone = safeClone(networkResponse);
            if (clone) {
                cache.put(request, clone).catch(() => {});
            }
        }

        return networkResponse;
    } catch (error) {
        log(`Network first failed, trying cache: ${error.message}`, 'warn');
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        throw error;
    }
}

/**
 * Stale While Revalidate Strategy
 * Return cache immediately, update in background
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request).then(networkResponse => {
        if (isValidResponse(networkResponse)) {
            const clone = safeClone(networkResponse);
            if (clone) {
                cache.put(request, clone).catch(() => {});
            }
        }
        return networkResponse;
    }).catch(error => {
        log(`Background fetch failed: ${error.message}`, 'warn');
        return null;
    });

    return cachedResponse || fetchPromise;
}

/**
 * Network Only Strategy
 * Always fetch from network
 */
async function networkOnly(request) {
    return fetch(request);
}

/**
 * Cache Only Strategy
 * Only use cache
 */
async function cacheOnly(request, cacheName) {
    const cache = await caches.open(cacheName);
    return cache.match(request);
}

/**
 * Fetch and cache helper
 */
async function fetchAndCache(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);

        if (isValidResponse(response)) {
            const clone = safeClone(response);
            if (clone) {
                await cache.put(request, clone);
            }
        }

        return response;
    } catch (error) {
        log(`Fetch and cache failed: ${error.message}`, 'error');
        throw error;
    }
}

// ============================================
// REQUEST HANDLERS
// ============================================

/**
 * Handle API requests
 */
async function handleApiRequest(request) {
    const method = request.method;

    // For non-GET requests, always go to network
    if (method !== 'GET') {
        try {
            return await networkOnly(request);
        } catch (error) {
            return createOfflineApiResponse(request);
        }
    }

    // For GET requests, use network first with cache fallback
    try {
        return await networkFirst(request, CONFIG.CACHES.API, CONFIG.NETWORK_TIMEOUT);
    } catch (error) {
        // Try to return cached response
        const cachedResponse = await cacheOnly(request, CONFIG.CACHES.API);
        if (cachedResponse) {
            return cachedResponse;
        }
        return createOfflineApiResponse(request);
    }
}

/**
 * Handle static asset requests
 */
async function handleStaticRequest(request) {
    return cacheFirst(request, CONFIG.CACHES.STATIC);
}

/**
 * Handle image requests
 */
async function handleImageRequest(request) {
    try {
        const response = await cacheFirst(request, CONFIG.CACHES.IMAGES);
        
        // Trim cache if needed
        trimCache(CONFIG.CACHES.IMAGES, CONFIG.LIMITS.IMAGES);
        
        return response;
    } catch (error) {
        // Return placeholder for failed images
        return new Response('', { status: 404 });
    }
}

/**
 * Handle navigation requests
 */
async function handleNavigationRequest(request) {
    try {
        // Try network first for navigation
        const response = await networkFirst(request, CONFIG.CACHES.STATIC, CONFIG.NETWORK_TIMEOUT);
        return response;
    } catch (error) {
        // Return cached index.html or offline page
        const cache = await caches.open(CONFIG.CACHES.STATIC);
        const cachedIndex = await cache.match('/index.html');
        
        if (cachedIndex) {
            return cachedIndex;
        }

        // Return offline page
        const offlinePage = await cache.match('/offline.html');
        if (offlinePage) {
            return offlinePage;
        }

        // Generate offline page dynamically
        return createOfflinePage();
    }
}

/**
 * Handle dynamic/other requests
 */
async function handleDynamicRequest(request) {
    try {
        const response = await staleWhileRevalidate(request, CONFIG.CACHES.DYNAMIC);
        
        // Trim cache if needed
        trimCache(CONFIG.CACHES.DYNAMIC, CONFIG.LIMITS.DYNAMIC);
        
        return response;
    } catch (error) {
        log(`Dynamic request failed: ${error.message}`, 'error');
        throw error;
    }
}

// ============================================
// SERVICE WORKER EVENTS
// ============================================

/**
 * Install Event
 * Cache static assets
 */
self.addEventListener('install', (event) => {
    log('Installing Service Worker...');

    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CONFIG.CACHES.STATIC);

                // Cache local assets
                log('Caching static assets...');
                await cache.addAll(CONFIG.PRECACHE_ASSETS).catch(error => {
                    log(`Some assets failed to cache: ${error.message}`, 'warn');
                });

                // Cache external assets (with error handling for each)
                log('Caching external assets...');
                await Promise.allSettled(
                    CONFIG.EXTERNAL_ASSETS.map(async (url) => {
                        try {
                            const response = await fetch(url, { mode: 'cors' });
                            if (response.ok) {
                                await cache.put(url, response);
                            }
                        } catch (e) {
                            log(`Failed to cache external asset: ${url}`, 'warn');
                        }
                    })
                );

                // Create and cache offline page
                const offlineResponse = createOfflinePage();
                await cache.put('/offline.html', offlineResponse);

                log('Installation complete');

                // Skip waiting to activate immediately
                await self.skipWaiting();
            } catch (error) {
                log(`Installation failed: ${error.message}`, 'error');
                throw error;
            }
        })()
    );
});

/**
 * Activate Event
 * Clean up old caches
 */
self.addEventListener('activate', (event) => {
    log('Activating Service Worker...');

    event.waitUntil(
        (async () => {
            try {
                // Delete old caches
                const oldCaches = await getOldCacheNames(CONFIG.CACHES);
                
                if (oldCaches.length > 0) {
                    log(`Deleting old caches: ${oldCaches.join(', ')}`);
                    await Promise.all(
                        oldCaches.map(name => caches.delete(name))
                    );
                }

                // Take control of all clients immediately
                await self.clients.claim();

                // Notify clients of update
                await messageClients({
                    type: 'SW_ACTIVATED',
                    version: CONFIG.CACHES.STATIC
                });

                log('Activation complete');
            } catch (error) {
                log(`Activation failed: ${error.message}`, 'error');
            }
        })()
    );
});

/**
 * Fetch Event
 * Handle all network requests
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-HTTP(S) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Skip WebSocket requests
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
        return;
    }

    // Skip Chrome extension requests
    if (url.protocol === 'chrome-extension:') {
        return;
    }

    // Skip browser extension URLs
    if (url.origin !== self.location.origin && 
        !CONFIG.EXTERNAL_ASSETS.some(asset => request.url.startsWith(asset.split('?')[0]))) {
        // For cross-origin requests not in our whitelist, just fetch
        if (!request.url.includes('fonts.googleapis.com') && 
            !request.url.includes('fonts.gstatic.com') &&
            !request.url.includes('cdnjs.cloudflare.com')) {
            return;
        }
    }

    // Handle different request types
    event.respondWith(
        (async () => {
            try {
                // Navigation requests (HTML pages)
                if (isNavigationRequest(request)) {
                    return await handleNavigationRequest(request);
                }

                // API requests
                if (isApiRequest(request)) {
                    return await handleApiRequest(request);
                }

                // Image requests
                if (isImageRequest(request)) {
                    return await handleImageRequest(request);
                }

                // Static assets
                if (isStaticAsset(request)) {
                    return await handleStaticRequest(request);
                }

                // Dynamic/other requests
                return await handleDynamicRequest(request);

            } catch (error) {
                log(`Fetch handler error: ${error.message}`, 'error');

                // For navigation, return offline page
                if (isNavigationRequest(request)) {
                    return createOfflinePage();
                }

                // For API, return offline response
                if (isApiRequest(request)) {
                    return createOfflineApiResponse(request);
                }

                // For other requests, return generic error
                return new Response('Service unavailable', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            }
        })()
    );
});

/**
 * Background Sync Event
 * Sync queued messages when back online
 */
self.addEventListener('sync', (event) => {
    log(`Background sync: ${event.tag}`);

    if (event.tag === CONFIG.SYNC_TAGS.MESSAGES) {
        event.waitUntil(syncMessages());
    }

    if (event.tag === CONFIG.SYNC_TAGS.NOTIFICATIONS) {
        event.waitUntil(syncNotifications());
    }
});

/**
 * Periodic Background Sync Event
 * For periodic tasks
 */
self.addEventListener('periodicsync', (event) => {
    log(`Periodic sync: ${event.tag}`);

    if (event.tag === 'check-updates') {
        event.waitUntil(checkForUpdates());
    }
});

/**
 * Sync messages function
 */
async function syncMessages() {
    log('Syncing queued messages...');

    try {
        // Notify all clients to sync their queued messages
        await messageClients({
            type: 'SYNC_MESSAGES',
            timestamp: Date.now()
        });

        log('Message sync notification sent');
    } catch (error) {
        log(`Message sync failed: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Sync notifications function
 */
async function syncNotifications() {
    log('Syncing notifications...');

    try {
        await messageClients({
            type: 'SYNC_NOTIFICATIONS',
            timestamp: Date.now()
        });
    } catch (error) {
        log(`Notification sync failed: ${error.message}`, 'error');
    }
}

/**
 * Check for updates function
 */
async function checkForUpdates() {
    log('Checking for updates...');

    try {
        const response = await fetch('/version.json', { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json();
            await messageClients({
                type: 'UPDATE_AVAILABLE',
                version: data.version
            });
        }
    } catch (error) {
        log(`Update check failed: ${error.message}`, 'warn');
    }
}

/**
 * Message Event
 * Handle messages from the main app
 */
self.addEventListener('message', (event) => {
    const { data } = event;
    log(`Received message: ${data?.type || 'unknown'}`);

    switch (data?.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            event.waitUntil(clearAllCaches());
            break;

        case 'CACHE_URLS':
            if (data.urls && Array.isArray(data.urls)) {
                event.waitUntil(cacheUrls(data.urls, data.cacheName || CONFIG.CACHES.DYNAMIC));
            }
            break;

        case 'GET_CACHE_STATUS':
            event.waitUntil(getCacheStatus().then(status => {
                event.source.postMessage({
                    type: 'CACHE_STATUS',
                    status
                });
            }));
            break;

        case 'TRIM_CACHES':
            event.waitUntil(trimAllCaches());
            break;

        default:
            log(`Unknown message type: ${data?.type}`, 'warn');
    }
});

/**
 * Clear all caches
 */
async function clearAllCaches() {
    log('Clearing all caches...');

    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(name => caches.delete(name))
        );

        await messageClients({
            type: 'CACHES_CLEARED'
        });

        log('All caches cleared');
    } catch (error) {
        log(`Cache clear failed: ${error.message}`, 'error');
    }
}

/**
 * Cache specific URLs
 */
async function cacheUrls(urls, cacheName) {
    log(`Caching ${urls.length} URLs to ${cacheName}`);

    try {
        const cache = await caches.open(cacheName);
        await cache.addAll(urls);
        log('URLs cached successfully');
    } catch (error) {
        log(`URL caching failed: ${error.message}`, 'error');
    }
}

/**
 * Get cache status
 */
async function getCacheStatus() {
    const status = {};

    try {
        for (const [key, name] of Object.entries(CONFIG.CACHES)) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            status[key] = {
                name,
                count: keys.length
            };
        }
    } catch (error) {
        log(`Cache status check failed: ${error.message}`, 'error');
    }

    return status;
}

/**
 * Trim all caches
 */
async function trimAllCaches() {
    log('Trimming all caches...');

    await trimCache(CONFIG.CACHES.DYNAMIC, CONFIG.LIMITS.DYNAMIC);
    await trimCache(CONFIG.CACHES.IMAGES, CONFIG.LIMITS.IMAGES);
    await trimCache(CONFIG.CACHES.API, CONFIG.LIMITS.API);

    log('Cache trimming complete');
}

/**
 * Push Notification Event
 * Handle incoming push notifications
 */
self.addEventListener('push', (event) => {
    log('Push notification received');

    if (!event.data) {
        log('Push event has no data', 'warn');
        return;
    }

    event.waitUntil(
        (async () => {
            try {
                let data;
                
                try {
                    data = event.data.json();
                } catch {
                    data = {
                        title: 'ChatHub',
                        body: event.data.text()
                    };
                }

                const options = {
                    body: data.body || 'You have a new message',
                    icon: data.icon || '/favicon.ico',
                    badge: data.badge || '/favicon.ico',
                    image: data.image,
                    vibrate: data.vibrate || [100, 50, 100],
                    tag: data.tag || `chathub-${Date.now()}`,
                    renotify: data.renotify || false,
                    requireInteraction: data.requireInteraction || false,
                    silent: data.silent || false,
                    timestamp: data.timestamp || Date.now(),
                    data: {
                        url: data.url || '/',
                        messageId: data.messageId,
                        roomId: data.roomId,
                        senderId: data.senderId
                    },
                    actions: data.actions || [
                        {
                            action: 'open',
                            title: 'Open',
                            icon: '/icons/open.png'
                        },
                        {
                            action: 'dismiss',
                            title: 'Dismiss',
                            icon: '/icons/dismiss.png'
                        }
                    ]
                };

                await self.registration.showNotification(
                    data.title || 'ChatHub',
                    options
                );

                log('Push notification shown');
            } catch (error) {
                log(`Push notification error: ${error.message}`, 'error');
            }
        })()
    );
});

/**
 * Notification Click Event
 * Handle notification interactions
 */
self.addEventListener('notificationclick', (event) => {
    log(`Notification clicked: ${event.action || 'default'}`);

    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        (async () => {
            try {
                // Get all window clients
                const clientList = await self.clients.matchAll({
                    type: 'window',
                    includeUncontrolled: true
                });

                // Try to focus existing window with the same URL
                for (const client of clientList) {
                    const clientUrl = new URL(client.url);
                    if (clientUrl.pathname === urlToOpen && 'focus' in client) {
                        await client.focus();

                        // Send message to client about notification click
                        client.postMessage({
                            type: 'NOTIFICATION_CLICKED',
                            data: event.notification.data
                        });

                        return;
                    }
                }

                // Try to focus any existing window
                for (const client of clientList) {
                    if ('focus' in client) {
                        await client.focus();

                        // Navigate to URL if different
                        client.postMessage({
                            type: 'NAVIGATE',
                            url: urlToOpen,
                            data: event.notification.data
                        });

                        return;
                    }
                }

                // Open new window
                if (self.clients.openWindow) {
                    const newClient = await self.clients.openWindow(urlToOpen);
                    
                    if (newClient) {
                        // Wait a bit for the page to load, then send message
                        setTimeout(() => {
                            newClient.postMessage({
                                type: 'NOTIFICATION_CLICKED',
                                data: event.notification.data
                            });
                        }, 1000);
                    }
                }
            } catch (error) {
                log(`Notification click handler error: ${error.message}`, 'error');
            }
        })()
    );
});

/**
 * Notification Close Event
 * Track dismissed notifications
 */
self.addEventListener('notificationclose', (event) => {
    log('Notification dismissed');

    // Track dismissed notifications for analytics
    messageClients({
        type: 'NOTIFICATION_DISMISSED',
        data: event.notification.data
    }).catch(() => {});
});

/**
 * Error Event Handler
 */
self.addEventListener('error', (event) => {
    log(`Service Worker error: ${event.message}`, 'error');
});

/**
 * Unhandled Rejection Handler
 */
self.addEventListener('unhandledrejection', (event) => {
    log(`Unhandled promise rejection: ${event.reason}`, 'error');
});

// ============================================
// INITIALIZATION
// ============================================
log('Service Worker loaded successfully');
log(`Cache version: ${CONFIG.CACHES.STATIC}`);