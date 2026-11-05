import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Smile, Heart, ThumbsUp, Sparkles, Gift } from 'lucide-react';
import '../styles/Profile.css';

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: Smile,
    emojis: [
      '😀','😃','😄','😁','😆','😅','😂','🤣','🥲','🥹','☺️','😊','😇','🙂','🙃','😉',
      '😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎',
      '🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺',
      '😢','😭','😮‍💨','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓',
      '🫣','🤗','🫡','🤫','🫢','🫡','🤔','💭','🤐','🤨','😐','😑','😶','🫥','🫠','🤫'
    ]
  },
  {
    id: 'gestures',
    name: 'Gestures & People',
    icon: ThumbsUp,
    emojis: [
      '👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️',
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫸','🫷','👏','🙌','👐','🤲','🤝','🙏','✍️',
      '💪','🦾','👂','🦻','👃','🧠','👀','👁️','👅','👄','🫦','💋','🫂','👶','🧒','👧'
    ]
  },
  {
    id: 'hearts',
    name: 'Hearts & Symbols',
    icon: Heart,
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓',
      '💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🕎','☯️','☦️','🛐','⛎',
      '💯','🔥','⭐','🌟','✨','⚡','💥','🎉','🎊','🎈','🎂','🎁','🏆','🥇','🥈','🥉'
    ]
  },
  {
    id: 'objects',
    name: 'Objects & Activities',
    icon: Gift,
    emojis: [
      '☕','🍵','🧃','🥤','🍕','🍔','🍟','🌭','🍿','🍩','🍪','🍫','🍬','🍭','🍷','🍺',
      '⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🏸','🥊','🎮','🕹️','🎯','🎲','🧩','🎨',
      '📱','💻','🖥️','📷','🎥','📺','⏰','💡','🔦','💸','💵','💰','💳','🔒','🔑','✉️'
    ]
  }
];

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];

const EmojiPicker = ({ isOpen, onSelectEmoji, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const pickerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentCategoryObj = EMOJI_CATEGORIES.find((c) => c.id === activeCategory);

  const displayedEmojis = searchQuery.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    : currentCategoryObj?.emojis || [];

  return (
    <div className="emoji-picker-container" ref={pickerRef} onClick={(e) => e.stopPropagation()}>
      {/* Quick Reactions Bar */}
      <div className="emoji-quick-reactions">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="btn-quick-emoji"
            onClick={() => onSelectEmoji(emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Category Tabs */}
      <div className="emoji-category-tabs">
        {EMOJI_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id && !searchQuery;
          return (
            <button
              key={cat.id}
              type="button"
              className={`emoji-cat-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setActiveCategory(cat.id);
              }}
              title={cat.name}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {/* Emoji Grid */}
      <div className="emoji-grid-scroll">
        <span className="emoji-grid-title">
          {searchQuery ? 'All Emojis' : currentCategoryObj?.name}
        </span>
        <div className="emoji-grid">
          {displayedEmojis.map((emoji, idx) => (
            <button
              key={`${emoji}-${idx}`}
              type="button"
              className="emoji-item-btn"
              onClick={() => onSelectEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmojiPicker;

