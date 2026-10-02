import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['branding/sp-stick-logo.jpg'],
      manifest: {
        name: 'SP Stick',
        short_name: 'SP Stick',
        description: 'Controller-first sports scouting application',
        theme_color: '#0B0D10',
        background_color: '#0B0D10',
        display: 'standalone',
        icons: [
          {
            src: 'branding/sp-stick-logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'branding/sp-stick-logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    })
  ]
});
