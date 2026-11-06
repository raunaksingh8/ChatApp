import React from 'react';
import { Download } from 'lucide-react';
import { usePWA } from '../context/PWAContext';

export const InstallAppButton = () => {
  const { canInstall, isStandalone, isInstalled, promptInstall } = usePWA();

  if (!canInstall || isStandalone || isInstalled) {
    return null;
  }

  return (
    <div className="auth-install-wrapper">
      <div className="auth-install-divider">
        <span>OR</span>
      </div>
      <button
        type="button"
        className="btn-auth-install"
        onClick={promptInstall}
        aria-label="Install LetUsChat as App"
        title="Install LetUsChat as App"
      >
        <Download size={16} />
        <span>Install as App</span>
      </button>
    </div>
  );
};

export default InstallAppButton;

