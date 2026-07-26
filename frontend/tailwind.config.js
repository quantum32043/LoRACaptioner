/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontSize: {
      xs: ['0.875rem', { lineHeight: '1.125rem' }],
      sm: ['1rem', { lineHeight: '1.5rem' }],
      base: ['1.125rem', { lineHeight: '1.625rem' }],
      lg: ['1.25rem', { lineHeight: '1.75rem' }],
      xl: ['1.375rem', { lineHeight: '1.875rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
    },
    extend: {
      colors: {
        coal: {
          950: '#12100d',
          900: '#171411',
          850: '#1c1815',
          800: '#221d19',
          700: '#2e2822',
          600: '#3d352d',
          500: '#524739',
        },
        paper: {
          DEFAULT: '#ece5d8',
          muted: '#a99f90',
          faint: '#6f6557',
        },
        safe: '#f5a02c',
        cyano: '#5fc6d0',
        ember: '#e0604a',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'sans-serif'],
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};