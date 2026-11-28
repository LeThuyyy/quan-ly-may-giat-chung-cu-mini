/* Push only. Never cache authenticated pages or API responses. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { /* Generic visible fallback. */ }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
    const url = safeDestination(payload.url);
    const title = payload.title === 'Đã đến giờ giặt xong dự kiến'
      ? payload.title : 'Đến lượt giặt của bạn';
    await self.registration.showNotification(title, {
      body: typeof payload.body === 'string' ? payload.body.slice(0, 300)
        : 'Bạn có lượt kiểm tra máy. Mở ứng dụng để xem hạn và trạng thái mới nhất.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : 'laundry-assignment',
      data: { url },
    });
  })());
});

function safeDestination(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin);
    if (url.origin === self.location.origin && /^\/buildings\/[0-9a-f-]{36}\/overview$/.test(url.pathname)
      && !url.search && !url.hash) return url.href;
  } catch { /* Never open URLs supplied by an untrusted push payload. */ }
  return new URL('/buildings', self.location.origin).href;
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = safeDestination(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
        const navigated = await client.navigate(destination);
        if (navigated) return navigated.focus();
      }
    }
    return self.clients.openWindow(destination);
  })());
});
