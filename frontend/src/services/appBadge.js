const notifyServiceWorker = (count) => {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: 'unread-badge', count }))
    .catch(() => {});
};

export const setAppBadge = async (count) => {
  const unreadCount = Math.max(0, Number(count) || 0);

  try {
    if (unreadCount > 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(unreadCount);
    } else if (unreadCount === 0 && typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge();
    }
  } catch {}

  notifyServiceWorker(unreadCount);
};

export const clearAppBadge = () => setAppBadge(0);
