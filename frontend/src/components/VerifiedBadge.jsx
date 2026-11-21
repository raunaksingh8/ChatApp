import React from 'react';
import '../styles/Badges.css';

/**
 * VerifiedBadge — displays a green verification tick beside a display name.
 *
 * Usage:
 *   <VerifiedBadge isVerified={user.is_verified} size="sm" />
 *
 * Props:
 *   isVerified  {boolean}         — render nothing when false/undefined
 *   size        {"sm"|"md"|"lg"}  — icon scale (default "sm")
 *   className   {string}          — extra wrapper classes
 */
const VerifiedBadge = ({ isVerified, size = 'sm', className = '' }) => {
  if (!isVerified) return null;

  return (
    <span
      className={`verified-badge verified-badge--${size} ${className}`.trim()}
      title="Verified account"
      aria-label="Verified account"
      role="img"
    >
      <svg
        className="verified-badge__icon"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Filled shield / circle background */}
        <circle cx="10" cy="10" r="10" fill="currentColor" className="verified-badge__bg" />
        {/* White checkmark */}
        <path
          d="M6 10.5L8.5 13L14 7.5"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export default VerifiedBadge;
