import React, { useState, useRef, useCallback } from 'react';
import {
  CornerUpLeft,
  Clock,
  Flame,
  Check,
  CheckCheck,
  Plus
} from 'lucide-react';

const SWIPE_REPLY_THRESHOLD = 45;
const MAX_SWIPE_DISTANCE = 65;
const LONG_PRESS_DURATION_MS = 450;

// Quick reactions shown in toolbar
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

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
  onCloseContextMenu,
  onReact,
  currentUserId,
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  // Desktop: show hover toolbar
  const [isHovered, setIsHovered] = useState(false);
  // Show full emoji picker inside toolbar
  const [showFullPicker, setShowFullPicker] = useState(false);

  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const isHorizontalSwipeRef = useRef(false);
  const isVerticalScrollRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const hasTriggeredVibrateRef = useRef(false);
  const hoverLeaveTimerRef = useRef(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // ── Hover management (desktop) ──────────────────────────────────────────────
  // Using a small delay on leave so the pointer can move onto the toolbar
  const handleBubbleMouseEnter = () => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    setIsHovered(true);
  };
  const handleBubbleMouseLeave = () => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      setShowFullPicker(false);
    }, 120);
  };
  const handleToolbarMouseEnter = () => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    setIsHovered(true);
  };
  const handleToolbarMouseLeave = () => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      setShowFullPicker(false);
    }, 120);
  };

  // ── Touch handlers (mobile) ──────────────────────────────────────────────────
  const handleTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isHorizontalSwipeRef.current = false;
    isVerticalScrollRef.current = false;
    hasTriggeredVibrateRef.current = false;

    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      if (!isVerticalScrollRef.current && !isHorizontalSwipeRef.current) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25); } catch {}
        }
        // Show context menu (long-press toolbar)
        onOpenContextMenu(msg.id);
      }
    }, LONG_PRESS_DURATION_MS);
  };

  const handleTouchMove = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPress();

    if (!isHorizontalSwipeRef.current && !isVerticalScrollRef.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 7) {
        isVerticalScrollRef.current = true;
        return;
      } else if (dx < -7 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontalSwipeRef.current = true;
      }
    }

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

  // Desktop right-click
  const handleContextMenu = (e) => {
    e.preventDefault();
    onOpenContextMenu(msg.id);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      onOpenContextMenu(msg.id);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleMouseUp = () => clearLongPress();

  // ── Reaction helper ──────────────────────────────────────────────────────────
  const handleReact = useCallback((emoji) => {
    if (onReact) onReact(msg.id, emoji);
    onCloseContextMenu();
    setShowFullPicker(false);
    setIsHovered(false);
  }, [msg.id, onReact, onCloseContextMenu]);

  // ── Reaction display ─────────────────────────────────────────────────────────
  // msg.reactions: [{emoji, count, users: [{id, username, display_name}]}]
  const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
  const myReactionEmoji = (() => {
    if (!currentUserId) return null;
    for (const r of reactions) {
      if (Array.isArray(r.users) && r.users.some(u => u.id === currentUserId)) return r.emoji;
    }
    return null;
  })();

  // ── Inline full emoji picker (simple, no external dep) ──────────────────────
  const FULL_EMOJI_LIST = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰',
    '😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥',
    '😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔',
    '😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨',
    '😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬','😷',
    '🤒','🤕','🤢','🤮','🤧','😇','🥳','🥺','🤠','🤡','🤥','🤫','🤭','🧐','🤓',
    '😈','👿','👹','👺','💀','☠️','👻','👽','👾','🤖','💩','😺','😸','😹','😻',
    '👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','🤏','👈','👉',
    '👆','🖕','👇','☝️','✋','🤚','🖐','🖖','👋','🤙','💪','🦾','🖐️','🦿','🙌',
    '👏','🤲','🤝','🙏','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️',
    '💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','🔥','💯','🎉',
    '🎊','🎁','🎈','🎀','🏆','🥇','⭐','🌟','💫','✨','💥','❄️','🌈','☀️','🌙',
    '🍕','🍔','🍟','🌮','🍜','🍣','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🧁','🥤',
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
  ];

  return (
    <div
      id={`msg-${msg.id}`}
      className={`message-row ${isSentByMe ? 'sent' : 'received'}`}
    >
      <div className="message-bubble-wrapper">
        {/* ── Desktop Hover Action Toolbar ───────────────────────────────── */}
        {isHovered && !isContextMenuOpen && (
          <div
            className={`msg-action-toolbar ${isSentByMe ? 'sent' : 'received'}`}
            onMouseEnter={handleToolbarMouseEnter}
            onMouseLeave={handleToolbarMouseLeave}
          >
            {showFullPicker ? (
              <div className="msg-full-emoji-picker">
                {FULL_EMOJI_LIST.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="msg-full-emoji-btn"
                    onClick={() => handleReact(e)}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <div className="msg-action-toolbar-row">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`msg-reaction-btn${myReactionEmoji === emoji ? ' active' : ''}`}
                    onClick={() => handleReact(emoji)}
                    title={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  className="msg-reaction-btn msg-more-btn"
                  onClick={() => setShowFullPicker(true)}
                  title="More reactions"
                >
                  <Plus size={13} />
                </button>
                <div className="msg-toolbar-separator" />
                <button
                  type="button"
                  className="msg-reply-action-btn"
                  onClick={() => { onReply(msg); setIsHovered(false); }}
                  title="Reply"
                >
                  <CornerUpLeft size={13} />
                  <span>Reply</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Message Bubble ─────────────────────────────────────────────── */}
        <div
          id={`msg-bubble-${msg.id}`}
          className={`message-bubble ${swipeOffset > 0 ? 'is-swiping' : ''}`}
          style={{
            transform: swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : undefined,
            transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          onMouseEnter={handleBubbleMouseEnter}
          onMouseLeave={handleBubbleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={(e) => { handleMouseUp(); handleBubbleMouseLeave(e); }}
          onContextMenu={handleContextMenu}
        >
          {/* ── Long-Press Context Toolbar (mobile + desktop) ──────────── */}
          {isContextMenuOpen && (
            <div
              className={`message-context-menu ${isSentByMe ? 'sent' : 'received'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="context-menu-inner">
                {/* Quick reactions */}
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`msg-reaction-btn context-emoji-btn${myReactionEmoji === emoji ? ' active' : ''}`}
                    onClick={() => handleReact(emoji)}
                    title={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  className="msg-reaction-btn context-emoji-btn msg-more-btn"
                  onClick={() => {
                    setShowFullPicker(true);
                    // Keep menu open with full picker shown via state; we re-use
                    // the context menu area for it
                  }}
                  title="More reactions"
                >
                  <Plus size={13} />
                </button>

                <div className="msg-toolbar-separator" />

                {/* Reply action */}
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

              {/* Full emoji picker inside context menu */}
              {showFullPicker && (
                <div className="msg-full-emoji-picker context-full-picker">
                  {FULL_EMOJI_LIST.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="msg-full-emoji-btn"
                      onClick={() => handleReact(e)}
                      title={e}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Quoted Reply Preview ───────────────────────────────────── */}
          {msg.reply_to_message_id && (
            <div
              className={`message-reply-quote ${msg.reply_expired ? 'expired' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!msg.reply_expired) onScrollToOriginal(msg.reply_to_message_id);
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

          {/* ── Message Text ───────────────────────────────────────────── */}
          <div className="message-text">{msg.message_text}</div>

          {/* ── Message Meta (time + status) ───────────────────────────── */}
          <div className="message-meta">
            {isPending && !msg._optimistic ? (
              <span className="message-expiry-timer pending" title="Sending...">
                <Clock size={11} />
                Sending…
              </span>
            ) : isPending ? (
              <span className="message-expiry-timer pending" title="Receiver is offline. Countdown begins only when delivered.">
                <Clock size={11} />
                Pending
              </span>
            ) : (
              countdown && (
                <span className="message-expiry-timer" title="Expires 5 minutes after delivery">
                  <Flame size={11} style={{ color: 'var(--accent-primary)' }} />
                  {countdown}
                </span>
              )
            )}

            <span className="message-time">{formatTime(msg.created_at)}</span>

            {isSentByMe && (
              <span className={`delivery-check ${isRead ? 'read' : ''}`}>
                {msg._optimistic ? (
                  <Clock size={12} style={{ opacity: 0.6 }} title="Sending…" />
                ) : isPending ? (
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

        {/* ── Swipe-to-reply reveal indicator ───────────────────────────── */}
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

        {/* ── Reactions Display (below bubble) ─────────────────────────── */}
        {reactions.length > 0 && (
          <div className="message-reactions-row">
            {reactions.map((r) => {
              const isMine = Array.isArray(r.users) && r.users.some(u => u.id === currentUserId);
              const tooltipNames = Array.isArray(r.users)
                ? r.users.map(u => u.display_name || u.username).join(', ')
                : '';
              return (
                <button
                  key={r.emoji}
                  type="button"
                  className={`reaction-pill${isMine ? ' mine' : ''}`}
                  onClick={() => onReact && onReact(msg.id, r.emoji)}
                  title={tooltipNames}
                >
                  <span>{r.emoji}</span>
                  {r.count > 1 && <span className="reaction-count">{r.count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubbleItem;
