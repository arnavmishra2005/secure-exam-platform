import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
  },
  resolve: {
    // Use the shared packages' TypeScript source: their dist/ builds are CommonJS.
    alias: {
      '@': resolve(__dirname, './src'),
      '@secure-exam/types': resolve(__dirname, '../../packages/types/src/index.ts'),
      '@secure-exam/api-client': resolve(__dirname, '../../packages/api-client/src/index.ts'),
      '@secure-exam/exam-content-ui': resolve(__dirname, '../../packages/exam-content-ui/src/index.ts'),
    },
  },
  server: {
    port: 3003,
  },
  preview: {
    port: 3003,
    // `npm run lan`: the built site and the API share one address, http://<laptop-ip>:3003, and
    // /api is passed to the API on this machine (which then listens on 127.0.0.1 only). xfwd adds
    // the client's address to X-Forwarded-For, so per-student login limits and logs keep working
    // (the API trusts exactly this one proxy: TRUST_PROXY_HOPS=1).
    proxy: {
      '^/api(/|$)': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/api/, '') || '/',
      },
    },
    // Laptops are also reachable as <name>.local on networks that allow it.
    allowedHosts: ['.local'],
  },
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
});
