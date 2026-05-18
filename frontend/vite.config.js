import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: 5171,
        strictPort: true,
        allowedHosts: ['library.pxluthor.com.br'],
    },
})
