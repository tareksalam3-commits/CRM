/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0B6B2E',
          light: '#2E9E52',
          dark: '#085424',
        },
        secondary: '#2E9E52',
        background: '#F8FAFC',
        card: '#FFFFFF',
        text: {
          DEFAULT: '#111827',
          muted: '#6B7280',
        },
        success: '#00B050',
        warning: '#FFC000',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'crm': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'crm-lg': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
};
