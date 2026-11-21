import React from 'react';
import { Code2 } from 'lucide-react';
import '../styles/Badges.css';

/**
 * ProfileBadge — displays a custom badge pill from `profile_badge` DB field.
 *
 * Usage:
 *   <ProfileBadge badge={user.profile_badge} accountRole={user.account_role} />
 *
 * Props:
 *   badge        {string|null}  — text from `profile_badge` column; renders nothing when null/empty
 *   accountRole  {string}       — value from `account_role` column; "owner" gets a code icon
 *   size         {"sm"|"md"}    — pill scale (default "sm")
 *   className    {string}       — extra wrapper classes
 */
const ProfileBadge = ({ badge, accountRole, size = 'sm', className = '' }) => {
  if (!badge) return null;

  const isOwner = accountRole === 'owner';

  return (
    <span
      className={`profile-badge profile-badge--${size} ${className}`.trim()}
      title={badge}
      aria-label={`Badge: ${badge}`}
    >
      {isOwner && (
        <Code2
          className="profile-badge__icon"
          aria-hidden="true"
        />
      )}
      <span className="profile-badge__text">{badge}</span>
    </span>
  );
};

export default ProfileBadge;
