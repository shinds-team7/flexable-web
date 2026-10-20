import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 로컬 개발: /api 요청을 로컬 웹 백엔드(backend/, 8080)로 넘겨 CORS 없이 붙는다.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8080', changeOrigin: true } },
  },
});
