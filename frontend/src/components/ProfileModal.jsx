import React, { useState, useEffect, useRef } from 'react';
import { X, User, Camera, Shield, Check, AlertCircle, Loader, Trash2, Bell, BellOff } from 'lucide-react';
import { profileAPI } from '../services/api';
import { canUsePushNotifications, disablePushNotifications, enablePushNotifications, getPushStatus } from '../services/pushNotifications';
import '../styles/Profile.css';

const ProfileModal = ({ isOpen, onClose, onProfileUpdated, onOpenBlockedUsers }) => {
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifChecked, setNotifChecked] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccessMsg('');
      setLoading(true);

      profileAPI.getMe()
        .then((res) => {
          if (res.success && res.profile) {
            setDisplayName(res.profile.display_name || '');
            setAbout(res.profile.about || '');
            setAvatarUrl(res.profile.avatar_url || '');
            setUsername(res.profile.username || '');
          }
        })
        .catch((err) => {
          setError('Failed to load profile.');
        })
        .finally(() => setLoading(false));

      // Check push notification status independently from backend per-device preference
      getPushStatus().then((status) => {
        setNotifEnabled(Boolean(status.enabled));
        setNotifDenied(status.permission === 'denied');
        setNotifChecked(true);
      }).catch(() => {
        setNotifEnabled(false);
        setNotifChecked(true);
      });
    }
  }, [isOpen]);

  // Handle avatar image file selection (max 2MB, jpg/png/webp)
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image file size must be less than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result);
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    const confirmed = window.confirm('Are you sure you want to remove your profile picture?');
    if (!confirmed) return;

    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      const res = await profileAPI.updateMe({ avatar_url: null });
      if (res.success && res.profile) {
        setAvatarUrl('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setSuccessMsg('Profile picture removed successfully.');
        if (onProfileUpdated) {
          onProfileUpdated(res.profile);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove profile picture.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);

    try {
      const res = await profileAPI.updateMe({
        display_name: displayName,
        about: about,
        avatar_url: avatarUrl
      });

      if (res.success) {
        setSuccessMsg('Profile updated successfully!');
        if (onProfileUpdated) {
          onProfileUpdated(res.profile);
        }
        window.dispatchEvent(new CustomEvent('chat:profile-updated', { detail: res.profile }));
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (notifLoading || !notifChecked) return;

    // If permission was denied, tell user to fix in browser/OS settings
    if (!notifEnabled && notifDenied) {
      setError('Notification permission is blocked. Please allow notifications for this site in your browser or Android settings, then try again.');
      return;
    }

    const wasEnabled = notifEnabled;
    const newState = !wasEnabled;

    // Show loading state without premature optimistic flip
    setNotifLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      if (newState) {
        await enablePushNotifications();
        // Show ON only after successful backend confirmation
        setNotifEnabled(true);
        setSuccessMsg('Notifications enabled on this device.');
        setNotifDenied(false);
      } else {
        await disablePushNotifications();
        // Show OFF only after successful backend confirmation
        setNotifEnabled(false);
        setSuccessMsg('Notifications disabled on this device.');
      }
    } catch (err) {
      // Toggle stays in its confirmed state on error; no flickering rollback
      setNotifEnabled(wasEnabled);
      if (err.message?.includes('permission') || err.message?.includes('blocked') || err.message?.includes('allow')) {
        setNotifDenied(true);
      }
      setError(err.message || 'Unable to update notification settings.');
    } finally {
      setNotifLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container profile-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <User size={20} />
            My Profile
          </h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="profile-loading">
            <Loader size={24} className="spin" />
            <span>Loading profile...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="profile-modal-body">
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

            {/* Profile Picture Upload Section */}
            <div className="profile-avatar-section">
              <div className="profile-avatar-wrap">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={username} className="profile-avatar-img" />
                ) : (
                  <div className="profile-avatar-fallback">
                    {displayName ? displayName.charAt(0).toUpperCase() : username ? username.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <button
                  type="button"
                  className="profile-avatar-edit-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload profile picture (Max 2MB)"
                >
                  <Camera size={16} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                />
              </div>
              <span className="profile-avatar-hint">Click the camera to upload photo (Max 2 MB)</span>
              {avatarUrl && (
                <button
                  type="button"
                  className="btn-remove-avatar"
                  onClick={handleRemoveAvatar}
                  disabled={saving}
                  title="Remove profile picture"
                >
                  <Trash2 size={13} />
                  <span>Remove Profile Picture</span>
                </button>
              )}
            </div>

            {/* Read-only Username */}
            <div className="profile-field-group">
              <label className="profile-field-label">Username</label>
              <input
                type="text"
                className="profile-input profile-input-readonly"
                value={`@${username}`}
                readOnly
                title="Username cannot be changed"
              />
              <span className="profile-field-hint">Unique identifier used for contact discovery</span>
            </div>

            {/* Display Name */}
            <div className="profile-field-group">
              <label className="profile-field-label">Display Name</label>
              <input
                type="text"
                className="profile-input"
                placeholder="How your friends see you (e.g. Aman Sharma)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
              />
              <span className="profile-field-hint">{displayName.length}/50 characters</span>
            </div>

            {/* About Section */}
            <div className="profile-field-group">
              <label className="profile-field-label">About / Bio</label>
              <textarea
                className="profile-textarea"
                placeholder="A brief note about yourself..."
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={200}
                rows={3}
              />
              <span className="profile-field-hint">{about.length}/200 characters</span>
            </div>

            {/* Blocked Users Settings Link */}
            <div className="profile-settings-row">
              <button
                type="button"
                className="btn-link-blocked"
                onClick={() => {
                  onClose();
                  if (onOpenBlockedUsers) onOpenBlockedUsers();
                }}
              >
                <Shield size={16} />
                <span>Manage Blocked Users</span>
              </button>
            </div>

            {/* Notification Toggle */}
            {canUsePushNotifications() && (
              <div className="profile-settings-row notification-toggle-row">
                <div className="notification-toggle-info">
                  {notifEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                  <div className="notification-toggle-labels">
                    <span className="notification-toggle-label">Notifications</span>
                    <span className="notification-toggle-status">
                      {!notifChecked
                        ? 'Checking…'
                        : notifEnabled
                        ? 'ON – Notifications Enabled'
                        : 'OFF – Notifications Disabled'}
                    </span>
                  </div>
                </div>
                <label className={`notification-toggle-switch${notifLoading ? ' toggle-loading' : ''}`}>
                  <input
                    type="checkbox"
                    checked={notifEnabled}
                    onChange={handleToggleNotifications}
                    disabled={notifLoading || !notifChecked}
                  />
                  <span className="toggle-slider">
                    {notifLoading && <Loader size={12} className="spin toggle-spinner" />}
                  </span>
                </label>
              </div>
            )}

            {/* Action Buttons */}
            <div className="profile-actions-row">
              <button
                type="button"
                className="btn-profile-cancel"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-profile-save"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader size={16} className="spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
