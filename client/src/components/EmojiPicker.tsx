import React, { useState, useMemo } from 'react';
import { Search, Smile, Heart, ThumbsUp, Sparkles, Coffee } from 'lucide-react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  emojis: { emoji: string; name: string }[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: <Smile size={16} />,
    emojis: [
      { emoji: '😀', name: 'grinning face' },
      { emoji: '😃', name: 'grinning face with big eyes' },
      { emoji: '😄', name: 'grinning face with smiling eyes' },
      { emoji: '😁', name: 'beaming face' },
      { emoji: '😆', name: 'grinning squinting face' },
      { emoji: '😅', name: 'grinning face with sweat' },
      { emoji: '🤣', name: 'rolling on the floor laughing' },
      { emoji: '😂', name: 'face with tears of joy' },
      { emoji: '🙂', name: 'slightly smiling face' },
      { emoji: '🙃', name: 'upside-down face' },
      { emoji: '😉', name: 'winking face' },
      { emoji: '😊', name: 'smiling face with smiling eyes' },
      { emoji: '😇', name: 'smiling face with halo' },
      { emoji: '🥰', name: 'smiling face with hearts' },
      { emoji: '😍', name: 'smiling face with heart-eyes' },
      { emoji: '🤩', name: 'star-struck' },
      { emoji: '😘', name: 'face blowing a kiss' },
      { emoji: '😗', name: 'kissing face' },
      { emoji: '😚', name: 'kissing face with closed eyes' },
      { emoji: '😋', name: 'face savoring food' },
      { emoji: '😛', name: 'face with tongue' },
      { emoji: '😜', name: 'winking face with tongue' },
      { emoji: '🤪', name: 'zany face' },
      { emoji: '😝', name: 'squinting face with tongue' },
      { emoji: '🤑', name: 'money-mouth face' },
      { emoji: '🤗', name: 'smiling face with open hands' },
      { emoji: '🤭', name: 'face with hand over mouth' },
      { emoji: '🤫', name: 'shushing face' },
      { emoji: '🤔', name: 'thinking face' },
      { emoji: '🤐', name: 'zipper-mouth face' },
      { emoji: '🤨', name: 'face with raised eyebrow' },
      { emoji: '😐', name: 'neutral face' },
      { emoji: '😑', name: 'expressionless face' },
      { emoji: '😶', name: 'face without mouth' },
      { emoji: '😏', name: 'smirking face' },
      { emoji: '😒', name: 'unamused face' },
      { emoji: '🙄', name: 'face with rolling eyes' },
      { emoji: '😬', name: 'grimacing face' },
      { emoji: '🤥', name: 'lying face' },
      { emoji: '😌', name: 'relieved face' },
      { emoji: '😔', name: 'pensive face' },
      { emoji: '😪', name: 'sleepy face' },
      { emoji: '🤤', name: 'drooling face' },
      { emoji: '😴', name: 'sleeping face' },
      { emoji: '😷', name: 'face with medical mask' },
      { emoji: '🤒', name: 'face with thermometer' },
      { emoji: '🤕', name: 'face with head-bandage' },
      { emoji: '🤢', name: 'nauseated face' },
      { emoji: '🤮', name: 'face vomiting' },
      { emoji: '🤧', name: 'sneezing face' },
      { emoji: '🥵', name: 'hot face' },
      { emoji: '🥶', name: 'cold face' },
      { emoji: '🥴', name: 'woozy face' },
      { emoji: '😵', name: 'knocked-out face' },
      { emoji: '🤯', name: 'exploding head' },
      { emoji: '🤠', name: 'cowboy hat face' },
      { emoji: '🥳', name: 'partying face' },
      { emoji: '😎', name: 'smiling face with sunglasses' },
      { emoji: '🤓', name: 'nerd face' },
      { emoji: '🧐', name: 'face with monocle' },
      { emoji: '😕', name: 'confused face' },
      { emoji: '😟', name: 'worried face' },
      { emoji: '🙁', name: 'slightly frowning face' },
      { emoji: '😮', name: 'face with open mouth' },
      { emoji: '😲', name: 'astonished face' },
      { emoji: '😳', name: 'flushed face' },
      { emoji: '🥺', name: 'pleading face' },
      { emoji: '😦', name: 'frowning face with open mouth' },
      { emoji: '😨', name: 'fearful face' },
      { emoji: '😰', name: 'anxious face with sweat' },
      { emoji: '😥', name: 'sad but relieved face' },
      { emoji: '😢', name: 'crying face' },
      { emoji: '😭', name: 'loudly crying face' },
      { emoji: '😱', name: 'face screaming in fear' },
      { emoji: '😖', name: 'confounded face' },
      { emoji: '😞', name: 'disappointed face' },
      { emoji: '😓', name: 'downcast face with sweat' },
      { emoji: '😩', name: 'weary face' },
      { emoji: '😤', name: 'face with steam from nose' },
      { emoji: '😡', name: 'enraged face' },
      { emoji: '😠', name: 'angry face' },
      { emoji: '🤬', name: 'face with symbols on mouth' },
      { emoji: '😈', name: 'smiling face with horns' },
      { emoji: '👿', name: 'angry face with horns' },
      { emoji: '💀', name: 'skull' },
      { emoji: '💩', name: 'pile of poo' },
      { emoji: '🤡', name: 'clown face' },
      { emoji: '👻', name: 'ghost' },
      { emoji: '👽', name: 'alien' },
      { emoji: '🤖', name: 'robot' },
    ],
  },
  {
    id: 'people',
    name: 'Gestures & People',
    icon: <ThumbsUp size={16} />,
    emojis: [
      { emoji: '👋', name: 'waving hand' },
      { emoji: '🤚', name: 'raised back of hand' },
      { emoji: '🖐️', name: 'hand with fingers splayed' },
      { emoji: '✋', name: 'raised hand' },
      { emoji: '🖖', name: 'vulcan salute' },
      { emoji: '👌', name: 'OK hand' },
      { emoji: '🤌', name: 'pinched fingers' },
      { emoji: '🤏', name: 'pinching hand' },
      { emoji: '✌️', name: 'victory hand' },
      { emoji: '🤞', name: 'crossed fingers' },
      { emoji: '🤟', name: 'love-you gesture' },
      { emoji: '🤘', name: 'sign of the horns' },
      { emoji: '🤙', name: 'call me hand' },
      { emoji: '👈', name: 'backhand index pointing left' },
      { emoji: '👉', name: 'backhand index pointing right' },
      { emoji: '👆', name: 'backhand index pointing up' },
      { emoji: '👇', name: 'backhand index pointing down' },
      { emoji: '☝️', name: 'index pointing up' },
      { emoji: '👍', name: 'thumbs up' },
      { emoji: '👎', name: 'thumbs down' },
      { emoji: '✊', name: 'raised fist' },
      { emoji: '👊', name: 'oncoming fist' },
      { emoji: '🤛', name: 'left-facing fist' },
      { emoji: '🤜', name: 'right-facing fist' },
      { emoji: '👏', name: 'clapping hands' },
      { emoji: '🙌', name: 'raising hands' },
      { emoji: '👐', name: 'open hands' },
      { emoji: '🤲', name: 'palms up together' },
      { emoji: '🤝', name: 'handshake' },
      { emoji: '🙏', name: 'folded hands' },
      { emoji: '✍️', name: 'writing hand' },
      { emoji: '💪', name: 'flexed biceps' },
      { emoji: '🧠', name: 'brain' },
      { emoji: '👀', name: 'eyes' },
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Symbols',
    icon: <Heart size={16} />,
    emojis: [
      { emoji: '❤️', name: 'red heart' },
      { emoji: '🧡', name: 'orange heart' },
      { emoji: '💛', name: 'yellow heart' },
      { emoji: '💚', name: 'green heart' },
      { emoji: '💙', name: 'blue heart' },
      { emoji: '💜', name: 'purple heart' },
      { emoji: '🤎', name: 'brown heart' },
      { emoji: '🖤', name: 'black heart' },
      { emoji: '🤍', name: 'white heart' },
      { emoji: '💔', name: 'broken heart' },
      { emoji: '❣️', name: 'heart exclamation' },
      { emoji: '💕', name: 'two hearts' },
      { emoji: '💞', name: 'revolving hearts' },
      { emoji: '💓', name: 'beating heart' },
      { emoji: '💗', name: 'growing heart' },
      { emoji: '💖', name: 'sparkling heart' },
      { emoji: '💘', name: 'heart with arrow' },
      { emoji: '💝', name: 'heart with ribbon' },
      { emoji: '💯', name: 'hundred points' },
      { emoji: '✨', name: 'sparkles' },
      { emoji: '🔥', name: 'fire' },
      { emoji: '💥', name: 'collision' },
      { emoji: '⭐', name: 'star' },
      { emoji: '🌟', name: 'glowing star' },
      { emoji: '⚡', name: 'high voltage' },
      { emoji: '🎉', name: 'party popper' },
      { emoji: '🎊', name: 'confetti ball' },
      { emoji: '🚀', name: 'rocket' },
      { emoji: '🎯', name: 'bullseye' },
    ],
  },
  {
    id: 'objects',
    name: 'Food & Objects',
    icon: <Coffee size={16} />,
    emojis: [
      { emoji: '☕', name: 'hot beverage' },
      { emoji: '🍵', name: 'teacup' },
      { emoji: '🍕', name: 'pizza' },
      { emoji: '🍔', name: 'hamburger' },
      { emoji: '🍟', name: 'french fries' },
      { emoji: '🍰', name: 'shortcake' },
      { emoji: '🎂', name: 'birthday cake' },
      { emoji: '🍻', name: 'clinking beer mugs' },
      { emoji: '🥂', name: 'clinking glasses' },
      { emoji: '📱', name: 'mobile phone' },
      { emoji: '💻', name: 'laptop' },
      { emoji: '💡', name: 'light bulb' },
      { emoji: '🔑', name: 'key' },
      { emoji: '🔒', name: 'locked' },
      { emoji: '🔔', name: 'bell' },
      { emoji: '📌', name: 'pushpin' },
      { emoji: '🎁', name: 'wrapped gift' },
      { emoji: '🏆', name: 'trophy' },
      { emoji: '🎵', name: 'musical note' },
      { emoji: '🎶', name: 'musical notes' },
    ],
  },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji }) => {
  const [activeTab, setActiveTab] = useState<string>('smileys');
  const [search, setSearch] = useState<string>('');

  const filteredEmojis = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      const cat = EMOJI_CATEGORIES.find((c) => c.id === activeTab);
      return cat ? cat.emojis : [];
    }

    const matched: { emoji: string; name: string }[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if (e.name.includes(q)) {
          matched.push(e);
        }
      }
    }
    return matched;
  }, [search, activeTab]);

  return (
    <div className="emoji-picker-popup" onClick={(e) => e.stopPropagation()}>
      {/* Search Input */}
      <div className="emoji-picker-search-bar">
        <Search size={14} className="emoji-search-icon" />
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="emoji-search-input"
          autoFocus
        />
        {search && (
          <button
            type="button"
            className="emoji-search-clear"
            onClick={() => setSearch('')}
          >
            ×
          </button>
        )}
      </div>

      {/* Category Tabs (only when not searching) */}
      {!search && (
        <div className="emoji-picker-tabs">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`emoji-tab-btn ${activeTab === cat.id ? 'active' : ''}`}
              onClick={() => setActiveTab(cat.id)}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="emoji-picker-grid">
        {filteredEmojis.length === 0 ? (
          <div className="emoji-picker-empty">No emojis found</div>
        ) : (
          filteredEmojis.map((e, idx) => (
            <button
              key={idx}
              type="button"
              className="emoji-btn"
              onClick={() => onSelectEmoji(e.emoji)}
              title={e.name}
            >
              {e.emoji}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default EmojiPicker;
