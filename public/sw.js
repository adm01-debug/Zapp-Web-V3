// Push-only service worker. NEVER caches app shell.
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  // FIX: event.waitUntil() ensures skipWaiting() fully resolves before activate.
  // Without it, clients.claim() in activate could throw InvalidStateError.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate - purging ALL caches');
  event.waitUntil((async () => {
    // Claim first, then purge — if the worker was already replaced before
    // this activate runs, claim() throws InvalidStateError. Guard silently.
    try { await self.clients.claim(); } catch (_e) { /* stale worker, ignore */ }
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    } catch (_e) { /* Cache Storage unavailable — non-fatal */ }
  })());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Nova mensagem', body: 'Nova mensagem recebida',
    icon: '/favicon.ico', badge: '/favicon.ico', tag: 'default',
    data: {}, category: 'general',
  };
  if (event.data) {
    try { const p = event.data.json(); data = { ...data, ...p }; }
    catch (e) { data.body = event.data.text(); }
  }
  let actions = [{ action: 'view', title: 'Ver' }, { action: 'dismiss', title: 'Dispensar' }];
  if (data.category === 'security') {
    actions = [{ action: 'view', title: 'Ver Detalhes' }, { action: 'secure', title: 'Proteger Conta' }];
  }
  const options = {
    body: data.body, icon: data.icon, badge: data.badge,
    tag: data.tag || data.category + '-' + Date.now(),
    data: { ...data.data, category: data.category },
    vibrate: data.category === 'security' ? [300,100,300,100,300] : [200,100,200],
    requireInteraction: data.category === 'security' || data.requireInteraction || false,
    actions, silent: data.silent || false,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const nd = event.notification.data || {};
  let targetUrl = '/';
  if (nd.category === 'security') targetUrl = '/?view=security';
  else if (nd.conversationId) targetUrl = `/?conversation=${nd.conversationId}`;
  else if (nd.url) targetUrl = nd.url;
  if (event.action === 'view' || !event.action) {
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) {
          c.postMessage({ type: 'NOTIFICATION_CLICK', data: nd }); return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    }));
  } else if (event.action === 'secure') {
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) {
          c.postMessage({ type: 'SECURITY_ACTION', data: nd }); return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/?view=security');
    }));
  } else if (event.action === 'reply') {
    event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) c.postMessage({ type: 'QUICK_REPLY', data: nd });
    }));
  }
});

self.addEventListener('notificationclose', (event) => {
  console.log('[ServiceWorker] Notification closed', event.notification.tag);
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'send-messages') event.waitUntil(sendQueuedMessages());
});

async function sendQueuedMessages() {
  console.log('[ServiceWorker] Processing queued messages');
}
