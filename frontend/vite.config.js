import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icons/*.png'
      ],
      manifest: {
        name: 'PulseChat',
        short_name: 'PulseChat',
        description: 'Private, real-time messaging application.',
        theme_color: '#0B1120',
        background_color: '#0B1120',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['social', 'productivity', 'communication'],
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/apple-touch-icon-180x180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io/],
        runtimeCaching: [
          // 1. Critical Security: Never cache API endpoints (Network Only)
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly'
          },
          // 2. Critical Security: Never cache Socket.IO traffic (Network Only)
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/socket.io/'),
            handler: 'NetworkOnly'
          },
          // 3. Static assets & non-API Images (Stale-While-Revalidate)
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' && !url.pathname.startsWith('/api/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'pulsechat-static-images',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 Days
              }
            }
          },
          // 4. Web Fonts (Cache First)
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'pulsechat-web-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 Year
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});

