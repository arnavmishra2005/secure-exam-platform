import type { Config } from 'tailwindcss';

// Playground only. A host app must add this package's src/ to its own
// Tailwind `content` globs, e.g. '../../packages/exam-content-ui/src/**/*.{ts,tsx}'.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', './playground/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
