import React, { useState, useEffect, useRef } from 'react';
import {
  X, Search, UserPlus, Clock, Check, CheckCheck,
  UserCheck, MessageSquare, Loader, AlertCircle
} from 'lucide-react';
import { userAPI, contactAPI } from '../services/api';
import '../styles/Contacts.css';

const AddContactModal = ({ isOpen, onClose, onContactAdded, onOpenChat }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setError('');
      setSuccessMsg('');
      setHasSearched(false);
    }
  }, [isOpen]);

  const handleSearch = (value) => {
    setSearchQuery(value);
    setError('');
    setSuccessMsg('');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 1) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await userAPI.searchUsers(trimmed);
        if (data.success) {
          setSearchResults(data.users);
        }
        setHasSearched(true);
      } catch (err) {
        setError('Failed to search users.');
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSendRequest = async (userId) => {
    setActionLoading(userId);
    setError('');
    setSuccessMsg('');
    try {
      const data = await contactAPI.sendRequest(userId);
      if (data.success) {
        if (data.auto_accepted) {
          setSuccessMsg('Contact request auto-accepted! You are now contacts.');
          if (onContactAdded) onContactAdded();
        } else {
          setSuccessMsg('Contact request sent successfully.');
        }
        // Update the search results to reflect new status
        setSearchResults((prev) =>
          prev.map((u) => {
            if (u.id === userId) {
              return { ...u, relationship: data.auto_accepted ? 'accepted' : 'request_sent' };
            }
            return u;
          })
        );
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send request.';
      setError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptInSearch = async (user) => {
    setActionLoading(user.id);
    setError('');
    try {
      let data;
      if (user.request_id) {
        data = await contactAPI.acceptRequest(user.request_id);
      } else {
        data = await contactAPI.sendRequest(user.id);
      }
      if (data.success) {
        setSuccessMsg('Contact request accepted! You are now contacts.');
        setSearchResults((prev) =>
          prev.map((u) => u.id === user.id ? { ...u, relationship: 'accepted' } : u)
        );
        if (onContactAdded) onContactAdded();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectInSearch = async (user) => {
    setActionLoading(user.id);
    setError('');
    try {
      if (user.request_id) {
        await contactAPI.rejectRequest(user.request_id);
      }
      setSuccessMsg('Contact request rejected.');
      setSearchResults((prev) =>
        prev.map((u) => u.id === user.id ? { ...u, relationship: 'none', request_id: null } : u)
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject request.');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <UserPlus size={20} />
            Add Contact
          </h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-search-box">
            <div className="search-input-wrapper">
              <Search className="search-icon" size={17} />
              <input
                ref={inputRef}
                type="text"
                className="search-input"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                autoComplete="off"
              />
              {searching && <Loader className="search-spinner" size={16} />}
            </div>
          </div>

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

          <div className="modal-results">
            {!hasSearched && !searching && (
              <div className="modal-hint">
                Enter a username to find registered users.
              </div>
            )}

            {hasSearched && searchResults.length === 0 && !searching && (
              <div className="modal-hint">
                No users found matching "{searchQuery.trim()}".
              </div>
            )}

            {searchResults.map((user) => (
              <div key={user.id} className="search-result-item">
                <div className="result-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="result-info">
                  <span className="result-username">{user.username}</span>
                  <span className={`result-status-line ${user.is_online ? 'online' : 'offline'}`}>
                    ● {user.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="result-actions">
                  {user.relationship === 'none' && (
                    <button
                      className="btn-action btn-send-request"
                      onClick={() => handleSendRequest(user.id)}
                      disabled={actionLoading === user.id}
                    >
                      {actionLoading === user.id ? <Loader size={14} className="spin" /> : <UserPlus size={14} />}
                      <span>Add</span>
                    </button>
                  )}

                  {user.relationship === 'request_sent' && (
                    <span className="status-badge badge-pending">
                      <Clock size={13} /> Sent
                    </span>
                  )}

                  {user.relationship === 'request_received' && (
                    <>
                      <button
                        className="btn-action btn-accept"
                        onClick={() => handleAcceptInSearch(user)}
                        disabled={actionLoading === user.id}
                        title="Accept contact request"
                      >
                        {actionLoading === user.id ? <Loader size={14} className="spin" /> : <CheckCheck size={14} />}
                        <span>Accept</span>
                      </button>
                      <button
                        className="btn-action btn-reject"
                        onClick={() => handleRejectInSearch(user)}
                        disabled={actionLoading === user.id}
                        title="Reject contact request"
                      >
                        <X size={14} />
                        <span>Reject</span>
                      </button>
                    </>
                  )}

                  {user.relationship === 'accepted' && (
                    <button
                      className="btn-action btn-open-chat"
                      onClick={() => {
                        if (onOpenChat) onOpenChat(user);
                        onClose();
                      }}
                    >
                      <MessageSquare size={14} />
                      <span>Chat</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddContactModal;

