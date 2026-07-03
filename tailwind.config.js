/** @type {import('tailwindcss').Config} */
export default {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#16150f',
        paper: '#fdfcfa',
        line: '#e7e4de',
        stone: {
          450: '#8a867e',
        },
      },
      letterSpacing: {
        widest2: '0.2em',
      },
    },
  },
  plugins: [],
}
