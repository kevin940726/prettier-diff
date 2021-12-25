module.exports = {
  mode: 'jit',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        delete: 'var(--delete-lines-color)',
        insert: 'var(--insert-lines-color)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
