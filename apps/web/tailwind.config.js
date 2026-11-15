/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: { relative: true, files: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
  ] },
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Segoe UI"', '"Noto Sans"', 'sans-serif'],
      },
      colors: {
        tuition: {
          primary: '#3b5d86',
          secondary: '#eef2f8',
          accent: '#b96970',
          muted: '#6B7280',
          card: '#ffffff',
          background: '#f6f7fa',
          border: '#e1e6ee',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#F87171',
        },
        border: '#e1e6ee',
        muted: { 400: '#758095', 500: '#657187', 600: '#4b5a70' },
      },
    },
  },
  plugins: [],
};
