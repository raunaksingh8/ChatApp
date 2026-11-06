import React from 'react';
import { X, Download, Share, PlusSquare, Smartphone, Check, ShieldCheck } from 'lucide-react';
import { usePWA } from '../context/PWAContext';
import '../styles/PWA.css';

const InstallModal = () => {
  const { isInstallModalOpen, closeInstallModal, isIOS, promptInstall } = usePWA();

  if (!isInstallModalOpen) return null;

  return (
    <div className="modal-overlay pwa-modal-overlay" onClick={closeInstallModal}>
      <div className="modal-container pwa-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="pwa-header-brand">
            <div className="pwa-logo-icon">
              <img src="/icons/icon-192x192.png" alt="LetUsChat logo" />
            </div>
            <div>
              <h2 className="modal-title">Install LetUsChat</h2>
              <span className="pwa-header-subtitle">Private, Fast & Always Accessible</span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={closeInstallModal} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body pwa-modal-body">
          <div className="pwa-perks-list">
            <div className="pwa-perk-item">
              <Check size={16} className="pwa-perk-icon" />
              <span>Launches in fullscreen standalone mode like a native app</span>
            </div>
            <div className="pwa-perk-item">
              <Check size={16} className="pwa-perk-icon" />
              <span>Instant loading from your home screen</span>
            </div>
            <div className="pwa-perk-item">
              <ShieldCheck size={16} className="pwa-perk-icon" />
              <span>Zero installation footprint — no app store download required</span>
            </div>
          </div>

          {isIOS ? (
            /* iOS Specific Guidance */
            <div className="pwa-ios-instructions">
              <h3 className="pwa-instructions-title">
                <Smartphone size={18} />
                <span>How to Install on iPhone / iPad:</span>
              </h3>
              <ol className="pwa-steps-list">
                <li>
                  <div className="pwa-step-num">1</div>
                  <div className="pwa-step-text">
                    Open LetUsChat in <strong>Safari</strong> and tap the <strong>Share</strong> button <Share size={15} className="inline-icon" /> in the browser toolbar.
                  </div>
                </li>
                <li>
                  <div className="pwa-step-num">2</div>
                  <div className="pwa-step-text">
                    Scroll down the options list and select <strong>"Add to Home Screen"</strong> <PlusSquare size={15} className="inline-icon" />.
                  </div>
                </li>
                <li>
                  <div className="pwa-step-num">3</div>
                  <div className="pwa-step-text">
                    Tap <strong>"Add"</strong> in the top right corner. The LetUsChat app icon will appear directly on your home screen!
                  </div>
                </li>
              </ol>
            </div>
          ) : (
            /* Android / Desktop Guidance */
            <div className="pwa-action-box">
              <p className="pwa-action-desc">
                Click the button below to add LetUsChat to your device.
              </p>
              <button
                type="button"
                className="btn-pwa-install-primary"
                onClick={() => {
                  promptInstall();
                  closeInstallModal();
                }}
              >
                <Download size={18} />
                <span>Install LetUsChat</span>
              </button>
            </div>
          )}

          <div className="pwa-modal-footer">
            <button type="button" className="btn-pwa-dismiss" onClick={closeInstallModal}>
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallModal;
