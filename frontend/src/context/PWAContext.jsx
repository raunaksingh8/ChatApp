import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION } from '../constants/version';
import { isInstalledPWA } from '../services/pushNotifications';

// How often the SW polls for a new version while the app is open (ms).
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Early capture of beforeinstallprompt to ensure it is never missed if fired early
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__deferredPwaPrompt = e;
  });
}

const PWAContext = createContext(null);

export const PWAProvider = ({ children }) => {
  // Check standalone mode (launched as installed PWA)
  const isRunningStandalone = typeof window !== 'undefined' && isInstalledPWA();

  const [deferredPrompt, setDeferredPrompt] = useState(() => {
    if (typeof window !== 'undefined' && window.__deferredPwaPrompt) {
      return window.__deferredPwaPrompt;
    }
    return null;
  });

  const [canInstall, setCanInstall] = useState(!isRunningStandalone);
  const [isStandalone, setIsStandalone] = useState(isRunningStandalone);
  const [isInstalled, setIsInstalled] = useState(isRunningStandalone);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showReconnectedBanner, setShowReconnectedBanner] = useState(false);

  // Tracks whether there was an active controlling SW when the current page loaded
  const hadPreviousControllerRef = useRef(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? Boolean(navigator.serviceWorker.controller)
      : false
  );
  // Stores the active SW registration so it can be updated on demand/focus
  const swRegistrationRef = useRef(null);
  // Guard to prevent double execution of reload
  const isReloadingRef = useRef(false);
  // Tracks whether a reload is pending but was deferred because the user was actively typing
  const pendingReloadRef = useRef(false);
  // Stores the active retry timeout so it can be cancelled on unmount
  const retryTimerRef = useRef(null);
  // Stores the polling interval so it can be cancelled on unmount
  const pollIntervalRef = useRef(null);

  // ─── Safe Auto-Update Reload Handler ──────────────────────────────────────
  const triggerSafeReload = useCallback((reason = 'update') => {
    if (isReloadingRef.current) return;

    // Reload loop guard: throttle if an update reload occurred < 12 seconds ago
    try {
      const lastReload = Number(sessionStorage.getItem('letuschat_last_update_reload') || '0');
      const now = Date.now();
      if (now - lastReload < 12000) {
        console.log(`[PWA] Throttling reload loop (${reason}); last reload was ${Math.round((now - lastReload) / 1000)}s ago.`);
        return;
      }
    } catch {}

    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    pendingReloadRef.current = true;

    const isSafeToReload = () => {
      // 1. Check unsent text in the message composer textarea
      const composer = document.querySelector('.message-input');
      if (composer && composer.value && composer.value.trim().length > 0) {
        return false;
      }

      // 2. Check if a message is currently in-flight
      const sendBtn = document.querySelector('.btn-send-message');
      const isSendInFlight =
        sendBtn &&
        sendBtn.disabled &&
        sendBtn.getAttribute('title') !== 'You are offline';
      if (isSendInFlight) return false;

      // 3. Check active focus on other inputs/modals
      const active = document.activeElement;
      const isOtherFormElement =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT') &&
        active !== composer;
      if (isOtherFormElement) return false;

      return true;
    };

    const executeOrRetry = () => {
      if (isSafeToReload()) {
        isReloadingRef.current = true;
        pendingReloadRef.current = false;
        retryTimerRef.current = null;
        try {
          sessionStorage.setItem('letuschat_last_update_reload', Date.now().toString());
        } catch {}
        console.log(`[PWA] Applying latest deployment update (${reason})...`);
        window.location.reload();
      } else {
        // Retry in 4 seconds when idle
        pendingReloadRef.current = true;
        retryTimerRef.current = setTimeout(executeOrRetry, 4000);
      }
    };

    executeOrRetry();
  }, []);

  // ─── Service Worker Auto-Update Registration ──────────────────────────────
  const { updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      swRegistrationRef.current = registration;

      // Periodic check every 15 minutes while app is running
      pollIntervalRef.current = setInterval(() => {
        if (!navigator.onLine) return;
        registration.update().catch(() => {});
      }, 15 * 60 * 1000);
    },

    // In autoUpdate mode, vite-plugin-pwa fires onNeedReload when the new SW activates
    onNeedReload() {
      triggerSafeReload('onNeedReload');
    },

    // In prompt mode or Workbox waiting events, fires onNeedRefresh
    onNeedRefresh() {
      triggerSafeReload('onNeedRefresh');
    },

    onOfflineReady() {
      console.log('[PWA] Service worker offline ready.');
    },

    onRegisterError(error) {
      console.error('[PWA] Service worker registration failed:', error);
    },
  });

  // ─── Native Controllerchange & Visibility Update Check ─────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // 1. Listen for new service worker taking control (skipWaiting + clientsClaim)
    const handleControllerChange = () => {
      // Only reload if the app was ALREADY controlled by an earlier service worker
      if (hadPreviousControllerRef.current) {
        console.log('[PWA] New service worker took control via controllerchange.');
        triggerSafeReload('controllerchange');
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // 2. Check for updates on foreground visibility and window focus
    const handleCheckUpdate = () => {
      if (navigator.onLine && swRegistrationRef.current) {
        swRegistrationRef.current.update().catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleCheckUpdate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleCheckUpdate);

    // 3. Expose debug helper on window for testing and diagnostics
    window.__LETUSCHAT_PWA__ = {
      version: APP_VERSION,
      checkForUpdate: handleCheckUpdate,
      triggerSafeReload: () => triggerSafeReload('manual-diagnostic'),
      getRegistration: () => swRegistrationRef.current
    };

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleCheckUpdate);
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [triggerSafeReload]);

  // Detect iOS environment
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent || '') && !window.MSStream);

  // Check and listen for standalone mode changes
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = isInstalledPWA();

      setIsStandalone(isStandaloneMode);
      if (isStandaloneMode) {
        setCanInstall(false);
        setIsInstalled(true);
      }
    };

    checkStandalone();

    const mediaMatcher = window.matchMedia('(display-mode: standalone)');
    const handleModeChange = (e) => {
      if (e.matches) {
        setIsStandalone(true);
        setCanInstall(false);
        setIsInstalled(true);
      }
    };

    try {
      mediaMatcher.addEventListener('change', handleModeChange);
    } catch {
      mediaMatcher.addListener(handleModeChange);
    }

    return () => {
      try {
        mediaMatcher.removeEventListener('change', handleModeChange);
      } catch {
        mediaMatcher.removeListener(handleModeChange);
      }
    };
  }, []);

  // Capture beforeinstallprompt event (Chrome, Edge, Android)
  useEffect(() => {
    if (isStandalone || isInstalled) return;

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.__deferredPwaPrompt = e;
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      window.__deferredPwaPrompt = null;
      setDeferredPrompt(null);
      setCanInstall(false);
      setIsInstalled(true);
      setIsInstallModalOpen(false);
      console.log('[PWA] LetUsChat was successfully installed as an app.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isStandalone, isInstalled]);

  // Monitor network connectivity changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnectedBanner(true);
      const timer = setTimeout(() => setShowReconnectedBanner(false), 4500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnectedBanner(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Trigger installation workflow
  const promptInstall = useCallback(async () => {
    const activePrompt = deferredPrompt || (typeof window !== 'undefined' ? window.__deferredPwaPrompt : null);

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choiceResult = await activePrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted installation prompt');
          setCanInstall(false);
          setIsInstalled(true);
          setDeferredPrompt(null);
          if (typeof window !== 'undefined') {
            window.__deferredPwaPrompt = null;
          }
        } else {
          console.log('[PWA] User dismissed installation prompt');
        }
      } catch (err) {
        console.error('[PWA] Installation prompt error:', err);
      }
    } else if (isIOS) {
      // Show iOS step-by-step instructions
      setIsInstallModalOpen(true);
    } else {
      setIsInstallModalOpen(true);
    }
  }, [deferredPrompt, isIOS]);

  return (
    <PWAContext.Provider
      value={{
        canInstall,
        isStandalone,
        isInstalled,
        isIOS,
        isOnline,
        showReconnectedBanner,
        promptInstall,
        isInstallModalOpen,
        openInstallModal: () => setIsInstallModalOpen(true),
        closeInstallModal: () => setIsInstallModalOpen(false)
      }}
    >
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
};

export default PWAContext;
