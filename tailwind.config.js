/** TailwindCSS — утилитарные стили лендинга и дашборда. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          500: '#2b8cff',
          600: '#1f6fe0',
          900: '#0b1c33',
        },
      },
    },
  },
  plugins: [],
};
