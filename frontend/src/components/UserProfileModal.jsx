import React, { useState } from 'react';
import { X, User, Shield, AlertTriangle, Calendar, Wifi, WifiOff } from 'lucide-react';
import '../styles/Profile.css';

const UserProfileModal = ({ isOpen, user, onClose, onBlockUser }) => {
  const [blocking, setBlocking] = useState(false);

  if (!isOpen || !user) return null;

  const handleBlock = () => {
    const confirmed = window.confirm(
      `Are you sure you want to block ${user.display_name || user.username}?\n\nThis will remove them from your contacts and prevent them from sending you messages or contact requests.`
    );
    if (!confirmed) return;

    if (onBlockUser) {
      setBlocking(true);
      onBlockUser(user.id);
    }
  };

  const formattedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Unknown';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container profile-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <User size={20} />
            Contact Info
          </h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="profile-modal-body">
          {/* Avatar & Names Header */}
          <div className="user-view-header">
            <div className="user-view-avatar">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} />
              ) : (
                <span>{(user.display_name || user.username).charAt(0).toUpperCase()}</span>
              )}
              <span className={`user-view-status-dot ${user.is_online ? 'online' : 'offline'}`} />
            </div>

            <h3 className="user-view-display-name">{user.display_name || user.username}</h3>
            <span className="user-view-handle">@{user.username}</span>

            <div className="user-view-presence">
              {user.is_online ? (
                <span className="presence-tag online"><Wifi size={12} /> Online</span>
              ) : (
                <span className="presence-tag offline"><WifiOff size={12} /> Offline</span>
              )}
            </div>
          </div>

          {/* About Section */}
          <div className="user-view-section">
            <label className="user-view-label">About</label>
            <p className="user-view-about">
              {user.about ? user.about : <em>No bio provided.</em>}
            </p>
          </div>

          {/* Member Since */}
          <div className="user-view-section">
            <label className="user-view-label">Member Since</label>
            <div className="user-view-meta">
              <Calendar size={14} />
              <span>{formattedDate}</span>
            </div>
          </div>

          {/* Block Action */}
          <div className="user-view-danger-zone">
            <button
              type="button"
              className="btn-block-contact"
              onClick={handleBlock}
              disabled={blocking}
            >
              <AlertTriangle size={16} />
              <span>Block {user.display_name || user.username}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;

