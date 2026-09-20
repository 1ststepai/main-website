import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const siteAnalytics = {
  name: "firststep-site-analytics",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      if (html.includes('name="firststep-no-site-analytics"')) return html;
      if (html.includes('src="/src/site-analytics.js"')) return html;
      return html.replace(
        "</body>",
        '  <script type="module" src="/src/site-analytics.js"></script>\n</body>'
      );
    },
  },
};

function serveExactIndexPaths(server) {
  const routes = ["/os", "/tools"];
  server.middlewares.use((request, _response, next) => {
    const url = request.url || "";
    const path = url.split("?")[0];
    if (routes.includes(path)) {
      request.url = url.replace(path, `${path}/index.html`);
    }
    next();
  });
}

export default defineConfig({
  plugins: [react(), siteAnalytics, {
    name: "firststep-exact-index-paths",
    configureServer: serveExactIndexPaths,
    configurePreviewServer: serveExactIndexPaths,
  }],
  optimizeDeps: {
    entries: ["index.html"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        os: "os/index.html",
        journey: "journey/index.html",
        book: "book/index.html",
        bookingConfirmed: "book/confirmed/index.html",
        fitCheck: "fit-check/index.html",
        outgrownWebsiteCampaign: "campaigns/outgrown-website/index.html",
        morrisCountyFreeWebsiteCampaign: "campaigns/morris-county-free-website/index.html",
        appIdeaViabilityChecker: "app-idea-viability-checker.html",
        adminStudio: "admin/index.html",
        startupLaunchChecker: "startup-launch-checker/index.html",
        tools: "tools/index.html",
        autoModelRouter: "tools/auto-model-router/index.html",
        appBuilds: "services/app-builds.html",
        mvpBuilds: "services/mvp-builds.html",
        websites: "services/websites.html",
        revenueSystems: "services/revenue-systems.html",
        internalTools: "services/internal-tools.html",
        privacy: "privacy.html",
        terms: "terms.html",
      },
    },
  },
});
