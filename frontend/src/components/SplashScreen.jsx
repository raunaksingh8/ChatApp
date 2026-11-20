import React from 'react';
import AppLogo from './AppLogo';
import { APP_VERSION } from '../constants/version';
import '../styles/SplashScreen.css';

export const SplashScreen = ({ isFadingOut = false }) => {
  return (
    <div
      className={`splash-screen-root ${isFadingOut ? 'splash-fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading LetUsChat"
    >
      {/* Invisible top spacer for vertical balance */}
      <div className="splash-top-spacer" />

      {/* Main Branding Section */}
      <div className="splash-brand-block">
        <div className="splash-logo-wrap">
          <AppLogo size={135} className="splash-logo-svg" />
        </div>
        <h1 className="splash-app-title">
          <span className="splash-title-letus">LetUs</span>
          <span className="splash-title-chat">Chat</span>
        </h1>
        <p className="splash-tagline">
          <span>Connect</span>
          <span className="splash-tagline-dot">•</span>
          <span>Chat</span>
          <span className="splash-tagline-dot">•</span>
          <span>Share</span>
        </p>
      </div>

      {/* Loading & Version Section */}
      <div className="splash-bottom-block">
        <div className="splash-spinner" aria-hidden="true" />
        <span className="splash-version-text">Version {APP_VERSION}</span>
      </div>
    </div>
  );
};

export default SplashScreen;
