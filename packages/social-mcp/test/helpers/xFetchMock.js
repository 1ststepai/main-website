/** Shared X (Twitter) tweet create fetch mock for unit tests. */
export function xTweetFetchMock({ tweetId = "tw123" } = {}) {
  return async (url, init = {}) => {
    if (String(url).includes("api.twitter.com/2/tweets") && init.method === "POST") {
      return {
        ok: true,
        status: 201,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ data: { id: tweetId } }),
      };
    }
    return { ok: false, status: 500, headers: { get: () => "" }, text: async () => "{}" };
  };
}

export function seedXConnection(engine, { profileId = "acme" } = {}) {
  engine.store.saveConnection(
    { profile_id: profileId, platform: "x", account_label: "@acme", user_id: "1" },
    {
      access_token: "xa",
      refresh_token: "xr",
      expires_at: "2099-01-01T00:00:00.000Z",
    },
  );
}
