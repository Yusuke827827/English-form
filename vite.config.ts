/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages などのサブパスに置く場合は BASE=/repo-name/ を指定してビルドする
  base: process.env.BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '英文ラボ',
        short_name: '英文ラボ',
        description: '英文に S・V・O・C を振り、訳・単語帳・問題で読めるようにする / See English sentence structure, translate, and practice',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // 辞書（頭文字ごと、合わせて約 4.6MB）は、引いた文字だけを使ったときにキャッシュする
        globIgnores: ['tesseract/**', 'pdfjs/**', 'dict/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // 文字の読み取り（数 MB）と PDF の付属ファイルは、初めて使ったときにキャッシュする
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/') || url.pathname.includes('/pdfjs/') || url.pathname.includes('/dict/'),
            handler: 'CacheFirst',
            options: { cacheName: 'local-engines', expiration: { maxEntries: 400 } },
          },
          {
            // 文字の読み取りの学習データ（CDN から取得）
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('tesseract.js-data'),
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract-lang', expiration: { maxEntries: 6 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
