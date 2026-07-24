import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const siteAnalytics = {
  name: "firststep-site-analytics",
  transformIndexHtml(html) {
    if (html.includes('src="/src/site-analytics.js"')) return html;
    return html.replace(
      "</body>",
      '  <script type="module" src="/src/site-analytics.js"></script>\n</body>'
    );
  },
};

export default defineConfig({
  plugins: [react(), siteAnalytics],
  optimizeDeps: {
    entries: ["index.html"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        book: "book/index.html",
        bookingConfirmed: "book/confirmed/index.html",
        fitCheck: "fit-check/index.html",
        outgrownWebsiteCampaign: "campaigns/outgrown-website/index.html",
        appIdeaViabilityChecker: "app-idea-viability-checker.html",
        adminStudio: "admin/index.html",
        startupLaunchChecker: "startup-launch-checker/index.html",
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
