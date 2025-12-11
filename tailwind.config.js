/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./panel/**/*.{html,js,svelte}",
    "./panel.html"
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["dark", "light"],
  }
}
