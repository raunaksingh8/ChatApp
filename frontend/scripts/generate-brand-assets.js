import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const iconsDir = path.resolve(publicDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// -------------------------------------------------------------
// 1. App Icon SVG (Squircle with Green-to-Teal Gradient)
// -------------------------------------------------------------
function getAppIconSvg({ size = 512, isMaskable = false } = {}) {
  const contentScale = isMaskable ? 0.72 : 1.0;
  const contentTranslate = isMaskable ? (512 * (1 - contentScale)) / 2 : 0;
  const bgRx = isMaskable ? 0 : 115;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <!-- Background Green-to-Teal Gradient -->
    <linearGradient id="bgGrad" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#34D399" />
      <stop offset="25%" stop-color="#22C55E" />
      <stop offset="65%" stop-color="#0D9488" />
      <stop offset="100%" stop-color="#0891B2" />
    </linearGradient>

    <!-- Secondary Depth Bubble Teal Gradient -->
    <linearGradient id="depthGrad" x1="20%" y1="20%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#0F766E" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#064E3B" stop-opacity="0.95" />
    </linearGradient>

    <!-- Soft Drop Shadow for White Bubble -->
    <filter id="softShadow" x="-15%" y="-15%" width="130%" height="135%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#064E3B" flood-opacity="0.38" />
    </filter>

    <!-- Soft Glow for Sparkles -->
    <filter id="whiteGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#FFFFFF" flood-opacity="0.5" />
    </filter>
  </defs>

  <!-- Base Rounded Container / Background -->
  <rect width="512" height="512" rx="${bgRx}" fill="url(#bgGrad)" />

  <!-- Inner Artwork Container (scaled if maskable) -->
  <g transform="translate(${contentTranslate}, ${contentTranslate}) scale(${contentScale})">

    <!-- Subtle darker teal bubble underneath right corner for 3D depth -->
    <path d="M 285 220
             C 365 210 425 255 425 325
             C 425 375 395 410 365 428
             C 375 448 388 465 402 475
             C 378 474 345 460 324 440
             C 292 448 258 444 230 435
             C 260 410 276 375 285 330
             C 292 285 290 240 285 220 Z"
          fill="url(#depthGrad)" />

    <!-- Two White Sparkle Rays at Top-Right -->
    <g filter="url(#whiteGlow)">
      <!-- Longer Ray -->
      <rect x="388" y="104" width="13" height="34" rx="6.5"
            transform="rotate(38 394 121)"
            fill="#FFFFFF" />
      <!-- Shorter Ray -->
      <rect x="424" y="136" width="10" height="24" rx="5"
            transform="rotate(38 429 148)"
            fill="#FFFFFF" opacity="0.95" />
    </g>

    <!-- Central White Speech Bubble with Smooth Dropshadow -->
    <g filter="url(#softShadow)">
      <path d="M 245 150
               C 335 150 405 200 405 268
               C 405 336 335 385 245 385
               C 218 385 192 380 168 370
               C 138 392 100 408 68 414
               C 84 388 92 362 92 342
               C 74 322 65 296 65 268
               C 65 200 145 150 245 150 Z"
            fill="#FFFFFF" />
    </g>

    <!-- Three Dark Slate-Teal Dots inside White Bubble -->
    <circle cx="185" cy="268" r="17" fill="#0F4C4A" />
    <circle cx="245" cy="268" r="17" fill="#0F4C4A" />
    <circle cx="305" cy="268" r="17" fill="#0F4C4A" />
  </g>
</svg>
`;
}

// -------------------------------------------------------------
// 2. Standalone Logo Mark SVG (Transparent Background)
// -------------------------------------------------------------
function getLogoMarkSvg(size = 512) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <!-- Green Gradient for Main Bubble -->
    <linearGradient id="mainGreen" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#4ADE80" />
      <stop offset="30%" stop-color="#22C55E" />
      <stop offset="80%" stop-color="#16A34A" />
      <stop offset="100%" stop-color="#15803D" />
    </linearGradient>

    <!-- Teal Gradient for Secondary Underneath Bubble -->
    <linearGradient id="secondTeal" x1="20%" y1="10%" x2="80%" y2="90%">
      <stop offset="0%" stop-color="#2DD4BF" />
      <stop offset="35%" stop-color="#0D9488" />
      <stop offset="75%" stop-color="#0F766E" />
      <stop offset="100%" stop-color="#0891B2" />
    </linearGradient>

    <!-- Drop Shadow for White Central Bubble -->
    <filter id="markWhiteShadow" x="-15%" y="-15%" width="130%" height="135%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#064E3B" flood-opacity="0.35" />
    </filter>

    <!-- Sparkle Glow -->
    <filter id="markSparkleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#22C55E" flood-opacity="0.4" />
    </filter>
  </defs>

  <!-- 1. Teal Secondary / Underneath Speech Bubble (points bottom-right) -->
  <path d="M 320 180
           C 400 180 465 235 465 315
           C 465 365 435 408 395 432
           C 404 456 418 478 436 490
           C 408 488 368 472 342 448
           C 305 460 264 456 230 442
           C 265 418 288 380 298 335
           C 308 275 305 215 320 180 Z"
        fill="url(#secondTeal)" />

  <!-- 2. Green Primary Speech Bubble (points bottom-left) -->
  <path d="M 230 80
           C 345 80 425 155 425 255
           C 425 305 400 350 358 385
           C 335 404 302 420 265 428
           C 220 438 174 432 138 416
           C 106 438 64 456 32 462
           C 46 434 56 402 56 374
           C 34 340 20 298 20 255
           C 20 155 105 80 230 80 Z"
        fill="url(#mainGreen)" />

  <!-- 3. Sparkles / Accents at Top-Right (3 Rays) -->
  <g filter="url(#markSparkleGlow)">
    <rect x="396" y="74" width="12" height="30" rx="6"
          transform="rotate(18 402 89)"
          fill="#4ADE80" />
    <rect x="430" y="104" width="12" height="32" rx="6"
          transform="rotate(48 436 120)"
          fill="#4ADE80" />
    <rect x="454" y="146" width="11" height="26" rx="5.5"
          transform="rotate(78 459 159)"
          fill="#4ADE80" />
  </g>

  <!-- 4. Central Crisp White Speech Bubble with Soft Drop Shadow -->
  <g filter="url(#markWhiteShadow)">
    <path d="M 215 170
             C 295 170 355 215 355 275
             C 355 335 295 380 215 380
             C 190 380 168 375 146 365
             C 120 384 88 398 60 404
             C 74 380 80 356 80 338
             C 65 320 55 298 55 275
             C 55 215 125 170 215 170 Z"
          fill="#FFFFFF" />
  </g>

  <!-- 5. Three Dark Teal Dots inside White Bubble -->
  <circle cx="160" cy="275" r="14.5" fill="#0F4C4A" />
  <circle cx="215" cy="275" r="14.5" fill="#0F4C4A" />
  <circle cx="270" cy="275" r="14.5" fill="#0F4C4A" />
</svg>
`;
}

// -------------------------------------------------------------
// 3. Full Logo SVG (Icon + "LetUsChat" + "Connect • Chat • Share")
// -------------------------------------------------------------
function getFullLogoSvg({ width = 1000, height = 300, darkMode = false } = {}) {
  const brandDarkColor = darkMode ? '#F8FAFC' : '#0F4C4A';
  const taglineColor = darkMode ? '#94A3B8' : '#475569';

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" width="${width}" height="${height}">
  <defs>
    <!-- Same Gradients as Logo Mark -->
    <linearGradient id="fullMainGreen" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#4ADE80" />
      <stop offset="30%" stop-color="#22C55E" />
      <stop offset="80%" stop-color="#16A34A" />
      <stop offset="100%" stop-color="#15803D" />
    </linearGradient>

    <linearGradient id="fullSecondTeal" x1="20%" y1="10%" x2="80%" y2="90%">
      <stop offset="0%" stop-color="#2DD4BF" />
      <stop offset="35%" stop-color="#0D9488" />
      <stop offset="75%" stop-color="#0F766E" />
      <stop offset="100%" stop-color="#0891B2" />
    </linearGradient>

    <filter id="fullWhiteShadow" x="-15%" y="-15%" width="130%" height="135%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#064E3B" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- Left Icon Group (scaled and positioned) -->
  <g transform="translate(30, 15) scale(0.54)">
    <!-- Teal Bubble -->
    <path d="M 320 180 C 400 180 465 235 465 315 C 465 365 435 408 395 432 C 404 456 418 478 436 490 C 408 488 368 472 342 448 C 305 460 264 456 230 442 C 265 418 288 380 298 335 C 308 275 305 215 320 180 Z" fill="url(#fullSecondTeal)" />

    <!-- Green Bubble -->
    <path d="M 230 80 C 345 80 425 155 425 255 C 425 305 400 350 358 385 C 335 404 302 420 265 428 C 220 438 174 432 138 416 C 106 438 64 456 32 462 C 46 434 56 402 56 374 C 34 340 20 298 20 255 C 20 155 105 80 230 80 Z" fill="url(#fullMainGreen)" />

    <!-- Sparkles -->
    <rect x="424" y="96" width="13" height="34" rx="6.5" transform="rotate(38 430 113)" fill="#4ADE80" />
    <rect x="460" y="130" width="10" height="24" rx="5" transform="rotate(38 465 142)" fill="#4ADE80" />

    <!-- White Bubble -->
    <g filter="url(#fullWhiteShadow)">
      <path d="M 215 170 C 295 170 355 215 355 275 C 355 335 295 380 215 380 C 190 380 168 375 146 365 C 120 384 88 398 60 404 C 74 380 80 356 80 338 C 65 320 55 298 55 275 C 55 215 125 170 215 170 Z" fill="#FFFFFF" />
    </g>

    <!-- 3 Dots -->
    <circle cx="160" cy="275" r="14.5" fill="#0F4C4A" />
    <circle cx="215" cy="275" r="14.5" fill="#0F4C4A" />
    <circle cx="270" cy="275" r="14.5" fill="#0F4C4A" />
  </g>

  <!-- Typography Right Side -->
  <!-- "LetUs" + "Chat" -->
  <text x="320" y="172" font-family="Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif" font-size="108" font-weight="800" letter-spacing="-2px">
    <tspan fill="${brandDarkColor}">LetUs</tspan><tspan fill="#00A86B">Chat</tspan>
  </text>

  <!-- Tagline: "Connect • Chat • Share" -->
  <text x="325" y="235" font-family="Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif" font-size="34" font-weight="600" letter-spacing="3px" fill="${taglineColor}">
    Connect <tspan fill="#0D9488">•</tspan> Chat <tspan fill="#0D9488">•</tspan> Share
  </text>
</svg>
`;
}

// -------------------------------------------------------------
// 4. Horizontal Navbar Logo SVG (Icon + "LetUsChat")
// -------------------------------------------------------------
function getNavbarLogoSvg({ height = 40, width = 160 } = {}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="${width}" height="${height}">
  <defs>
    <linearGradient id="navMainGreen" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#4ADE80" />
      <stop offset="40%" stop-color="#22C55E" />
      <stop offset="100%" stop-color="#15803D" />
    </linearGradient>

    <linearGradient id="navSecondTeal" x1="20%" y1="10%" x2="80%" y2="90%">
      <stop offset="0%" stop-color="#2DD4BF" />
      <stop offset="60%" stop-color="#0D9488" />
      <stop offset="100%" stop-color="#0891B2" />
    </linearGradient>
  </defs>

  <!-- Icon scaled -->
  <g transform="translate(10, -5) scale(0.24)">
    <path d="M 320 180 C 400 180 465 235 465 315 C 465 365 435 408 395 432 C 404 456 418 478 436 490 C 408 488 368 472 342 448 C 305 460 264 456 230 442 C 265 418 288 380 298 335 C 308 275 305 215 320 180 Z" fill="url(#navSecondTeal)" />
    <path d="M 230 80 C 345 80 425 155 425 255 C 425 305 400 350 358 385 C 335 404 302 420 265 428 C 220 438 174 432 138 416 C 106 438 64 456 32 462 C 46 434 56 402 56 374 C 34 340 20 298 20 255 C 20 155 105 80 230 80 Z" fill="url(#navMainGreen)" />
    <rect x="424" y="96" width="13" height="34" rx="6.5" transform="rotate(38 430 113)" fill="#4ADE80" />
    <rect x="460" y="130" width="10" height="24" rx="5" transform="rotate(38 465 142)" fill="#4ADE80" />
    <path d="M 215 170 C 295 170 355 215 355 275 C 355 335 295 380 215 380 C 190 380 168 375 146 365 C 120 384 88 398 60 404 C 74 380 80 356 80 338 C 65 320 55 298 55 275 C 55 215 125 170 215 170 Z" fill="#FFFFFF" />
    <circle cx="160" cy="275" r="14.5" fill="#0F4C4A" />
    <circle cx="215" cy="275" r="14.5" fill="#0F4C4A" />
    <circle cx="270" cy="275" r="14.5" fill="#0F4C4A" />
  </g>

  <!-- "LetUsChat" Text -->
  <text x="135" y="74" font-family="Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" letter-spacing="-1px">
    <tspan fill="currentColor">LetUs</tspan><tspan fill="#22C55E">Chat</tspan>
  </text>
</svg>
`;
}

// -------------------------------------------------------------
// 5. Android Notification Banner Image (720x360)
// -------------------------------------------------------------
function getNotificationBannerSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 360" width="720" height="360">
  <defs>
    <!-- Background Gradient Matching Approved Reference Banner -->
    <linearGradient id="bannerBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22C55E" />
      <stop offset="45%" stop-color="#10B981" />
      <stop offset="85%" stop-color="#0D9488" />
      <stop offset="100%" stop-color="#0F766E" />
    </linearGradient>

    <!-- White Bubble Drop Shadow -->
    <filter id="bannerShadow" x="-15%" y="-15%" width="130%" height="135%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#064E3B" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- Banner Rounded Card -->
  <rect width="720" height="360" rx="36" fill="url(#bannerBg)" />

  <!-- Left Side: White Speech Bubble Logo with 3 Teal Dots -->
  <g transform="translate(60, 45) scale(0.68)">
    <!-- Behind depth shadow -->
    <path d="M 285 220 C 365 210 425 255 425 325 C 425 375 395 410 365 428 C 375 448 388 465 402 475 C 378 474 345 460 324 440 C 292 448 258 444 230 435 C 260 410 276 375 285 330 C 292 285 290 240 285 220 Z" fill="#047857" opacity="0.6" />

    <!-- Sparkles -->
    <rect x="388" y="104" width="13" height="34" rx="6.5" transform="rotate(38 394 121)" fill="#FFFFFF" />
    <rect x="424" y="136" width="10" height="24" rx="5" transform="rotate(38 429 148)" fill="#FFFFFF" opacity="0.9" />

    <!-- White Bubble -->
    <g filter="url(#bannerShadow)">
      <path d="M 245 150 C 335 150 405 200 405 268 C 405 336 335 385 245 385 C 218 385 192 380 168 370 C 138 392 100 408 68 414 C 84 388 92 362 92 342 C 74 322 65 296 65 268 C 65 200 145 150 245 150 Z" fill="#FFFFFF" />
    </g>

    <!-- 3 Dots -->
    <circle cx="185" cy="268" r="17" fill="#0F4C4A" />
    <circle cx="245" cy="268" r="17" fill="#0F4C4A" />
    <circle cx="305" cy="268" r="17" fill="#0F4C4A" />
  </g>

  <!-- Right Side Text matching "Notification Image (Android)" -->
  <text x="360" y="172" font-family="Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="#FFFFFF" letter-spacing="-0.5px">
    LetUsChat
  </text>
  <text x="362" y="224" font-family="Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="rgba(255, 255, 255, 0.92)" letter-spacing="0.2px">
    You have a new message.
  </text>
</svg>
`;
}

// -------------------------------------------------------------
// 6. Monochrome Android Notification Badge (96x96)
// Pure white silhouette on transparent, with 3 cutout dots
// -------------------------------------------------------------
function getMonochromeBadgeSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <!-- Speech Bubble in Pure White with 3 Cutout Dots (evenodd fill rule) -->
  <path fill="#FFFFFF" fill-rule="evenodd" d="
    M 48 18
    C 67 18 82 30 82 45
    C 82 60 67 72 48 72
    C 42 72 36.5 70.8 31.5 68.6
    C 25 73.5 16.5 77 9.5 78.5
    C 13 72.8 14.8 67 14.8 62.5
    C 10.8 58 8.8 52.2 8.8 45
    C 8.8 30 23.8 18 48 18 Z

    M 34 45
    a 3.8 3.8 0 1 0 7.6 0
    a 3.8 3.8 0 1 0 -7.6 0 Z

    M 44.2 45
    a 3.8 3.8 0 1 0 7.6 0
    a 3.8 3.8 0 1 0 -7.6 0 Z

    M 54.4 45
    a 3.8 3.8 0 1 0 7.6 0
    a 3.8 3.8 0 1 0 -7.6 0 Z
  " />
</svg>
`;
}

