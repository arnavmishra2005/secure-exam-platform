/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Used for the playground (npm run dev) and tests only. Host apps consume
// src/ directly and need the same two aliases (shared packages' dist/ is CommonJS).
export default defineConfig({
  plugins: [react()],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@secure-exam/types': resolve(__dirname, '../types/src/index.ts'),
      '@secure-exam/api-client': resolve(__dirname, '../api-client/src/index.ts'),
    },
  },
  server: {
    port: 3005,
    // Real-API mode in the playground: same-origin calls, so no CORS change on the API.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.test.{ts,tsx}'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
