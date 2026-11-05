import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { usePWA } from '../context/PWAContext';
import '../styles/PWA.css';

const OfflineBanner = () => {
  const { isOnline, showReconnectedBanner } = usePWA();

  if (isOnline && !showReconnectedBanner) {
    return null;
  }

  if (!isOnline) {
    return (
      <aside className="pwa-network-banner offline" role="status" aria-live="polite">
        <div className="pwa-banner-content">
          <WifiOff size={16} className="pwa-banner-icon" />
          <span className="pwa-banner-text">
            <strong>You are currently offline.</strong> An active internet connection is required to send and receive messages.
          </span>
        </div>
      </aside>
    );
  }

  if (showReconnectedBanner) {
    return (
      <aside className="pwa-network-banner online" role="status" aria-live="polite">
        <div className="pwa-banner-content">
          <Wifi size={16} className="pwa-banner-icon" />
          <span className="pwa-banner-text">
            <strong>Back online.</strong> Real-time messaging connection restored.
          </span>
        </div>
      </aside>
    );
  }

  return null;
};

export default OfflineBanner;

