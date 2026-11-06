import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, UserPlus, CheckCircle } from 'lucide-react';
import '../styles/Profile.css';

const SWIPE_THRESHOLD = 65;
const AUTO_DISMISS_MS = 3000;

const InAppToast = ({ notification, onOpen, onDismiss }) => {
  // exitState: 'idle' | 'exit-left' | 'exit-right' | 'exit-auto'
  const [exitState, setExitState] = useState('idle');
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const hasMovedRef = useRef(false);
  const isGestureActiveRef = useRef(false);
  const isDismissedRef = useRef(false);
  const autoTimerRef = useRef(null);
  const cleanupTimerRef = useRef(null);

  const triggerDismiss = (direction) => {
    if (isDismissedRef.current) return;
    isDismissedRef.current = true;

    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    setExitState(direction);

    // Give animation 260ms to complete before unmounting from parent state
    cleanupTimerRef.current = setTimeout(() => {
      onDismiss(notification.id);
    }, 260);
  };

  // Independent 3-second auto-dismiss timer for this notification
  useEffect(() => {
    if (!notification) return;

    autoTimerRef.current = setTimeout(() => {
      triggerDismiss('exit-auto');
    }, AUTO_DISMISS_MS);

    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, [notification?.id]);

  if (!notification) return null;

  // Pointer / Touch Swipe Event Handlers
  const handlePointerDown = (e) => {
    if (isDismissedRef.current) return;
    // Only capture primary mouse button or touch
    if (e.button !== undefined && e.button !== 0) return;

    isGestureActiveRef.current = true;
    hasMovedRef.current = false;
    const clientX = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
    startXRef.current = clientX;
    startYRef.current = clientY;
    currentOffsetRef.current = 0;
    setIsDragging(false);
  };

  const handlePointerMove = (e) => {
    if (!isGestureActiveRef.current || isDismissedRef.current) return;
    const clientX = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
    const deltaX = clientX - startXRef.current;
    const deltaY = clientY - startYRef.current;

    // If movement is predominantly vertical, let the page scroll naturally
    if (!hasMovedRef.current && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      isGestureActiveRef.current = false;
      return;
    }

    if (Math.abs(deltaX) > 8) {
      hasMovedRef.current = true;
      setIsDragging(true);
      currentOffsetRef.current = deltaX;
      setDragOffset(deltaX);
    }
  };

  const handlePointerUp = () => {
    if (!isGestureActiveRef.current || isDismissedRef.current) return;
    isGestureActiveRef.current = false;
    setIsDragging(false);

    const deltaX = currentOffsetRef.current;

    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      // Swiped past threshold -> dismiss immediately in direction of swipe
      triggerDismiss(deltaX > 0 ? 'exit-right' : 'exit-left');
    } else if (!hasMovedRef.current) {
      // Clean tap/click -> open relevant conversation
      if (!isDismissedRef.current) {
        isDismissedRef.current = true;
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        onOpen(notification);
        onDismiss(notification.id);
      }
    } else {
      // Released below threshold -> smoothly snap back
      setDragOffset(0);
      currentOffsetRef.current = 0;
    }
  };

  const handlePointerCancel = () => {
    isGestureActiveRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
    currentOffsetRef.current = 0;
  };

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

  // Determine dynamic styles for smooth drag and exit animation
  let transform = undefined;
  let opacity = undefined;
  let transition = isDragging
    ? 'none'
    : 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.26s ease';

  if (isDragging) {
    transform = `translateX(${dragOffset}px)`;
    opacity = Math.max(0.15, 1 - Math.abs(dragOffset) / 250);
  } else if (exitState === 'exit-left') {
    transform = 'translateX(-120%)';
    opacity = 0;
  } else if (exitState === 'exit-right') {
    transform = 'translateX(120%)';
    opacity = 0;
  } else if (exitState === 'exit-auto') {
    transform = 'translateY(-16px) scale(0.96)';
    opacity = 0;
  }

  return (
    <div
      className={`inapp-toast-container ${exitState !== 'idle' ? exitState : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform,
        opacity,
        transition
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onTouchCancel={handlePointerCancel}
      role="alert"
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
    </div>
  );
};

export default InAppToast;
