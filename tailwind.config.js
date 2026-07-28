/** @type {import('tailwindcss').Config} */
export default {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        // Headings used to be Playfair Display (serif); the "font-serif" /
        // ".heading-serif" class is kept everywhere it's already used, but
        // now resolves to the same bold geometric sans as body copy —
        // matches the RealHome-style reference (bold sans headings, no serif).
        serif: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#16150f',
        paper: '#fdfcfa',
        line: '#e7e4de',
        // Warm terracotta accent — pill badges ("Listings", "Features").
        accent: {
          50: '#fbf0ea',
          100: '#f6dece',
          400: '#e8b08f',
          500: '#dc9873',
          600: '#c07a54',
          // Text-safe shade for the .eyebrow pill (accent-600 on accent-100
          // is only 2.64:1 — fails WCAG AA for small text; this is 6.33:1).
          700: '#7a3f26',
        },
        // Warm off-white for cards/sections that need to read a shade darker than the page background (`paper`).
        surface: '#f5f2ee',
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
