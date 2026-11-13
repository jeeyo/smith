/** @type {import('tailwindcss').Config} */

/*
 * Smith's palette: warm neutrals ("ink") for text, surfaces and lines, and six soft pastels
 * for meaning. Use 50/100 for fills, 200/300 for borders and pills, 600/700 for text on them.
 *   mint     done, ready, success      lav    primary actions, focus, selection
 *   sky      work in progress           butter  waiting, needs you, warnings
 *   peach    review, merge              rose    failures, destructive actions
 */
const ink = {
  0: '#FFFFFF',
  25: '#FCFBF8',
  50: '#F7F5F1',
  100: '#EFECE6',
  200: '#E3DFD7',
  300: '#CCC7BD',
  400: '#A29D93',
  500: '#7D786F',
  600: '#5E5A53',
  700: '#46433E',
  800: '#2F2D2A',
  900: '#1F1E1C'
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink,
        mint: { 50: '#F0FAF4', 100: '#DDF3E5', 200: '#C3E9D2', 300: '#A3DCBB', 400: '#7CC9A0', 500: '#56B183', 600: '#3B8E66', 700: '#2E6F50' },
        lav: { 50: '#F5F3FD', 100: '#ECE7FB', 200: '#DCD3F7', 300: '#C6B8F1', 400: '#A897E6', 500: '#8B76D8', 600: '#6F59C2', 700: '#5946A0' },
        sky: { 50: '#F0F7FD', 100: '#DFEEFA', 200: '#C5E0F6', 300: '#A3CDEF', 400: '#7DB6E5', 500: '#5B9BD3', 600: '#3F7EB6', 700: '#336692' },
        butter: { 50: '#FFFBEC', 100: '#FDF4CC', 200: '#FAE9A3', 300: '#F5DA74', 400: '#ECC94B', 500: '#D4AE2B', 600: '#A6851A', 700: '#7F6514' },
        peach: { 50: '#FFF5EF', 100: '#FDE8DC', 200: '#FAD4BF', 300: '#F5BB9B', 400: '#EE9E76', 500: '#E07F53', 600: '#BE6338', 700: '#984E2C' },
        rose: { 50: '#FEF3F5', 100: '#FCE3E8', 200: '#F8CBD5', 300: '#F2A9B9', 400: '#E98299', 500: '#D9617D', 600: '#B94561', 700: '#94374D' }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(31, 30, 28, 0.04), 0 4px 16px rgba(31, 30, 28, 0.05)',
        float: '0 12px 40px rgba(31, 30, 28, 0.12)'
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem'
      }
    }
  },
  plugins: []
};
