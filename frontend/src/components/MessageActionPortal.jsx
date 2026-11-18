import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CornerUpLeft, Plus } from 'lucide-react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

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

function getToolbarPosition(rect, isSentByMe, isExpanded) {
  if (!rect) return { top: 120, left: 16 };
  const PADDING = 10;
  const TOOLBAR_WIDTH = 300;
  const TOOLBAR_HEIGHT = isExpanded ? 230 : 52;
  const HEADER_HEIGHT = 68;

  const spaceAbove = rect.top - HEADER_HEIGHT;
  const hasSpaceAbove = spaceAbove >= TOOLBAR_HEIGHT + PADDING;

  let top;
  if (hasSpaceAbove) {
    top = rect.top - TOOLBAR_HEIGHT - PADDING;
  } else {
    top = rect.bottom + PADDING;
  }

  let left;
  if (isSentByMe) {
    left = rect.right - TOOLBAR_WIDTH;
  } else {
    left = rect.left;
  }

  const maxLeft = window.innerWidth - TOOLBAR_WIDTH - PADDING;
  if (left < PADDING) left = PADDING;
  if (left > maxLeft) left = maxLeft;

  const maxTop = window.innerHeight - TOOLBAR_HEIGHT - PADDING;
  if (top > maxTop) top = maxTop;
  if (top < HEADER_HEIGHT + PADDING) top = HEADER_HEIGHT + PADDING;

  return { top: Math.round(top), left: Math.round(left) };
}

const MessageActionPortal = ({
  isOpen,
  msg,
  rect,
  isSentByMe,
  onReact,
  onReply,
  onClose,
  currentUserId
}) => {
  const [showFullPicker, setShowFullPicker] = useState(false);
  // Track whether a toolbar action is in-progress to prevent backdrop from closing early
  const actionInProgressRef = useRef(false);

  useEffect(() => {
    setShowFullPicker(false);
    actionInProgressRef.current = false;
  }, [msg?.id, isOpen]);

  if (!isOpen || !msg || typeof document === 'undefined') return null;

  const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
  let myReactionEmoji = null;
  if (currentUserId) {
    for (const r of reactions) {
      if (Array.isArray(r.users) && r.users.some((u) => u.id === currentUserId)) {
        myReactionEmoji = r.emoji;
        break;
      }
    }
  }

  const pos = getToolbarPosition(rect, isSentByMe, showFullPicker);

  const handleEmojiSelect = (emoji) => {
    actionInProgressRef.current = true;
    if (onReact) onReact(msg.id, emoji);
    // Defer close to ensure click handler completes first
    requestAnimationFrame(() => {
      actionInProgressRef.current = false;
      onClose();
    });
  };

  const handleReplySelect = () => {
    actionInProgressRef.current = true;
    if (onReply) onReply(msg);
    requestAnimationFrame(() => {
      actionInProgressRef.current = false;
      onClose();
    });
  };

  // Backdrop dismiss: use pointerup so it fires AFTER button onClick
  const handleBackdropPointerUp = (e) => {
    if (actionInProgressRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  // Prevent backdrop pointerdown from reaching message list (stops spurious long-press)
  const handleBackdropPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return createPortal(
    <>
      {/* Invisible backdrop — covers entire screen, dismisses toolbar on tap outside */}
      <div
        className="msg-portal-backdrop"
        onPointerDown={handleBackdropPointerDown}
        onPointerUp={handleBackdropPointerUp}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!actionInProgressRef.current) onClose();
        }}
      />

      {/* Floating Toolbar Portal */}
      <div
        className={`msg-portal-toolbar ${isSentByMe ? 'sent' : 'received'}`}
        style={{
          top: `${pos.top}px`,
          left: `${pos.left}px`
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {showFullPicker ? (
          <div className="msg-portal-full-picker">
            {FULL_EMOJI_LIST.map((e) => (
              <button
                key={e}
                type="button"
                className="msg-full-emoji-btn"
                onPointerDown={(ev) => { ev.stopPropagation(); }}
                onClick={() => handleEmojiSelect(e)}
                title={e}
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="msg-portal-toolbar-row">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`msg-reaction-btn context-emoji-btn${myReactionEmoji === emoji ? ' active' : ''}`}
                onPointerDown={(e) => { e.stopPropagation(); actionInProgressRef.current = true; }}
                onClick={() => handleEmojiSelect(emoji)}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className="msg-reaction-btn context-emoji-btn msg-more-btn"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={() => setShowFullPicker(true)}
              title="More reactions"
            >
              <Plus size={14} />
            </button>

            <div className="msg-toolbar-separator" />

            <button
              type="button"
              className="msg-reply-action-btn"
              onPointerDown={(e) => { e.stopPropagation(); actionInProgressRef.current = true; }}
              onClick={handleReplySelect}
              title="Reply to message"
            >
              <CornerUpLeft size={14} />
              <span>Reply</span>
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default MessageActionPortal;
