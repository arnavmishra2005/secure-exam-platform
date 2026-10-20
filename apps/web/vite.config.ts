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
    },
  },
  server: {
    port: 3003,
  },
  preview: {
    port: 3003,
  },
  test: {
    environment: 'jsdom',
  },
});
