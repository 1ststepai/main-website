/** Shared YouTube OAuth + resumable upload fetch mock for unit tests. */
export function youtubeFetchMock(calls, { videoId = "vid-due" } = {}) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () =>
          JSON.stringify({
            access_token: "ya29.access",
            expires_in: 3600,
          }),
      };
    }
    if (String(url).includes("uploadType=resumable")) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) =>
            name.toLowerCase() === "location" ? "https://www.googleapis.com/upload/youtube/v3/resumable" : "",
        },
        text: async () => "",
      };
    }
    if (String(url).includes("/upload/youtube/v3/resumable")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ id: videoId, status: { privacyStatus: "private" } }),
      };
    }
    return { ok: false, status: 500, headers: { get: () => "" }, text: async () => "{}" };
  };
}
