import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
          light: '#F3F4F6',
        },
        // Question state specific colors for clear visual status
        palette: {
          notVisited: '#E5E7EB',      // gray-200
          visited: '#F97316',         // orange-500
          answered: '#10B981',        // emerald-500
          review: '#6366F1',          // indigo-500
          answeredReview: '#8B5CF6',  // violet-500
        },
      },
      fontFamily: {
        serif: [
          'Iowan Old Style',
          'Georgia',
          'serif',
        ],
        sans: [
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
