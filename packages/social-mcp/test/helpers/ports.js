import { createServer } from "node:net";

// Ask the OS for a free loopback port (bind to port 0, read it, release it).
// Tests run in parallel processes, so fixed port numbers clash (EADDRINUSE).
export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Distinct free ports, e.g. [deskPort, oauthPort].
export async function freePorts(count = 2) {
  const ports = new Set();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}
