/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        blacktop: "#050505",
        panel: "#0A0C0F",
        steel: "#8B98A7",
        line: "rgba(255,255,255,0.12)",
        blue: "#00A3FF",
        go: "#39FF14",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 48px rgba(0, 163, 255, 0.22)",
        green: "0 0 42px rgba(57, 255, 20, 0.16)",
      },
      backgroundImage: {
        grid:
          "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
