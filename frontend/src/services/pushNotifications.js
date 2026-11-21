import { pushAPI } from './api';

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const getRegistration = () => navigator.serviceWorker.ready;

/**
 * Check whether the application is running inside an installed PWA
 * (Android WebAPK/TWA, iOS Home Screen standalone, or desktop PWA window).
 */
export const isInstalledPWA = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    (typeof document !== 'undefined' && document.referrer && document.referrer.startsWith('android-app://'))
  );
};

/**
 * Push notification management is strictly exclusive to the installed LetUsChat PWA.
 * Non-PWA browser contexts are excluded from push notification management.
 */
export const canUsePushNotifications = () => (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  isInstalledPWA()
);

export const enablePushNotifications = async () => {
  if (!canUsePushNotifications()) {
    throw new Error('Push notifications can only be managed within the installed LetUsChat PWA.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted. Please allow notifications in your browser or phone settings.');
  }

  let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  try {
    const keyResponse = await pushAPI.getPublicKey();
    if (keyResponse?.publicKey) {
      publicKey = keyResponse.publicKey;
    }
  } catch (error) {
    if (!publicKey) {
      throw new Error('Push notifications are not configured on this server.');
    }
  }

  if (!publicKey) {
    throw new Error('Push notifications are not configured on this server.');
  }

  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription || !subscription.toJSON().keys?.p256dh) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  const subData = subscription.toJSON ? subscription.toJSON() : subscription;
  const res = await pushAPI.subscribe({
    ...subData,
    notification_enabled: true
  });
  return res;
};

export const disablePushNotifications = async () => {
  if (!canUsePushNotifications()) return;

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const subData = subscription.toJSON ? subscription.toJSON() : subscription;

  // Persistently update notification_enabled to false on backend without destroying browser subscription
  const res = await pushAPI.subscribe({
    ...subData,
    endpoint: subscription.endpoint,
    notification_enabled: false
  });
  return res;
};

export const getPushStatus = async () => {
  if (!canUsePushNotifications()) {
    return { supported: false, permission: 'default', subscribed: false, enabled: false };
  }

  const permission = Notification.permission;
  let subscribed = false;
  let enabled = false;

  if (permission === 'granted') {
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      subscribed = !!subscription;
      if (subscription?.endpoint) {
        const keyResponse = await pushAPI.getPublicKey(subscription.endpoint);
        enabled = Boolean(keyResponse?.notification_enabled);
      }
    } catch {
      subscribed = false;
      enabled = false;
    }
  }

  return { supported: true, permission, subscribed, enabled };
};

export const syncPushSubscriptionIfGranted = async () => {
  if (!canUsePushNotifications()) return;
  if (Notification.permission !== 'granted') return;

  try {
    let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    try {
      const keyResponse = await pushAPI.getPublicKey();
      if (keyResponse?.publicKey) {
        publicKey = keyResponse.publicKey;
      }
    } catch {}

    if (!publicKey) return;

    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription || !subscription.toJSON().keys?.p256dh) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    if (subscription) {
      const subData = subscription.toJSON ? subscription.toJSON() : subscription;
      // Background sync must never overwrite an explicitly disabled preference back to ON
      await pushAPI.subscribe({
        ...subData,
        is_sync: true
      });
    }
  } catch (err) {
    console.warn('Sync push subscription warning:', err.message);
  }
};
