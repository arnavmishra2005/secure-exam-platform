import type { Config } from 'tailwindcss';

// Playground only. A host app must add this package's src/ to its own
// Tailwind `content` globs, e.g. '../../packages/exam-content-ui/src/**/*.{ts,tsx}'.
//
// The package styles itself with the host's theme tokens (bg-card, text-foreground,
// bg-primary, ...), the same names apps/web defines. The playground mirrors them
// here (values in playground/index.css) so the components look the same standalone.
const token = (name: string) => `hsl(var(--${name}))`;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', './playground/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        brick: { light: 'hsl(7 52% 90%)' },
        gold: { light: 'hsl(39 58% 87%)' },
      },
    },
  },
  plugins: [],
};

export default config;
