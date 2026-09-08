/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        tajawal: ['Tajawal', 'sans-serif']
      },
      colors: {
        base: {
          bg: '#0B0D13',
          surface: '#12141C',
          elevated: '#181B26',
          border: '#242836'
        },
        accent: {
          DEFAULT: '#7C5CFF',
          soft: '#9B82FF'
        }
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(124, 92, 255, 0.35)'
      }
    }
  },
  plugins: []
}
