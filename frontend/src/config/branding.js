/**
 * ==============================================================================
 * LetUsChat Dynamic Branding Configuration
 * ==============================================================================
 * 
 * Edit this file to change application branding for seasonal themes, festivals,
 * holidays, campaigns, or new releases.
 * 
 * QUICK WORKFLOW:
 * 1. Place your PNG image in `frontend/public/icons/`.
 * 2. Update the filename path below.
 * 3. Run `npm run build` (or push to GitHub to deploy).
 * 
 * The build system automatically validates file existence, ensures required
 * resolution variants, and updates the PWA manifest without editing vite.config.js.
 */

export const branding = {
  // PWA Home-Screen Launcher Icon (Maskable Adaptive Icon for Android home screen)
  launcherIcon: '/icons/letuschat-maskable-v118-512.png',

  // Native Android PWA Launch-Screen Splash Artwork (Center logo on white background)
  nativeSplashIcon: '/icons/letuschat-icon-v118-512.png',

  // Native Android APK / Trusted Web Activity (TWA) Icon (for standalone APK packaging)
  apkIcon: '/icons/letuschat-maskable-v118-512.png'
};

export default branding;
