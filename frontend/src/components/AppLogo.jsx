import React from 'react';

export const AppLogo = ({ size = 32, className = '' }) => (
  <svg
    viewBox="0 0 512 512"
    width={size}
    height={size}
    className={`app-brand-logo ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="LetUsChat logo"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
  >
    <defs>
      <linearGradient id="appLogoGreen" x1="10%" y1="10%" x2="90%" y2="90%">
        <stop offset="0%" stopColor="#4ADE80" />
        <stop offset="30%" stopColor="#22C55E" />
        <stop offset="80%" stopColor="#16A34A" />
        <stop offset="100%" stopColor="#15803D" />
      </linearGradient>

      <linearGradient id="appLogoTeal" x1="20%" y1="10%" x2="80%" y2="90%">
        <stop offset="0%" stopColor="#2DD4BF" />
        <stop offset="35%" stopColor="#0D9488" />
        <stop offset="75%" stopColor="#0F766E" />
        <stop offset="100%" stopColor="#0891B2" />
      </linearGradient>

      <filter id="appLogoShadow" x="-15%" y="-15%" width="130%" height="135%" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#064E3B" floodOpacity="0.32" />
      </filter>
    </defs>

    {/* 1. Teal Secondary Underneath Speech Bubble */}
    <path
      d="M 320 180
         C 400 180 465 235 465 315
         C 465 365 435 408 395 432
         C 404 456 418 478 436 490
         C 408 488 368 472 342 448
         C 305 460 264 456 230 442
         C 265 418 288 380 298 335
         C 308 275 305 215 320 180 Z"
      fill="url(#appLogoTeal)"
    />

    {/* 2. Green Primary Speech Bubble */}
    <path
      d="M 230 80
         C 345 80 425 155 425 255
         C 425 305 400 350 358 385
         C 335 404 302 420 265 428
         C 220 438 174 432 138 416
         C 106 438 64 456 32 462
         C 46 434 56 402 56 374
         C 34 340 20 298 20 255
         C 20 155 105 80 230 80 Z"
      fill="url(#appLogoGreen)"
    />

    {/* 3. Top-Right Sparkles */}
    <rect x="424" y="96" width="13" height="34" rx="6.5" transform="rotate(38 430 113)" fill="#4ADE80" />
    <rect x="460" y="130" width="10" height="24" rx="5" transform="rotate(38 465 142)" fill="#4ADE80" />

    {/* 4. Central Crisp White Speech Bubble */}
    <g filter="url(#appLogoShadow)">
      <path
        d="M 215 170
           C 295 170 355 215 355 275
           C 355 335 295 380 215 380
           C 190 380 168 375 146 365
           C 120 384 88 398 60 404
           C 74 380 80 356 80 338
           C 65 320 55 298 55 275
           C 55 215 125 170 215 170 Z"
        fill="#FFFFFF"
      />
    </g>

    {/* 5. Three Dark Teal Dots */}
    <circle cx="160" cy="275" r="14.5" fill="#0F4C4A" />
    <circle cx="215" cy="275" r="14.5" fill="#0F4C4A" />
    <circle cx="270" cy="275" r="14.5" fill="#0F4C4A" />
  </svg>
);

export default AppLogo;
