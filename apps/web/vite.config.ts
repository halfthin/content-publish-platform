import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 50000,
    proxy: {
      '/api': {
        target: 'http://localhost:50001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:50001',
        ws: true,
      },
    },
  },
});
