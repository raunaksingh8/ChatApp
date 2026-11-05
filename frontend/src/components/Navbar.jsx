import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, LogOut, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePWA } from '../context/PWAContext';
import ThemeToggle from './ThemeToggle';
import '../styles/Navbar.css';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { canInstall, promptInstall } = usePWA();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="app-navbar">
      <Link to={isAuthenticated ? '/chat' : '/login'} className="navbar-brand">
        <div className="brand-icon-wrapper">
          <MessageSquare size={20} />
        </div>
        <span className="brand-title">
          PulseChat
          <span className="brand-badge">5m Ephemeral</span>
        </span>
      </Link>

      <div className="navbar-actions">
        {canInstall && (
          <button
            type="button"
            className="btn-install-pwa"
            onClick={promptInstall}
            title="Install PulseChat on your device"
            aria-label="Install PulseChat"
          >
            <Download size={15} />
            <span className="btn-install-text">Install App</span>
          </button>
        )}

        <ThemeToggle />

        {isAuthenticated && user && (
          <>
            <div className="navbar-user-chip" title={`Logged in as ${user.username}`}>
              <div className="user-avatar-mini">
                {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <span>{user.username}</span>
            </div>

            <button
              onClick={handleLogout}
              className="btn-navbar-logout"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;

