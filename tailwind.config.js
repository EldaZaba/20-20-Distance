/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0b0b0e',
        inkSoft: '#111218',
        glow: '#7bdff6',
        accent: '#fcb13d'
      }
    }
  },
  plugins: []
};
