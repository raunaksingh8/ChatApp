import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

// Take control of all clients immediately when a new SW activates.
// skipWaiting() ensures the waiting SW becomes active without requiring
// all tabs to be closed. clientsClaim() makes the new SW control all
// open pages right away so they serve fresh assets.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api\//, /^\/socket\.io/]
}));

registerRoute(({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/'), new NetworkOnly());
registerRoute(
  ({ request, url }) => request.destination === 'image' && !url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'pulsechat-static-images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })]
  })
);
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'pulsechat-web-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })]
  })
);

const updateBadge = async (count) => {
  const unreadCount = Math.max(0, Number(count) || 0);
  const badgeTarget = self.registration.setAppBadge ? self.registration : self.navigator;

  try {
    if (unreadCount > 0 && typeof badgeTarget.setAppBadge === 'function') {
      await badgeTarget.setAppBadge(unreadCount);
    } else if (unreadCount === 0 && typeof badgeTarget.clearAppBadge === 'function') {
      await badgeTarget.clearAppBadge();
    }
  } catch {}
};

self.addEventListener('message', (event) => {
  if (event.data?.type === 'unread-badge') event.waitUntil(updateBadge(event.data.count));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {};
  }

  const tasks = [updateBadge(payload.unreadCount)];
  if (payload.showNotification) {
    tasks.push(self.registration.showNotification('LetUsChat', {
      body: 'You have a new message.',
      tag: 'pulsechat-message',
      renotify: false,
      data: { url: '/chat' }
    }));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const targetUrl = new URL(event.notification.data?.url || '/chat', self.location.origin).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existingClient) return existingClient.focus();
    return self.clients.openWindow(targetUrl);
  })());
});
