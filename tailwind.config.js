/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Background scale ────────────────────────────────────────────
        bg: {
          DEFAULT: '#F2EDE4',
          2: '#E8E1D5',
          3: '#DDD5C5',
          dark: '#1a1a1a',
          dark2: '#242424',
          dark3: '#272727',
        },
        // Elevated surfaces (modals, cards, sidebars)
        surface: {
          DEFAULT: '#FAF6EF',
          2: '#F2EDE4',
          dark: '#1c1c1c',
          dark2: '#272727',
        },
        // ── Foreground (text) scale ─────────────────────────────────────
        // ink = text color. 1/2/3 = high/medium/low emphasis.
        ink: {
          DEFAULT: '#1A1A18',
          2: '#4A4840',
          3: '#8A8478',
          dark: '#d4cfc9',
          dark2: '#888880',
          dark3: '#666666',
        },
        // ── Accent (foreground emphasis + tints only) ───────────────────
        // NOT a button background. See `primary` below for that.
        // Used as: text-accent for emphasis, bg-accent/10 for highlights.
        accent: {
          DEFAULT: '#1a1a18',      // light mode emphasis: near-black
          2: '#4a4840',
          dark: '#e4e4e4',          // dark mode emphasis: near-white
          dark2: '#cccccc',
        },
        // ── Primary (button backgrounds) ────────────────────────────────
        // Dark-first inversion pattern (à la Vercel):
        //   light mode → near-black button with near-white text
        //   dark mode  → warm off-white button with near-black text
        // Use via `.btn-primary` class — do NOT compose with text-white.
        primary: {
          DEFAULT: '#1a1a18',
          hover:   '#2a2a28',
          fg:      '#f0ece5',
          dark:    '#e8e4dd',
          'dark-hover': '#f5f1ea',
          'fg-dark':    '#1a1a1a',
        },
        // ── Borders ─────────────────────────────────────────────────────
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
      // ── Typography scale ──────────────────────────────────────────────
      // Named semantic sizes with matching line-height baked in.
      // Old text-xs/text-sm/etc still work (Tailwind defaults preserved).
      fontSize: {
        caption: ['11px', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        body:    ['13px', { lineHeight: '1.6' }],
        prose:   ['15px', { lineHeight: '1.65' }],
        heading: ['18px', { lineHeight: '1.3' }],
        display: ['24px', { lineHeight: '1.2' }],
      },
      // ── Radius scale ──────────────────────────────────────────────────
      // 3 semantic radii. Old rounded/rounded-md/rounded-lg still work.
      borderRadius: {
        soft: '4px',   // inputs, pills, tags
        base: '8px',   // buttons, cards, modals
        large: '12px', // overlays, main panels
      },
      // ── Motion tokens ─────────────────────────────────────────────────
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '250ms',
        'slow': '400ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scale-in 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slide-up 250ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
