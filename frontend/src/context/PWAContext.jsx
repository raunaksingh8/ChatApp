import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

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
  const isRunningStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true);

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

  // Tracks whether a reload is pending but was deferred because the user
  // was actively typing. The reload fires as soon as input is empty/idle.
  const pendingReloadRef = useRef(false);
  // Stores the active retry timeout so it can be cancelled on unmount.
  const retryTimerRef = useRef(null);
  // Stores the hourly polling interval so it can be cancelled on unmount.
  const pollIntervalRef = useRef(null);

  // ─── Service Worker Auto-Update ───────────────────────────────────────────
  // useRegisterSW wires up the SW registration lifecycle.
  //   onRegisteredSW  – called once the SW is registered; we set up periodic
  //                     update checks so a tab that stays open all day still
  //                     discovers new deployments.
  //   onNeedRefresh   – called when a new SW has been installed and is waiting
  //                     to activate (skipWaiting is already called in the SW,
  //                     so activation is automatic; we just need to reload the
  //                     page to swap in the new assets).
  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      // Periodic update check: browser only re-fetches the SW script if the
      // HTTP response has changed, so this is cheap and safe to do often.
      // Store the interval id so it can be cleaned up on unmount.
      pollIntervalRef.current = setInterval(() => {
        if (!navigator.onLine) return; // skip while offline
        registration.update().catch(() => {
          // Network error during update check – silently retry next interval.
        });
      }, SW_UPDATE_INTERVAL_MS);
    },

    onNeedRefresh() {
      // A new SW has downloaded and skipWaiting() made it active.
      // We need to reload the page to load the new JS/CSS assets.
      //
      // Safety checks before reloading:
      //   1. No text in the message composer (unsent message).
      //   2. No message currently in-flight (Socket.IO ack or REST API call
      //      pending) — detected via the send button's disabled state, which
      //      reflects sendingRef.current and the `sending` React state.
      //   3. The user is not focused on any interactive element other than
      //      the message input (e.g. emoji picker, search box, modals).
      //
      // If any check fails, retry every 5 s. Only one retry chain runs at a
      // time — a new call to onNeedRefresh cancels any existing timer first.

      // Guard: if already pending, cancel old timer before starting a new one.
      if (pendingReloadRef.current && retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const isSafeToReload = () => {
        // 1. Check unsent text in the composer textarea.
        const composer = document.querySelector('.message-input');
        if (composer && composer.value && composer.value.trim().length > 0) {
          return false;
        }

        // 2. Check if a send is in-flight: the send button is disabled while
        //    sendingRef.current === true (or the textarea is empty / offline).
        //    We distinguish "in-flight" from "disabled because empty" by also
        //    requiring that the composer is empty (checked above). So if we
        //    reach here with an empty composer but the button is still disabled,
        //    a previous send ack has not yet returned — defer.
        const sendBtn = document.querySelector('.btn-send-message');
        const isSendInFlight =
          sendBtn &&
          sendBtn.disabled &&
          // The button is also disabled when input is empty or offline.
          // We only want to defer for the in-flight case, so we check the
          // aria-label: if the button title says "offline" it's the offline
          // disable — that's fine to reload through (network is gone anyway).
          sendBtn.getAttribute('title') !== 'You are offline';
        if (isSendInFlight) return false;

        // 3. Check active focus: if the user is focused on any form element
        //    that is NOT the message composer, they may be interacting with
        //    search, a modal, or another input — defer.
        const active = document.activeElement;
        const isFormElement =
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT') &&
          active !== composer;
        if (isFormElement) return false;

        return true;
      };

      const reloadWhenIdle = () => {
        if (isSafeToReload()) {
          pendingReloadRef.current = false;
          retryTimerRef.current = null;
          window.location.reload();
        } else {
          // Not safe yet — retry in 5 seconds.
          pendingReloadRef.current = true;
          retryTimerRef.current = setTimeout(reloadWhenIdle, 5000);
        }
      };

      reloadWhenIdle();
    },

    onOfflineReady() {
      // App is ready to work offline – no action needed, offline banner
      // is handled by the existing OfflineBanner component.
    },

    onRegisterError(error) {
      console.error('[PWA] Service worker registration failed:', error);
    },
  });

  // Clean up the polling interval and any pending retry timer when the
  // PWAProvider unmounts (e.g. during hot-reload in development).
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // Detect iOS environment
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent || '') && !window.MSStream);

  // Check and listen for standalone mode changes
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.navigator.standalone === true;

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
