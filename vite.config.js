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

function serveAppRoutes(server) {
  server.middlewares.use('/api/os-public-scan', async (request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 512) request.destroy();
    });
    request.on('end', async () => {
      try {
        request.body = JSON.parse(body);
        const { default: handler } = await import('./api/os-public-scan.js');
        await handler(request, response);
      } catch {
        if (!response.writableEnded) { response.statusCode = 400; response.end(JSON.stringify({ ok: false, error: 'INVALID_TARGET' })); }
      }
    });
  });
  server.middlewares.use('/api/os-roast-intake', async (request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024) request.destroy();
    });
    request.on('end', async () => {
      try {
        request.body = JSON.parse(body);
        const { default: handler } = await import('./api/os-roast-intake.js');
        await handler(request, response);
      } catch {
        if (!response.writableEnded) { response.statusCode = 400; response.end(JSON.stringify({ ok: false, code: 'invalid_request' })); }
      }
    });
  });
  server.middlewares.use('/api/os-setup-intake', async (request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) request.destroy();
    });
    request.on('end', async () => {
      try {
        request.body = JSON.parse(body);
        const { default: handler } = await import('./api/os-setup-intake.js');
        await handler(request, response);
      } catch {
        if (!response.writableEnded) { response.statusCode = 400; response.end(JSON.stringify({ ok: false, code: 'invalid_request' })); }
      }
    });
  });
  server.middlewares.use((request, _response, next) => {
    if (request.url === "/os" || request.url?.startsWith("/os?")) {
      request.url = request.url.replace(/^\/os/, "/os/index.html");
    } else if (request.url === "/os/start" || request.url === "/os/start/" || request.url?.startsWith("/os/start?")) {
      request.url = request.url.replace(/^\/os\/start\/?/, "/os/start/index.html");
    }
    if (/^\/admin\/(command-center|agents|projects|activity|audits|handoffs|decisions|releases|session-lifecycle)\/?(?:\?.*)?$/.test(request.url || "")) {
      request.url = "/admin/index.html";
    }
    next();
  });
}

export default defineConfig({
  plugins: [react(), siteAnalytics, {
    name: "firststep-app-routes",
    configureServer: serveAppRoutes,
    configurePreviewServer: serveAppRoutes,
  }],
  optimizeDeps: {
    entries: ["index.html"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        os: "os/index.html",
        osStart: "os/start/index.html",
        journey: "journey/index.html",
        book: "book/index.html",
        bookingConfirmed: "book/confirmed/index.html",
        fitCheck: "fit-check/index.html",
        outgrownWebsiteCampaign: "campaigns/outgrown-website/index.html",
        morrisCountyFreeWebsiteCampaign: "campaigns/morris-county-free-website/index.html",
        appIdeaViabilityChecker: "app-idea-viability-checker.html",
        adminStudio: "admin/index.html",
        startupLaunchChecker: "startup-launch-checker/index.html",
        appBuilds: "services/app-builds.html",
        mvpBuilds: "services/mvp-builds.html",
        websites: "services/websites.html",
        revenueSystems: "services/revenue-systems.html",
        aiOperations: "services/ai-operations.html",
        internalTools: "services/internal-tools.html",
        privacy: "privacy.html",
        terms: "terms.html",
      },
    },
  },
});
