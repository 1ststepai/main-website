// Intentionally separate from production config. Loopback review only.
export default {
  css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true },
  plugins: [{ name: 'course-local-only', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      if (req.url?.split('?')[0] === '/course') req.url = '/course/index.html';
      if (req.url?.split('?')[0] === '/course/library') req.url = '/course/library/index.html';
      next();
    });
  }}],
  build: { outDir: 'dist-course-local', rollupOptions: { input: { course: 'course/index.html', library: 'course/library/index.html' } } },
};
