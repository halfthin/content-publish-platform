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
    port: 50001,
    proxy: {
      '/api/queue-proxy': {
        target: 'http://100.64.0.6:44200',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/queue-proxy/, '/api'),
      },
      '/api': {
        target: 'http://localhost:50000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:50000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
