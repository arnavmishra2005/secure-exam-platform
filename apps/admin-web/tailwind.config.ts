import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1C2333',
          light: '#2A3348',
          soft: '#3C4560',
        },
        paper: {
          DEFAULT: '#F6F5F1',
          raised: '#FCFBF8',
        },
        verdigris: {
          DEFAULT: '#2B6E64',
          dark: '#204F48',
          light: '#DCEAE7',
        },
        gold: {
          DEFAULT: '#B98B3E',
          light: '#F1E4CB',
        },
        brick: {
          DEFAULT: '#A83B32',
          light: '#F3DCD9',
        },
        hairline: '#DAD6CC',
        ash: {
          DEFAULT: '#22262B',
          muted: '#6B6459',
        },
      },
      fontFamily: {
        // Self-hosted-free system stacks so the build never depends on
        // fetching webfonts. Swap in next/font/google (Source Serif 4 +
        // IBM Plex Sans were the original picks) or self-hosted files once
        // the deploy environment has open network access — the CSS variable
        // shape below is ready for it (see app/layout.tsx).
        serif: [
          'var(--font-source-serif, ui-serif)',
          'Iowan Old Style',
          'Georgia',
          'serif',
        ],
        sans: [
          'var(--font-plex-sans, ui-sans-serif)',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
      },
      fontFeatureSettings: {
        tabular: '"tnum" 1',
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
