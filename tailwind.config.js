/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        smith: {
          950: '#09090b',
          900: '#18181b',
          850: '#202024',
          800: '#27272a',
          700: '#3f3f46',
          600: '#52525b',
          500: '#71717a',
          400: '#a1a1aa',
          300: '#d4d4d8',
          200: '#e4e4e7',
          100: '#f4f4f5',
          50: '#fafafa',
          accent: '#f4f4f5',
          border: '#27272a',
          muted: '#71717a'
        }
      }
    },
  },
  plugins: [],
}
