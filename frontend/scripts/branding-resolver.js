import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Validates branding configuration and generates/resolves manifest icons.
 * 
 * @param {string} publicDir - Absolute path to frontend/public
 * @param {object} branding - Branding configuration object from branding.js
 * @returns {Array<object>} Manifest icons array for vite-plugin-pwa
 */
export function resolveBrandingIcons(publicDir, branding) {
  if (!branding || typeof branding !== 'object') {
    throw new Error('\n[Branding Config Error] branding object is missing or invalid in frontend/src/config/branding.js.\n');
  }

  // 1. Validation helper
  const validateIcon = (key, iconPath) => {
    if (!iconPath || typeof iconPath !== 'string') {
      throw new Error(`\n[Branding Config Error] "${key}" is not defined or is not a string in frontend/src/config/branding.js.\n`);
    }
    const cleanPath = iconPath.replace(/^\//, '');
    const fullPath = path.resolve(publicDir, cleanPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `\n===============================================================================\n` +
        `[Branding Config Error] Missing Image File for "${key}"!\n` +
        `Configured Path: "${iconPath}"\n` +
        `Expected Location: "${fullPath}"\n\n` +
        `Action Required: Place the PNG image into frontend/public/icons/ or correct\n` +
        `the filename path in frontend/src/config/branding.js.\n` +
        `===============================================================================\n`
      );
    }
    return {
      key,
      cleanPath,
      fullPath,
      urlPath: '/' + cleanPath.replace(/\\/g, '/')
    };
  };

  const launcher = validateIcon('launcherIcon', branding.launcherIcon);
  const splash = validateIcon('nativeSplashIcon', branding.nativeSplashIcon);
  // apkIcon is validated to ensure readiness for APK/TWA workflows
  const apk = validateIcon('apkIcon', branding.apkIcon);

  // 2. Helper to find or auto-generate 192px resolution variant
  const resolve192Variant = (resolved) => {
    const ext = path.extname(resolved.cleanPath);
    const baseName = resolved.cleanPath.slice(0, -ext.length);

    // Common patterns for 192px companion:
    // 1) Replace 512x512 with 192x192 (e.g. icon-512x512-maskable.png -> icon-192x192-maskable.png)
    // 2) Replace 512 with 192 (e.g. letuschat-splash-v115-512.png -> letuschat-splash-v115-192.png)
    // 3) Append -192 (e.g. festival-icon.png -> festival-icon-192.png)
    const candidates = [
      baseName.replace(/512x512/, '192x192') + ext,
      baseName.replace(/512/, '192') + ext,
      baseName + '-192' + ext
    ];

    for (const c of candidates) {
      if (c !== resolved.cleanPath && fs.existsSync(path.resolve(publicDir, c))) {
        return '/' + c.replace(/\\/g, '/');
      }
    }

    const target192 = baseName.includes('512') ? baseName.replace(/512/, '192') + ext : baseName + '-192' + ext;
    const full192 = path.resolve(publicDir, target192);

    // Auto-generate 192x192 variant from 512px image using Python PIL
    try {
      const pythonCmd = `from PIL import Image; im = Image.open(r'''${resolved.fullPath}'''); im.resize((192, 192), Image.Resampling.LANCZOS).save(r'''${full192}''')`;
      execSync(`python -c "${pythonCmd}"`, { stdio: 'pipe' });
      if (fs.existsSync(full192)) {
        console.log(`[Branding] Auto-generated 192px icon variant: ${target192}`);
        return '/' + target192.replace(/\\/g, '/');
      }
    } catch {
      // Fallback
    }

    return resolved.urlPath;
  };

  const launcher192 = resolve192Variant(launcher);
  const splash192 = resolve192Variant(splash);

  console.log(`[Branding] Active Configuration:`);
  console.log(`  - Launcher Icon (maskable): ${launcher.urlPath} (192: ${launcher192})`);
  console.log(`  - Native Splash Icon (any): ${splash.urlPath} (192: ${splash192})`);
  console.log(`  - APK/TWA Icon:             ${apk.urlPath}`);

  // 3. Return independent manifest icon entries
  return [
    {
      src: splash192,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: splash.urlPath,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: launcher192,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable'
    },
    {
      src: launcher.urlPath,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ];
}
