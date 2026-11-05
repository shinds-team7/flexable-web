import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 로컬 개발: /api 요청을 로컬 웹 백엔드(backend/, 8080)로 넘겨 CORS 없이 붙는다.
// `npm run dev:mock`(--mode mock)이면 계약 목 서버(`npm run mock:api`, Prism 4010)로 넘긴다. Prism은 /api/v1 없이 경로를 받는다.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // 진입 JS 파일 이름 형식. 2026-11-05 Cloudflare가 옛 index-*.js의 끊긴 사본을 캐시해 새 URL로 피하려고 바꿨다.
  build: { rollupOptions: { output: { entryFileNames: 'assets/app-[hash].js' } } },
  server: {
    port: 5173,
    proxy: {
      '/api':
        mode === 'mock'
          ? { target: 'http://127.0.0.1:4010', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/v1/, '') }
          : { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
}));
