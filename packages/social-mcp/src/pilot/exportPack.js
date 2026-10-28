import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NETWORK_LABELS } from "./captions.js";
import { zipStore } from "./zipStore.js";

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function approvedRows(store) {
  const bundles = store.listBundles().filter((bundle) => bundle.status === "approved" || bundle.pilot);
  const rows = [];
  for (const bundle of bundles) {
    if (bundle.status !== "approved" && bundle.status !== "draft") continue;
    const platforms = bundle.platforms || [];
    for (const platform of platforms) {
      const post = store.getPost(bundle.child_ids?.[platform]);
      if (bundle.status === "approved" && post && post.status !== "approved") continue;
      if (bundle.status !== "approved" && post?.status !== "approved") continue;
      rows.push({
        bundle_id: bundle.id,
        post_id: post?.id || "",
        platform,
        label: NETWORK_LABELS[platform] || platform,
        title: post?.title || bundle.title || "",
        caption: post?.caption || bundle.overrides?.[platform]?.caption || bundle.caption || "",
        status: "approved, waiting to post",
        goal_id: bundle.pilot?.goal_id || "",
        topic_id: bundle.pilot?.topic_id || "",
        compliance_banner: bundle.pilot?.compliance_banner || "",
        media_path: post?.media_path || "",
      });
    }
  }
  for (const post of store.listPosts({ status: "approved" })) {
    if (post.bundle_id) continue;
    rows.push({
      bundle_id: "",
      post_id: post.id,
      platform: post.platform,
      label: NETWORK_LABELS[post.platform] || post.platform,
      title: post.title || "",
      caption: post.caption || post.description || "",
      status: "approved, waiting to post",
      goal_id: post.pilot?.goal_id || "",
      topic_id: post.pilot?.topic_id || "",
      compliance_banner: post.pilot?.compliance_banner || "",
      media_path: post.media_path || "",
    });
  }
  return rows;
}

export function captionsText(rows) {
  if (!rows.length) return "No approved drafts are waiting.\n";
  return rows
    .map((row) => [`# ${row.label}`, row.title, row.caption, ""].filter((line) => line !== undefined).join("\n"))
    .join("\n");
}

export function captionsCsv(rows) {
  const header = ["platform", "label", "title", "caption", "status", "goal_id", "topic_id", "compliance_banner", "media_path"];
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map((key) => csvCell(row[key])).join(","));
  return `${lines.join("\n")}\n`;
}

export function captionsZip(rows, mediaDir) {
  const files = [{ name: "captions.csv", data: captionsCsv(rows) }, { name: "captions.txt", data: captionsText(rows) }];
  const seen = new Set();
  for (const row of rows) {
    if (!row.media_path || seen.has(row.media_path)) continue;
    const full = path.join(mediaDir, path.basename(row.media_path));
    if (!existsSync(full)) continue;
    seen.add(row.media_path);
    files.push({ name: `media/${path.basename(row.media_path)}`, data: readFileSync(full) });
  }
  return zipStore(files);
}
