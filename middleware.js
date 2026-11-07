import { rewrite } from "@vercel/functions";

export const POSTPATH_HOST = "postpath.1ststep.ai";

/**
 * The product canonical is the host root. A redirect there served the
 * marketing file at /postpath/ and left the canonical URL as a 307.
 * Rewrite the host root to that file so the canonical returns 200.
 */
export function postpathRootRewrite(request) {
  const url = new URL(request.url);
  const host = (request.headers.get("host") || url.host || "").split(":")[0].toLowerCase();
  if (host !== POSTPATH_HOST || url.pathname !== "/") return undefined;
  return rewrite(new URL("/postpath/index.html", request.url));
}

export default function middleware(request) {
  return postpathRootRewrite(request);
}

export const config = {
  matcher: "/",
};
