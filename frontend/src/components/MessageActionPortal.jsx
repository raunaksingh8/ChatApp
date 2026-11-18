import React, { useState, useEffect, useRef, useCallback } from 'react';
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

/**
 * Compute toolbar position using the message bubble's getBoundingClientRect().
 * Accounts for Android PWA safe-area insets and clamps inside the visible viewport.
 */
function getToolbarPosition(rect, isSentByMe, isExpanded) {
  if (!rect) return { top: 120, left: 16 };

  const PADDING = 10;
  const TOOLBAR_WIDTH = isExpanded ? 300 : 310;
  const TOOLBAR_HEIGHT = isExpanded ? 240 : 56;

  // Read safe-area insets from CSS env() variables (Android PWA / notched devices)
  const safeTop = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--sai-top') || '0', 10
  ) || 0;
  const safeBottom = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--sai-bottom') || '0', 10
  ) || 0;

  const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const viewportW = window.visualViewport ? window.visualViewport.width : window.innerWidth;

  const spaceAbove = rect.top - safeTop - PADDING;
  const hasSpaceAbove = spaceAbove >= TOOLBAR_HEIGHT + PADDING;

  let top;
  if (hasSpaceAbove) {
    top = rect.top - TOOLBAR_HEIGHT - PADDING;
  } else {
    top = rect.bottom + PADDING;
  }

  // Align horizontally with the bubble
  let left;
  if (isSentByMe) {
    left = rect.right - TOOLBAR_WIDTH;
  } else {
    left = rect.left;
  }

  // Clamp within viewport
  const maxLeft = viewportW - TOOLBAR_WIDTH - PADDING;
  left = Math.max(PADDING, Math.min(left, maxLeft));

  const maxTop = viewportH - safeBottom - TOOLBAR_HEIGHT - PADDING;
  top = Math.max(safeTop + PADDING, Math.min(top, maxTop));

  return { top: Math.round(top), left: Math.round(left) };
}

const MessageActionPortal = ({
  isOpen,
  msg,
  rect: initialRect,
  isSentByMe,
  onReact,
  onReply,
  onClose,
  currentUserId
}) => {
  const [showFullPicker, setShowFullPicker] = useState(false);
  // Independently track the computed position so we can recalculate on resize/scroll
  const [pos, setPos] = useState({ top: 0, left: 0 });
  // Delay backdrop activation so the long-press pointerup can't immediately close the portal
  const [backdropActive, setBackdropActive] = useState(false);
  const backdropTimerRef = useRef(null);
  // Guard to prevent backdrop from closing while an action is executing
  const actionInProgressRef = useRef(false);
  // Keep a live ref to initialRect so the resize handler can recalculate
  const rectRef = useRef(initialRect);

  // Recalculate position from the message bubble's live DOMRect
  const recalcPosition = useCallback(() => {
    if (!rectRef.current) return;
    setPos(getToolbarPosition(rectRef.current, isSentByMe, showFullPicker));
  }, [isSentByMe, showFullPicker]);

  useEffect(() => {
    rectRef.current = initialRect;
    recalcPosition();
  }, [initialRect, recalcPosition]);

  useEffect(() => {
    if (!isOpen) return;
    setShowFullPicker(false);
    actionInProgressRef.current = false;
    setBackdropActive(false);

    // Small delay so the long-press pointerup doesn't instantly dismiss the portal
    backdropTimerRef.current = setTimeout(() => setBackdropActive(true), 160);

    const handleResize = () => recalcPosition();
    window.addEventListener('resize', handleResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }

    return () => {
      clearTimeout(backdropTimerRef.current);
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg?.id, isOpen]);

  // Recalculate when expanded state changes
  useEffect(() => {
    recalcPosition();
  }, [showFullPicker, recalcPosition]);

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

  const handleEmojiSelect = (emoji) => {
    actionInProgressRef.current = true;
    if (onReact) onReact(msg.id, emoji);
    // Defer close so the click/tap handler fully completes first
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

  const handleBackdropInteraction = (e) => {
    if (!backdropActive) return;
    if (actionInProgressRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  return createPortal(
    <>
      {/* Full-screen invisible backdrop — dismisses toolbar on outside tap/click */}
      <div
        className="msg-portal-backdrop"
        // pointerdown + pointerup pair: pointerup fires AFTER button onClick on most browsers
        onPointerDown={(e) => { e.stopPropagation(); }}
        onPointerUp={handleBackdropInteraction}
        // Fallback for environments where pointerup doesn't fire
        onClick={handleBackdropInteraction}
        onTouchStart={(e) => e.stopPropagation()}
      />

      {/* Floating Toolbar Portal */}
      <div
        className={`msg-portal-toolbar ${isSentByMe ? 'sent' : 'received'}`}
        style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        // Swallow all events so the backdrop doesn't see them
        onPointerDown={(e) => { e.stopPropagation(); actionInProgressRef.current = true; }}
        onPointerUp={(e) => { e.stopPropagation(); }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
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
              onClick={() => { actionInProgressRef.current = true; setShowFullPicker(true); actionInProgressRef.current = false; }}
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
