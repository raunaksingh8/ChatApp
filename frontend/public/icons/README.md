# LetUsChat — Dynamic Branding Guide

This directory holds all icon and splash assets for LetUsChat. You can easily change branding images for seasonal themes, festivals, holidays, campaigns, or new releases.

---

## Central Configuration File

All active branding images are controlled in one single file:

`frontend/src/config/branding.js`

```javascript
export const branding = {
  // PWA Home-Screen Launcher Icon (Maskable Adaptive Icon for Android home screen)
  launcherIcon: '/icons/icon-512x512-maskable.png',

  // Native Android PWA Launch-Screen Splash Artwork (Center logo on white background)
  nativeSplashIcon: '/icons/letuschat-splash-v115-512.png',

  // Native Android APK / Trusted Web Activity (TWA) Application Icon
  apkIcon: '/icons/icon-512x512-maskable.png'
};
```

---

## How to Change Branding Images

### Scenario A: Change Only the Home-Screen Launcher Icon
1. Put your new icon image (e.g. `diwali-icon.png`, 512×512 PNG) in `frontend/public/icons/`.
2. In `frontend/src/config/branding.js`, edit line 1:
   ```javascript
   launcherIcon: '/icons/diwali-icon.png',
   ```
3. Run `npm run build` (or push to GitHub).
   *The build system will validate the file, auto-generate the 192×192 variant if needed, and update the PWA manifest.*

---

### Scenario B: Change Only the Android Native Splash Screen
1. Put your new splash artwork (e.g. `diwali-splash.png`, 512×512 PNG on white background) in `frontend/public/icons/`.
2. In `frontend/src/config/branding.js`, edit line 2:
   ```javascript
   nativeSplashIcon: '/icons/diwali-splash.png',
   ```
3. Run `npm run build` (or push to GitHub).

---

### Scenario C: Change Both Launcher and Splash Screen
1. Put both PNGs into `frontend/public/icons/`.
2. Update both lines in `frontend/src/config/branding.js`.
3. Run `npm run build` (or push to GitHub).

---

## Important Platform Details

### 1. Standard Chrome-Installed Android PWA (WebAPK)
* **Launcher Icon Selection:** Chrome WebAPK selects manifest icons declared with `purpose: "maskable"`. It maps this to `@mipmap/ic_launcher` in the compiled WebAPK.
* **Splash Icon Selection:** Chrome WebAPK selects manifest icons declared with `purpose: "any"`. It maps this to `@drawable/splash_icon` in the compiled WebAPK.
* **OEM Behavior:** On standard Android 12+ (Pixel, AOSP, Motorola), Android's window manager renders `windowSplashScreenAnimatedIcon` (`any`) on the splash screen and `@mipmap/ic_launcher` (`maskable`) on the home screen. On certain OEM skins (such as Samsung One UI or Xiaomi MIUI), the OS launcher may mirror the launcher icon during cold start.

### 2. Standalone Native Android APK / Trusted Web Activity (TWA)
When building a standalone Android APK using Android Studio or Bubblewrap:
* `apkIcon` indicates the source image for Android's resource generator.
* In Bubblewrap / TWA:
  - Copy `apkIcon` to `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`.
  - For adaptive icons, copy foreground to `mipmap-anydpi-v26/ic_launcher_foreground.xml`.
* In native Android `AndroidManifest.xml`:
  - `android:icon="@mipmap/ic_launcher"`
  - `android:roundIcon="@mipmap/ic_launcher_round"`
* In native Android `res/values-v31/styles.xml`:
  - `android:windowSplashScreenAnimatedIcon` maps to `@drawable/splash_icon` (derived from `nativeSplashIcon`).
