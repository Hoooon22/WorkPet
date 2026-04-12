/** @type {import('tailwindcss').Config} */
export default {
  // content script + popup 모두 커버
  content: [
    './src/**/*.{ts,tsx,html}',
  ],
  // 호스트 페이지와의 CSS 충돌 방지를 위해 prefix 사용
  prefix: 'wp-',
  theme: {
    extend: {
      colors: {
        orbit: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      borderRadius: {
        'orbit': '50%',
      },
      animation: {
        'float':  'float 3s ease-in-out infinite',
        'bounce-pet': 'bouncePet 0.4s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        bouncePet: {
          '0%':   { transform: 'translateY(0px)' },
          '100%': { transform: 'translateY(-16px)' },
        },
      },
    },
  },
  plugins: [],
}
