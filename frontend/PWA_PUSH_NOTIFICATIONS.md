# PulseChat Web Push Notification Architecture & Implementation Roadmap

## 1. Overview & Current Status

PulseChat has been upgraded to a Progressive Web App (PWA). While the application is installable on Android, Windows, macOS, and iOS (Safari 16.4+), **Web Push Notifications are not yet active**. 

To deliver background push notifications when the application is closed or the user's screen is off, the backend and browser push service must be configured together. This document explains the exact architecture and the necessary steps to enable Web Push notifications.

---

## 2. Web Push Notification Architecture

Web Push requires coordination across three components:

```
[ User Browser / PWA ] <---> [ Push Service (FCM/Mozilla/Apple) ] <---> [ PulseChat Backend ]
        |                                                                      |
        | 1. Request Permission & Subscribe                                    |
        | 2. Send PushSubscription Object ------------------------------------>|
        |                                                                      | 3. Store Subscription in DB
        |                                                                      |
        |                                                                      | 4. Message sent to recipient
        |                                                                      | 5. Trigger Web Push (VAPID)
        |<------------------- 6. Deliver Push Payload -------------------------|
        |
        | 7. Service Worker 'push' Event
        | 8. Display Notification via showNotification()
```

---

## 3. Required Backend Infrastructure

### 3.1. Generate VAPID Key Pair
The backend must authenticate to browser push servers using the VAPID (Voluntary Application Server Identification) protocol.
Install `web-push` on the backend:
```bash
cd backend
npm install web-push
npx web-push generate-vapid-keys
```
Add the output keys to `backend/.env`:
```env
VAPID_PUBLIC_KEY=BG...
VAPID_PRIVATE_KEY=...
VAPID_MAILTO=mailto:admin@pulsechat.app
```

### 3.2. Database Schema: Push Subscriptions Table
Create a table in PostgreSQL (Supabase) to store device push subscriptions:
```sql
CREATE TABLE public.chat_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.chat_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_push_user_id ON public.chat_push_subscriptions(user_id);
```

### 3.3. Subscription Management Endpoints
Add Express routes in `backend/routes/notificationRoutes.js`:
- `POST /api/notifications/subscribe`: Saves the endpoint and encryption keys (`p256dh`, `auth`) linked to `req.user.id`.
- `POST /api/notifications/unsubscribe`: Removes the subscription when the user disables notifications or logs out.

### 3.4. Trigger Push on Message Receipt
In `backend/sockets/socketHandler.js` (or in the message sending pipeline):
When a message is received for an offline recipient (or recipient without active socket focus), fetch their active subscriptions from `chat_push_subscriptions` and invoke:
```javascript
webpush.sendNotification(subscription, JSON.stringify({
  title: sender.display_name || sender.username,
  body: message.message_text,
  icon: '/icons/icon-192x192.png',
  badge: '/icons/icon-192x192.png',
  data: {
    senderId: sender.id,
    url: `/`
  }
}));
```

---

## 4. Frontend & Service Worker Requirements

### 4.1. Push Event Listener in Service Worker
When converting from Workbox `generateSW` to `injectManifest` or appending custom service worker code, add:
```javascript
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const title = payload.title || 'PulseChat';
  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: payload.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Open Chat' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
```

### 4.2. User Consent UX
- Never prompt for notification permissions on initial page load.
- Add an explicit toggle under **Profile / Settings** (e.g. "Enable Desktop & Mobile Notifications").
- On toggle click:
  1. Call `Notification.requestPermission()`.
  2. If granted, call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) })`.
  3. Send the generated `PushSubscription` to `/api/notifications/subscribe`.

---

## 5. Platform-Specific Support

| Platform | Support Status | Requirements |
|---|---|---|
| **Android Chrome / Edge / Samsung Internet** | Full Background Push | Works in browser and installed standalone mode |
| **Desktop Chrome / Edge / Brave / Firefox** | Full Background Push | Supported natively via Web Standards |
| **macOS Safari (Ventura 13+)** | Supported | Requires Safari user permission |
| **iOS / iPadOS (iOS 16.4+)** | Supported with Condition | **App must be added to Home Screen first**; Web Push is not permitted in Safari tab mode on iOS |

