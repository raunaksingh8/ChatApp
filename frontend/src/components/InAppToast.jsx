import React, { useEffect } from 'react';
import { MessageSquare, UserPlus, CheckCircle, X } from 'lucide-react';
import '../styles/Profile.css';

const InAppToast = ({ notification, onOpen, onDismiss }) => {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, 4500);

    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  if (!notification) return null;

  const getIcon = () => {
    switch (notification.type) {
      case 'message':
        return <MessageSquare size={16} />;
      case 'contact_request':
        return <UserPlus size={16} />;
      case 'contact_accepted':
        return <CheckCircle size={16} />;
      default:
        return <MessageSquare size={16} />;
    }
  };

  return (
    <div
      className="inapp-toast-container"
      onClick={() => {
        onOpen(notification);
        onDismiss(notification.id);
      }}
    >
      <div className="inapp-toast-avatar">
        {notification.avatarUrl ? (
          <img src={notification.avatarUrl} alt={notification.title} />
        ) : (
          <span>{(notification.title || 'U').charAt(0).toUpperCase()}</span>
        )}
        <span className="inapp-toast-icon-badge">{getIcon()}</span>
      </div>

      <div className="inapp-toast-content">
        <span className="inapp-toast-title">{notification.title}</span>
        <span className="inapp-toast-body">{notification.body}</span>
      </div>

      <button
        type="button"
        className="inapp-toast-close"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default InAppToast;

