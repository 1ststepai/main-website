import { createStore } from "../../src/store.js";

const home = process.env.SOCIAL_MCP_HOME;
const tag = process.env.WORKER_TAG;
const store = createStore({ home });

function retry(fn) {
  let last;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return fn();
    } catch (error) {
      last = error;
      if (error?.code !== "vault_busy") throw error;
    }
  }
  throw last;
}

retry(() => store.upsertProfile({ id: "broker", name: `Broker ${tag}` }));
for (let i = 0; i < 15; i += 1) {
  const id = `post_${tag}_${String(i).padStart(2, "0")}`;
  retry(() =>
    store.savePost({
      id,
      profile_id: "broker",
      platform: "facebook",
      status: "draft",
      title: tag,
      caption: `${tag}-${i}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  );
}
if (tag === "a") {
  retry(() =>
    store.saveConnection(
      { profile_id: "broker", platform: "facebook", account_label: "Page A" },
      { access_token: "secret-from-a" },
    ),
  );
}
console.log(`ok ${tag}`);
