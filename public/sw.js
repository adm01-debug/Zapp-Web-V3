// Push-only service worker. NEVER caches app shell — any cache present is legacy and gets purged.
self.addEventListener('install', () => {
  console.log('[ServiceWorker] Install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate — purging ALL caches to prevent stale UI bundles');
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => {
      console.log('[ServiceWorker] Removing cache', key);
      return caches.delete(key);
    }));
    // clients.claim() can throw InvalidStateError if this worker is superseded
    // during the activation lifecycle (rapid update cycles, multiple tabs).
    // This is a benign race — the new active worker will claim clients instead.
    try {
      await self.clients.claim();
    } catch (e) {
      if (e instanceof Error && e.name === 'InvalidStateError') {
        console.warn('[ServiceWorker] clients.claim() skipped (worker superseded during activation):', e.message);
      } else {
        throw e;
      }
    }
  })());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received');

  let data = {
    title: 'Nova mensagem',
    body: 'Você recebeu uma nova mensagem',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'default',
    data: {},
    category: 'general',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // Define actions based on notification category
  let actions = [
    { action: 'view', title: 'Ver' },
    { action: 'dismiss', title: 'Dispensar' },
  ];

  // Security-specific actions
  if (data.category === 'security') {
    actions = [
      { action: 'view', title: 'Ver Detalhes' },
      { action: 'secure', title: 'Proteger Conta' },
    ];
  }

  // Determine icon based on category
  let icon = data.icon;
  if (data.category === 'security') {
    icon = '/favicon.ico'; // Could use a security-specific icon
  }

  const options = {
    body: data.body,
    icon: icon,
    badge: data.badge,
    tag: data.tag || data.category + '-' + Date.now(),
    data: { ...data.data, category: data.category },
    vibrate: data.category === 'security' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    requireInteraction: data.category === 'security' || data.requireInteraction || false,
    actions: actions,
    silent: data.silent || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click received', event.action);

  event.notification.close();

  const notificationData = event.notification.data || {};
  let targetUrl = '/';

  // Determine target URL based on notification data and category
  if (notificationData.category === 'security') {
    targetUrl = '/?view=security';
  } else if (notificationData.conversationId) {
    targetUrl = `/?conversation=${notificationData.conversationId}`;
  } else if (notificationData.url) {
    targetUrl = notificationData.url;
  }

  // Handle different actions
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              data: notificationData,
            });
            return client.focus();
          }
        }
        // Open a new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  } else if (event.action === 'secure') {
    // Handle security action - go directly to security settings
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            client.postMessage({
              type: 'SECURITY_ACTION',
              data: notificationData,
            });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/?view=security');
        }
      })
    );
  } else if (event.action === 'reply') {
    // Handle quick reply action
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({
            type: 'QUICK_REPLY',
            data: notificationData,
          });
        }
      })
    );
  }
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[ServiceWorker] Notification closed', event.notification.tag);
});

// Message event - handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

// Background sync for offline message queue
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event', event.tag);

  if (event.tag === 'send-messages') {
    event.waitUntil(sendQueuedMessages());
  }
});

async function sendQueuedMessages() {
  // Implementation for sending queued messages when back online
  console.log('[ServiceWorker] Processing queued messages');
}
