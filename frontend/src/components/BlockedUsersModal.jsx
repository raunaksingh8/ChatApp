import React, { useState, useEffect } from 'react';
import { X, Shield, ShieldOff, AlertCircle, Loader, Check } from 'lucide-react';
import { blockAPI } from '../services/api';
import '../styles/Profile.css';

const BlockedUsersModal = ({ isOpen, onClose, onUserUnblocked }) => {
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchBlockedUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await blockAPI.getBlocked();
      if (data.success && Array.isArray(data.blocked_users)) {
        setBlockedUsers(data.blocked_users);
      }
    } catch (err) {
      setError('Failed to load blocked users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessMsg('');
      fetchBlockedUsers();
    }
  }, [isOpen]);

  const handleUnblock = async (user) => {
    const confirmed = window.confirm(`Unblock ${user.display_name || user.username}? You will be able to exchange contact requests again.`);
    if (!confirmed) return;

    setActionLoading(user.id);
    setError('');
    setSuccessMsg('');

    try {
      const res = await blockAPI.unblockUser(user.id);
      if (res.success) {
        setSuccessMsg(`Unblocked ${user.display_name || user.username}.`);
        setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id));
        if (onUserUnblocked) onUserUnblocked(user.id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to unblock user.');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container profile-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <Shield size={20} />
            Blocked Users
          </h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="profile-modal-body">
          {error && (
            <div className="modal-alert modal-alert-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="modal-alert modal-alert-success">
              <Check size={15} />
              <span>{successMsg}</span>
            </div>
          )}

          <p className="blocked-modal-description">
            Blocked users cannot send you messages or contact requests. Unblocking allows sending new contact requests.
          </p>

          {loading ? (
            <div className="profile-loading">
              <Loader size={20} className="spin" />
              <span>Loading blocked list...</span>
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="blocked-empty-state">
              <ShieldOff size={32} />
              <p>You have not blocked any users.</p>
            </div>
          ) : (
            <div className="blocked-users-list">
              {blockedUsers.map((u) => (
                <div key={u.id} className="blocked-user-row">
                  <div className="blocked-user-avatar">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.username} />
                    ) : (
                      <span>{(u.display_name || u.username).charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="blocked-user-info">
                    <span className="blocked-user-name">{u.display_name || u.username}</span>
                    <span className="blocked-user-handle">@{u.username}</span>
                  </div>

                  <button
                    type="button"
                    className="btn-unblock"
                    onClick={() => handleUnblock(u)}
                    disabled={actionLoading === u.id}
                  >
                    {actionLoading === u.id ? <Loader size={14} className="spin" /> : <ShieldOff size={14} />}
                    <span>Unblock</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlockedUsersModal;

