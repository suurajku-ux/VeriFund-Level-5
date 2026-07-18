/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0B0F19',
          card: '#161F30',
          accent: '#3B82F6',
          teal: '#14B8A6',
          rose: '#F43F5E',
        }
      }
    },
  },
  plugins: [],
}
