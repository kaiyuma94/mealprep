/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { 50: '#fcf9f4', 100: '#f7f1e8', 200: '#efe4d3', 300: '#e2d0b6' },
        ink: { 900: '#2a2420', 700: '#4a403a', 500: '#7a6d64', 300: '#b3a79d' },
        herb: { 50: '#eef4ea', 100: '#dbe8d3', 500: '#5b7f4a', 600: '#4a6b3b', 700: '#3a552e' },
        tomato: { 50: '#fdf0ec', 500: '#d4583a', 600: '#b94529' },
        saffron: { 100: '#fbefcf', 500: '#e0a526' },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(42,36,32,0.04), 0 6px 20px -8px rgba(42,36,32,0.12)',
        lift: '0 10px 30px -10px rgba(42,36,32,0.25)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1)' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: { pop: 'pop 280ms ease-out', rise: 'rise 320ms ease-out both' },
    },
  },
  plugins: [],
};
