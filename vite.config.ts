import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  envPrefix: ['VITE_', 'INITIA_', 'VEIL_'],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
