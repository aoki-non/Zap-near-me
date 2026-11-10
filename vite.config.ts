import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// host:true so Nimiq Pay on your phone can reach the dev server over LAN.
// See https://nimiq.dev/mini-apps/development/load-local-mini-app
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true,
  },
})
