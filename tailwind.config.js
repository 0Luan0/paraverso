/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#F2EDE4',
          2: '#E8E1D5',
          3: '#DDD5C5',
          dark: '#1a1a1a',
          dark2: '#242424',
          dark3: '#272727',
        },
        surface: {
          DEFAULT: '#FAF6EF',
          2: '#F2EDE4',
          dark: '#1c1c1c',
          dark2: '#272727',
        },
        ink: {
          DEFAULT: '#1A1A18',
          2: '#4A4840',
          3: '#8A8478',
          dark: '#d4cfc9',
          dark2: '#888880',
          dark3: '#666666',
        },
        accent: {
          DEFAULT: '#C17A3A',
          2: '#8B4A1A',
          dark: '#D4924A',
          dark2: '#E8B070',
        },
        bdr: {
          DEFAULT: '#C8BFA8',
          2: '#DDD5C5',
          dark: '#2a2a2a',
          dark2: '#242424',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
