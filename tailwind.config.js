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
          dark: '#1A1812',
          dark2: '#221E16',
          dark3: '#2A2520',
        },
        surface: {
          DEFAULT: '#FAF6EF',
          2: '#F2EDE4',
          dark: '#221E16',
          dark2: '#2A2520',
        },
        ink: {
          DEFAULT: '#1A1A18',
          2: '#4A4840',
          3: '#8A8478',
          dark: '#EDE8DF',
          dark2: '#B8B0A0',
          dark3: '#706860',
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
          dark: '#3A3428',
          dark2: '#2A2520',
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
