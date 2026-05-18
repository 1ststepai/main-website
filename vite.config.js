import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        appIdeaViabilityChecker: "app-idea-viability-checker.html",
        appBuilds: "services/app-builds.html",
        mvpBuilds: "services/mvp-builds.html",
        websites: "services/websites.html",
        internalTools: "services/internal-tools.html",
        privacy: "privacy.html",
        terms: "terms.html",
      },
    },
  },
});
