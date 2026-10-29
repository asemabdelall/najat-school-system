import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME = '#004d72';
const BACKGROUND = '#f3f7fa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The user decides when to switch to a new version (no surprise reloads
      // mid-attendance); PwaPrompts shows the "update available" card.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['brand/*.png'],
      manifest: {
        id: '/',
        name: 'نظام النجاة المدرسي — ثانوية النجاة بنين – حولي',
        short_name: 'النجاة',
        description: 'إدارة الحضور والغياب والسلوك والمتابعة لثانوية النجاة بنين – حولي',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME,
        background_color: BACKGROUND,
        categories: ['education', 'productivity'],
        icons: [
          { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/brand/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'رصد الحضور', short_name: 'الحضور', url: '/attendance/take?source=shortcut', icons: [{ src: '/brand/shortcut-attendance.png', sizes: '96x96' }] },
          { name: 'رفع بلاغ سلوكي', short_name: 'بلاغ', url: '/behavior/new?source=shortcut', icons: [{ src: '/brand/shortcut-behavior.png', sizes: '96x96' }] },
          { name: 'مهام المتابعة', short_name: 'المتابعة', url: '/follow-ups?source=shortcut', icons: [{ src: '/brand/shortcut-followups.png', sizes: '96x96' }] },
          { name: 'الطلاب', short_name: 'الطلاب', url: '/students?source=shortcut', icons: [{ src: '/brand/shortcut-students.png', sizes: '96x96' }] },
        ],
        screenshots: [
          { src: '/brand/screenshot-wide.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'لوحة التحكم' },
          { src: '/brand/screenshot-mobile.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'رصد الحضور من الجوال' },
        ],
      },
      workbox: {
        // App shell only. Supabase (another origin) is never cached, so
        // student records are not stored on shared school devices.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        globIgnores: ['**/screenshot-*.png', '**/splash-*.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(assets|brand)\//, /\.[a-z0-9]+$/i],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Explicit: API and auth traffic always goes to the network.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') || url.port === '54321',
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          return undefined;
        },
      },
    },
  },
});
