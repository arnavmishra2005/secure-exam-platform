import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      '@secure-exam/types': resolve(__dirname, '../../../packages/types/src/index.ts'),
      '@secure-exam/api-client': resolve(__dirname, '../../../packages/api-client/src/index.ts'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
