import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4100',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:4100',
        ws: true
      }
    }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*']
});
