import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const motion = {
  name: "firststep-motion",
  transformIndexHtml: {
    order: "pre",
    handler(html, ctx) {
      const file = `${ctx?.path || ""} ${ctx?.filename || ""}`;
      if (file.includes("/admin/") || file.includes("\\admin\\")) return html;
      if (html.includes('name="firststep-no-motion"')) return html;
      if (!html.includes('data-fsai-motion')) {
        html = html.replace(
          "</head>",
          '  <link rel="stylesheet" href="/src/motion.css" />\n  <script data-fsai-motion>try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("motion")}catch(e){}</script>\n</head>'
        );
      }
      if (!html.includes('src="/src/motion.js"')) {
        html = html.replace("</body>", '  <script type="module" src="/src/motion.js"></script>\n</body>');
      }
      return html;
    },
  },
};

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
  const routes = ["/os", "/pricing", "/pricing/", "/work", "/work/", "/tools", "/tools/auto-model-router", "/tools/1ststep-os-audit", "/tools/1ststep-os", "/work/lyons-life-demo", "/work/lyons-life-demo/", "/work/universal-relocations", "/work/universal-relocations/"];
  server.middlewares.use((request, _response, next) => {
    const url = request.url || "";
    const path = url.split("?")[0];
    if (routes.includes(path)) {
      const clean = path.endsWith("/") ? path.slice(0, -1) : path;
      request.url = url.replace(path, `${clean}/index.html`);
    }
    next();
  });
}

export default defineConfig({
  define: { __FOUNDRY_RD__: JSON.stringify(process.env.VERCEL_ENV !== "production") },
  plugins: [react(), siteAnalytics, motion, {
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
        foundry: "foundry/index.html",
        os: "os/index.html",
        journey: "journey/index.html",
        book: "book/index.html",
        pricing: "pricing/index.html",
        work: "work/index.html",
        bookingConfirmed: "book/confirmed/index.html",
        fitCheck: "fit-check/index.html",
        outgrownWebsiteCampaign: "campaigns/outgrown-website/index.html",
        morrisCountyFreeWebsiteCampaign: "campaigns/morris-county-free-website/index.html",
        appIdeaViabilityChecker: "app-idea-viability-checker.html",
        adminStudio: "admin/index.html",
        startupLaunchChecker: "startup-launch-checker/index.html",
        tools: "tools/index.html",
        autoModelRouter: "tools/auto-model-router/index.html",
        osAudit: "tools/1ststep-os-audit/index.html",
        osFoundation: "tools/1ststep-os/index.html",
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
