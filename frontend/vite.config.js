import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
            manifest: {
                name: 'LibraryAnywhere',
                short_name: 'Library',
                description: 'Sua biblioteca digital pessoal',
                theme_color: '#2563eb',
                background_color: '#f9fafb',
                display: 'standalone',
                start_url: '/',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
                ],
            },
            workbox: {
                // Cache das páginas do app
                navigateFallback: '/index.html',
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                // Não cachear chamadas à API
                navigateFallbackDenylist: [/^\/api/, /^\/documents/],
                runtimeCaching: [
                    {
                        // Capas dos livros — cache por 7 dias
                        urlPattern: /\/documents\/\d+\/cover/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'book-covers',
                            expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
                        },
                    },
                ],
            },
        }),
    ],
    server: {
        host: true,
        port: 5171,
        strictPort: true,
        allowedHosts: ['library.pxluthor.com.br'],
    },
})
