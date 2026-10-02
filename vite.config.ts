import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'branding/sp-stick-logo.jpg',
        'branding/pwa-192.png',
        'branding/pwa-512.png',
        'branding/pwa-maskable-512.png'
      ],
      manifest: {
        name: 'SP Stick',
        short_name: 'SP Stick',
        description: 'Controller-first sports scouting application',
        theme_color: '#0B0D10',
        background_color: '#0B0D10',
        display: 'standalone',
        icons: [
          {
            src: 'branding/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'branding/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'branding/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
});
