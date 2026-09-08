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
          bg: 'var(--color-base-bg)',
          surface: 'var(--color-base-surface)',
          elevated: 'var(--color-base-elevated)',
          border: 'var(--color-base-border)'
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          soft: 'var(--color-accent-soft)'
        }
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(124, 92, 255, 0.35)'
      }
    }
  },
  plugins: []
}
