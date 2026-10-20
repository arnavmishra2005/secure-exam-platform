import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// shadcn/ui token layout; the values (src/index.css) are the project's
// "Examination Register" palette: ink, paper, verdigris, brick, gold.
const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
        },
        // Legacy palette names used by the exam-taking screens moved from
        // apps/exam-client, mapped onto the kit's tokens so they share the theme.
        paper: { DEFAULT: 'hsl(var(--background))', raised: 'hsl(var(--card))' },
        ink: { DEFAULT: 'hsl(var(--foreground))', light: 'hsl(var(--sidebar-accent))', soft: 'hsl(var(--muted-foreground))' },
        verdigris: { DEFAULT: 'hsl(var(--primary))', dark: 'hsl(var(--accent-foreground))', light: 'hsl(var(--accent))' },
        gold: { DEFAULT: 'hsl(var(--warning))', light: 'hsl(39 58% 87%)' },
        brick: { DEFAULT: 'hsl(var(--destructive))', light: 'hsl(7 52% 90%)' },
        hairline: 'hsl(var(--border))',
        ash: { DEFAULT: 'hsl(var(--foreground))', muted: 'hsl(var(--muted-foreground))', light: 'hsl(var(--muted))' },
        // Question palette states in the exam screen.
        palette: {
          notVisited: 'hsl(var(--muted))',
          visited: 'hsl(var(--warning))',
          answered: 'hsl(var(--success))',
          review: 'hsl(var(--review))',
          answeredReview: 'hsl(var(--review-answered))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
    },
  },
  plugins: [animate],
};

export default config;
