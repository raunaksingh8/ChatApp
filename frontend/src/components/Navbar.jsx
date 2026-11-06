import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Download, Info, LogOut, Menu, MessageSquare, Shield, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePWA } from '../context/PWAContext';
import { profileAPI } from '../services/api';
import ThemeToggle from './ThemeToggle';
import '../styles/Navbar.css';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { canInstall, promptInstall } = usePWA();
  const navigate = useNavigate();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const notificationsRef = useRef(null);

  // Sync incoming requests from CustomEvent
  useEffect(() => {
    const syncNotifications = (event) => setIncomingRequests(event.detail?.incoming || []);
    window.addEventListener('chat:notifications', syncNotifications);
    return () => window.removeEventListener('chat:notifications', syncNotifications);
  }, []);

  // Fetch current user's profile on auth
  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated) {
      profileAPI.getMe()
        .then((res) => {
          if (isMounted && res.success && res.profile) {
            setProfileData(res.profile);
          }
        })
        .catch(() => {});
    } else {
      setProfileData(null);
    }
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  // Sync profile updates from ProfileModal
  useEffect(() => {
    const handleProfileUpdated = (event) => {
      if (event.detail) {
        setProfileData(event.detail);
      }
    };
    window.addEventListener('chat:profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('chat:profile-updated', handleProfileUpdated);
  }, []);

  // Handle Notification Popover outside click and escape key
  useEffect(() => {
    if (!isNotificationsOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('touchstart', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('touchstart', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);

  // Handle Mobile Drawer scroll lock, resize, and escape key
  useEffect(() => {
    if (!isDrawerOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 600) {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      document.body.style.overflow = originalOverflow;
    };
  }, [isDrawerOpen]);

  // Handle About Modal escape key & scroll lock
  useEffect(() => {
    if (!isAboutModalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsAboutModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isAboutModalOpen]);

  const dispatchChatAction = (detail) => {
    window.dispatchEvent(new CustomEvent('chat:navigation-action', { detail }));
    setIsNotificationsOpen(false);
    setIsDrawerOpen(false);
  };

  const handleLogout = () => {
    setIsNotificationsOpen(false);
    setIsDrawerOpen(false);
    setIsAboutModalOpen(false);
    logout();
    navigate('/login');
  };

  // Derive active profile display data
  const displayAvatar = profileData?.avatar_url || user?.avatar_url;
  const displayName = profileData?.display_name || user?.display_name || user?.username || 'You';
  const username = profileData?.username || user?.username || '';
  const avatarLetter = (displayName || username || 'U').charAt(0).toUpperCase();

  return (
    <>
      <header className="app-navbar">
        <div className="navbar-left">
          {isAuthenticated && user && (
            <button
              type="button"
              className="btn-navbar-icon btn-navbar-menu"
              onClick={() => {
                setIsNotificationsOpen(false);
                setIsDrawerOpen(true);
              }}
              aria-label="Open menu"
              title="Open menu"
            >
              <Menu size={20} />
            </button>
          )}
          <Link
            to={isAuthenticated ? '/chat' : '/login'}
            className="navbar-brand"
            onClick={() => {
              setIsNotificationsOpen(false);
              setIsDrawerOpen(false);
            }}
          >
            <div className="brand-icon-wrapper">
              <MessageSquare size={20} />
            </div>
            <span className="brand-title">
              LetUsChat
              <span className="brand-badge">5m Ephemeral</span>
            </span>
          </Link>
        </div>

        <div className="navbar-right">
          {canInstall && (
            <button
              type="button"
              className="btn-install-pwa"
              onClick={promptInstall}
              title="Install LetUsChat on your device"
              aria-label="Install LetUsChat"
            >
              <Download size={15} />
              <span className="btn-install-text">Install App</span>
            </button>
          )}

          <div className="navbar-theme-toggle">
            <ThemeToggle />
          </div>

          {isAuthenticated && user && (
            <>
              <div className="navbar-notifications" ref={notificationsRef}>
                <button
                  type="button"
                  className="btn-navbar-icon btn-navbar-bell"
                  onClick={() => setIsNotificationsOpen((prev) => !prev)}
                  aria-label="Notifications"
                  aria-expanded={isNotificationsOpen}
                  title="Notifications"
                >
                  <Bell size={18} />
                  {incomingRequests.length > 0 && (
                    <span className="navbar-count-badge">
                      {incomingRequests.length > 9 ? '9+' : incomingRequests.length}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className="navbar-popover" role="dialog" aria-label="Incoming Requests">
                    <div className="navbar-popover-header">
                      <span className="navbar-popover-title">Requests</span>
                      {incomingRequests.length > 0 && (
                        <span className="navbar-popover-count">{incomingRequests.length}</span>
                      )}
                    </div>
                    <div className="navbar-popover-body">
                      {incomingRequests.length === 0 ? (
                        <p className="navbar-popover-empty">You're all caught up.</p>
                      ) : (
                        incomingRequests.map((request) => (
                          <div className="navbar-request" key={request.id}>
                            <span
                              className="navbar-request-name"
                              title={request.requester_display_name || request.requester_username}
                            >
                              {request.requester_display_name || request.requester_username}
                            </span>
                            <div className="navbar-request-actions">
                              <button
                                type="button"
                                className="btn-request-action accept"
                                onClick={() => dispatchChatAction({ type: 'accept-request', requestId: request.id })}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="btn-request-action decline"
                                onClick={() => dispatchChatAction({ type: 'reject-request', requestId: request.id })}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="btn-navbar-logout"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={16} />
                <span className="btn-logout-label">Logout</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Mobile Drawer Rendered via React Portal directly into document.body */}
      {isDrawerOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="mobile-drawer-portal-root"
          role="dialog"
          aria-modal="true"
          aria-label="Settings and navigation menu"
        >
          {/* Full-screen semi-transparent dark backdrop */}
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer sliding in from left */}
          <aside
            className="mobile-settings-drawer"
            onClick={(event) => event.stopPropagation()}
            aria-label="Navigation drawer"
          >
            {/* Header: Branding + Close button */}
            <div className="drawer-header">
              <div className="drawer-brand">
                <div className="brand-icon-wrapper mini">
                  <MessageSquare size={18} />
                </div>
                <span>LetUsChat</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close menu"
                title="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="drawer-body">
              {/* User profile picture, display name, handle, and online status */}
              {user && (
                <div className="drawer-user-info">
                  <div className="drawer-user-avatar">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt={displayName} className="drawer-avatar-img" />
                    ) : (
                      <span className="drawer-avatar-letter">{avatarLetter}</span>
                    )}
                    <span className="drawer-avatar-online-dot" title="Online" />
                  </div>
                  <div className="drawer-user-details">
                    <span className="drawer-user-name" title={displayName}>
                      {displayName}
                    </span>
                    {username && (
                      <span className="drawer-user-handle">@{username}</span>
                    )}
                    <span className="drawer-user-status">
                      <span className="status-dot-inline" /> Online
                    </span>
                  </div>
                </div>
              )}

              {/* Preferences: Appearance / Dark-Light Mode */}
              <div className="drawer-section-label">Preferences</div>
              <div className="drawer-theme-item">
                <div className="drawer-theme-text-group">
                  <span className="drawer-theme-title">Appearance</span>
                  <span className="drawer-theme-desc">Dark / Light Mode</span>
                </div>
                <ThemeToggle showLabel />
              </div>

              {/* Navigation Items */}
              <div className="drawer-section-label">Menu</div>
              <div className="drawer-menu-list">
                <button
                  type="button"
                  className="drawer-menu-item"
                  onClick={() => dispatchChatAction({ type: 'open-profile' })}
                >
                  <div className="drawer-menu-icon">
                    <User size={18} />
                  </div>
                  <div className="drawer-menu-content">
                    <span className="drawer-menu-label">Profile</span>
                    <span className="drawer-menu-hint">Edit name, bio & photo</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="drawer-menu-item"
                  onClick={() => dispatchChatAction({ type: 'open-blocked-users' })}
                >
                  <div className="drawer-menu-icon">
                    <Shield size={18} />
                  </div>
                  <div className="drawer-menu-content">
                    <span className="drawer-menu-label">Blocked Users</span>
                    <span className="drawer-menu-hint">Manage blocked accounts</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="drawer-menu-item"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsAboutModalOpen(true);
                  }}
                >
                  <div className="drawer-menu-icon">
                    <Info size={18} />
                  </div>
                  <div className="drawer-menu-content">
                    <span className="drawer-menu-label">About LetUsChat</span>
                    <span className="drawer-menu-hint">Privacy & features</span>
                  </div>
                </button>

                {canInstall && (
                  <button
                    type="button"
                    className="drawer-menu-item"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      promptInstall();
                    }}
                  >
                    <div className="drawer-menu-icon">
                      <Download size={18} />
                    </div>
                    <div className="drawer-menu-content">
                      <span className="drawer-menu-label">Install App</span>
                      <span className="drawer-menu-hint">Add to Home Screen</span>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Logout anchored at the bottom */}
            <div className="drawer-footer">
              <button
                type="button"
                className="drawer-logout-btn"
                onClick={handleLogout}
                title="Log out of LetUsChat"
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* About LetUsChat Modal */}
      {isAboutModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="about-modal-backdrop"
          onClick={() => setIsAboutModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="About LetUsChat"
        >
          <div
            className="about-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="about-modal-header">
              <div className="drawer-brand">
                <div className="brand-icon-wrapper mini">
                  <MessageSquare size={18} />
                </div>
                <span>About LetUsChat</span>
              </div>
              <button
                type="button"
                className="about-modal-close"
                onClick={() => setIsAboutModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="about-modal-body">
              <div className="about-badge-wrap">
                <span className="about-pwa-badge">v1.0.0 (PWA)</span>
                <span className="about-ephemeral-badge">5-Minute Ephemeral</span>
              </div>
              <p className="about-modal-intro">
                LetUsChat is a private, real-time messaging application focused on user privacy and minimal digital footprint.
              </p>

              <div className="about-modal-points">
                <div className="about-point">
                  <div className="about-point-bullet">●</div>
                  <div>
                    <strong>5-Minute Self-Destruct</strong>
                    <p>All delivered messages automatically vanish from both devices after 5 minutes.</p>
                  </div>
                </div>
                <div className="about-point">
                  <div className="about-point-bullet">●</div>
                  <div>
                    <strong>Approved Contacts Only</strong>
                    <p>You can only message contacts after an explicit invitation has been accepted.</p>
                  </div>
                </div>
                <div className="about-point">
                  <div className="about-point-bullet">●</div>
                  <div>
                    <strong>Zero Tracking</strong>
                    <p>No advertisements, tracking scripts, or data brokers. Your conversations remain yours.</p>
                  </div>
                </div>
                <div className="about-point">
                  <div className="about-point-bullet">●</div>
                  <div>
                    <strong>Installable PWA</strong>
                    <p>Install LetUsChat directly on Android, iOS, Windows, or Mac with background notifications.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="about-modal-footer">
              <button
                type="button"
                className="btn-about-done"
                onClick={() => setIsAboutModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default Navbar;