// -------------------------------------------------------------
// Execution & File Generation
// -------------------------------------------------------------
async function run() {
  console.log('Generating vector SVGs and pixel-perfect PNG assets...');

  // 1. Generate SVGs
  const appIconSvg512 = getAppIconSvg({ size: 512, isMaskable: false });
  const appIconMaskableSvg512 = getAppIconSvg({ size: 512, isMaskable: true });
  const logoMarkSvg = getLogoMarkSvg(512);
  const fullLogoSvg = getFullLogoSvg();
  const navbarLogoSvg = getNavbarLogoSvg();
  const notificationBannerSvg = getNotificationBannerSvg();
  const monochromeBadgeSvg = getMonochromeBadgeSvg();

  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), appIconSvg512);
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), logoMarkSvg);
  fs.writeFileSync(path.join(publicDir, 'logo-full.svg'), fullLogoSvg);
  fs.writeFileSync(path.join(publicDir, 'logo-navbar.svg'), navbarLogoSvg);
  fs.writeFileSync(path.join(iconsDir, 'notification-badge.svg'), monochromeBadgeSvg);

  // Helper to render SVG to PNG file
  const renderPng = (svgStr, destPath, width, height) => {
    const resvg = new Resvg(svgStr, {
      fitTo: { mode: 'width', value: width }
    });
    const pngBuffer = resvg.render().asPng();
    fs.writeFileSync(destPath, pngBuffer);
    console.log(`Rendered: ${path.relative(rootDir, destPath)} (${width}x${height || width}) - ${pngBuffer.length} bytes`);
  };

  // 2. Render PWA App Icons
  renderPng(appIconSvg512, path.join(iconsDir, 'icon-512x512.png'), 512, 512);
  renderPng(appIconMaskableSvg512, path.join(iconsDir, 'icon-512x512-maskable.png'), 512, 512);
  renderPng(appIconSvg512, path.join(iconsDir, 'icon-192x192.png'), 192, 192);
  renderPng(appIconSvg512, path.join(iconsDir, 'apple-touch-icon-180x180.png'), 180, 180);

  // Root public copies for compatibility
  renderPng(appIconSvg512, path.join(publicDir, 'pwa-512x512.png'), 512, 512);
  renderPng(appIconSvg512, path.join(publicDir, 'pwa-192x192.png'), 192, 192);
  renderPng(appIconSvg512, path.join(publicDir, 'apple-touch-icon.png'), 180, 180);

  // Favicons
  renderPng(appIconSvg512, path.join(publicDir, 'favicon-32x32.png'), 32, 32);
  renderPng(appIconSvg512, path.join(publicDir, 'favicon-16x16.png'), 16, 16);

  // Notification Assets
  renderPng(appIconSvg512, path.join(iconsDir, 'notification-icon.png'), 192, 192);
  renderPng(monochromeBadgeSvg, path.join(iconsDir, 'notification-badge-96x96.png'), 96, 96);
  renderPng(notificationBannerSvg, path.join(iconsDir, 'notification-image.png'), 720, 360);

  // Standalone logo transparent PNGs
  renderPng(logoMarkSvg, path.join(publicDir, 'logo-512x512.png'), 512, 512);
  renderPng(fullLogoSvg, path.join(publicDir, 'logo-full.png'), 1000, 300);

  // Clean up any test file
  const testLogo = path.join(publicDir, 'test-logo.png');
  if (fs.existsSync(testLogo)) fs.unlinkSync(testLogo);

  console.log('All brand assets successfully generated!');
}

run().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
