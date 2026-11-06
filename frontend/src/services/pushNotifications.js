import { pushAPI } from './api';

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const getRegistration = () => navigator.serviceWorker.ready;

export const canUsePushNotifications = () => (
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
);

export const enablePushNotifications = async () => {
  if (!canUsePushNotifications()) throw new Error('Push notifications are not supported by this browser.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

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
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await pushAPI.subscribe(subscription.toJSON());
};

export const disablePushNotifications = async () => {
  if (!canUsePushNotifications()) return;

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await pushAPI.unsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
};
