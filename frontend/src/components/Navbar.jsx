import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import '../styles/Navbar.css';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
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

