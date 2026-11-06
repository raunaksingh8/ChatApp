import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
