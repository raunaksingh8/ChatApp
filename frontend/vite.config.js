import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const packageJson = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const APP_VERSION = process.env.VITE_APP_VERSION || packageJson.version || '1.0.2';
const BUILD_TIMESTAMP = new Date().toISOString();

let GIT_COMMIT_SHA = process.env.VITE_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '';
if (!GIT_COMMIT_SHA) {
  try {
    GIT_COMMIT_SHA = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    GIT_COMMIT_SHA = 'local';
  }
}

// Plugin to inject dynamic build version into public/version.json
function versionInjectorPlugin() {
  return {
    name: 'letuschat-version-injector',
    buildStart() {
      try {
        const publicDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'public');
        const versionFile = path.join(publicDir, 'version.json');
        const versionData = {
          version: APP_VERSION,
          buildTimestamp: BUILD_TIMESTAMP,
          commitSha: GIT_COMMIT_SHA
        };
        fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2) + '\n');
      } catch (err) {
        console.warn('[vite] Could not write public/version.json:', err.message);
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP),
    __GIT_COMMIT_SHA__: JSON.stringify(GIT_COMMIT_SHA),
  },
  plugins: [
    react(),
    versionInjectorPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.svg',
        'favicon-32x32.png',
        'favicon-16x16.png',
        'apple-touch-icon.png',
        'logo.svg',
        'logo-full.svg',
        'version.json',
        'icons/*.png'
      ],
      manifest: {
        id: '/',
        name: 'LetUsChat',
        short_name: 'LetUsChat',
        description: 'Private, real-time messaging application.',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['social', 'productivity', 'communication'],
        icons: [
          {
            src: '/icons/letuschat-splash-v115-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/letuschat-splash-v115-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});
