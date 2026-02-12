import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './services/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: {
          950: '#022c22'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
