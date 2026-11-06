import React, { useState, useRef } from 'react';
import {
  CornerUpLeft,
  Clock,
  Flame,
  Check,
  CheckCheck
} from 'lucide-react';

const SWIPE_REPLY_THRESHOLD = 45;
const MAX_SWIPE_DISTANCE = 65;
const LONG_PRESS_DURATION_MS = 450;

const MessageBubbleItem = ({
  msg,
  isSentByMe,
  isPending,
  isRead,
  countdown,
  formatTime,
  onReply,
  onScrollToOriginal,
  isContextMenuOpen,
  onOpenContextMenu,
  onCloseContextMenu
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const isHorizontalSwipeRef = useRef(false);
  const isVerticalScrollRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const hasTriggeredVibrateRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Touch handlers for mobile swipe-to-reply and long-press
  const handleTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    isHorizontalSwipeRef.current = false;
    isVerticalScrollRef.current = false;
    hasTriggeredVibrateRef.current = false;

    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      if (!isVerticalScrollRef.current && !isHorizontalSwipeRef.current) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25); } catch {}
        }
        onOpenContextMenu(msg.id);
      }
    }, LONG_PRESS_DURATION_MS);
  };

  const handleTouchMove = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Any distinct movement cancels the long-press menu
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearLongPress();
    }

    // Lock gesture direction early
    if (!isHorizontalSwipeRef.current && !isVerticalScrollRef.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 7) {
        isVerticalScrollRef.current = true;
        return; // Allow native chat history scrolling
      } else if (dx < -7 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontalSwipeRef.current = true;
      }
    }

    // Only swipe leftwards
    if (isHorizontalSwipeRef.current) {
      setIsSwiping(true);
      const offset = Math.min(MAX_SWIPE_DISTANCE, Math.max(0, -dx));
      setSwipeOffset(offset);

      if (offset >= SWIPE_REPLY_THRESHOLD && !hasTriggeredVibrateRef.current) {
        hasTriggeredVibrateRef.current = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(15); } catch {}
        }
      } else if (offset < SWIPE_REPLY_THRESHOLD) {
        hasTriggeredVibrateRef.current = false;
      }
    }
  };

  const handleTouchEnd = () => {
    clearLongPress();

    if (isHorizontalSwipeRef.current && swipeOffset >= SWIPE_REPLY_THRESHOLD) {
      onReply(msg);
    }

    setIsSwiping(false);
    setSwipeOffset(0);
    isHorizontalSwipeRef.current = false;
    isVerticalScrollRef.current = false;
  };

  const handleTouchCancel = () => {
    clearLongPress();
    setIsSwiping(false);
    setSwipeOffset(0);
    isHorizontalSwipeRef.current = false;
    isVerticalScrollRef.current = false;
  };

  // Mouse contextual actions (right-click or long-press on desktop)
  const handleContextMenu = (e) => {
    e.preventDefault();
    onOpenContextMenu(msg.id);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // primary click only
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      onOpenContextMenu(msg.id);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleMouseUp = () => {
    clearLongPress();
  };

  return (
    <div
      id={`msg-${msg.id}`}
      className={`message-row ${isSentByMe ? 'sent' : 'received'}`}
    >
      {/* Desktop hover action trigger to reply */}
      <button
        type="button"
        className="message-action-trigger"
        onClick={() => onReply(msg)}
        title="Reply to this message"
        aria-label="Reply to this message"
      >
        <CornerUpLeft size={13} />
      </button>

      <div className="message-bubble-wrapper">
        <div
          id={`msg-bubble-${msg.id}`}
          className={`message-bubble ${swipeOffset > 0 ? 'is-swiping' : ''}`}
          style={{
            transform: swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : undefined,
            transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        >
          {/* Floating Context Menu for Long-Press / Right-Click */}
          {isContextMenuOpen && (
            <div
              className={`message-context-menu ${isSentByMe ? 'sent' : 'received'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="message-context-item"
                onClick={() => {
                  onReply(msg);
                  onCloseContextMenu();
                }}
              >
                <CornerUpLeft size={14} />
                <span>Reply</span>
              </button>
            </div>
          )}

          {/* Quoted Message Preview if this message is a reply */}
          {msg.reply_to_message_id && (
            <div
              className={`message-reply-quote ${msg.reply_expired ? 'expired' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!msg.reply_expired) {
                  onScrollToOriginal(msg.reply_to_message_id);
                }
              }}
              title={msg.reply_expired ? 'Original message has expired' : 'Tap to view original message'}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !msg.reply_expired) {
                  e.stopPropagation();
                  onScrollToOriginal(msg.reply_to_message_id);
                }
              }}
            >
              <span className="message-reply-author">
                {msg.reply_sender_display_name || msg.reply_sender_username || 'Message'}
              </span>
              <span className="message-reply-snippet">
                {msg.reply_message_text || 'Original message'}
              </span>
            </div>
          )}

          <div className="message-text">{msg.message_text}</div>

          <div className="message-meta">
            {isPending ? (
              <span
                className="message-expiry-timer pending"
                title="Receiver is offline. Countdown begins only when delivered."
              >
                <Clock size={11} />
                Pending
              </span>
            ) : (
              countdown && (
                <span
                  className="message-expiry-timer"
                  title="Expires 5 minutes after delivery"
                >
                  <Flame size={11} style={{ color: 'var(--accent-primary)' }} />
                  {countdown}
                </span>
              )
            )}

            <span className="message-time">
              {formatTime(msg.created_at)}
            </span>

            {/* Delivery Status Indicator */}
            {isSentByMe && (
              <span className={`delivery-check ${isRead ? 'read' : ''}`}>
                {isPending ? (
                  <Clock size={12} style={{ opacity: 0.7 }} title="Pending delivery" />
                ) : isRead ? (
                  <CheckCheck size={14} title="Read" />
                ) : (
                  <Check size={13} title="Delivered" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Swipe-to-reply reveal indicator on the right side */}
        {swipeOffset > 0 && (
          <div
            className={`message-swipe-cue ${swipeOffset >= SWIPE_REPLY_THRESHOLD ? 'ready' : ''}`}
            style={{
              opacity: Math.min(1, swipeOffset / 32),
              transform: `translateY(-50%) scale(${
                swipeOffset >= SWIPE_REPLY_THRESHOLD ? 1.15 : 0.8 + swipeOffset / 120
              })`
            }}
          >
            <CornerUpLeft size={15} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubbleItem;

