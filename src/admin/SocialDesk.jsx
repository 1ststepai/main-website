import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { SOCIAL_BRANDS } from "../../lib/social/brands.js";
import {
  keywordsMissingFromCopy,
  overrideReasonOk,
  vidiqBlockReason,
} from "../../lib/social/approval.js";

const STATUSES = [
  "all",
  "draft",
  "ready_for_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "handed_off",
  "failed",
  "rejected",
];

const PLATFORM_NOTES = {
  youtube: "Private upload first. After approval, Publish due applies the privacy you chose. A Short gets #Shorts on the description sent to YouTube.",
  instagram: "Resumable Reel upload. Instagram has no private post. Leave privacy private to stop before it goes live, then set public when you want it published.",
  facebook: "Page Reel. Private finishes as an unpublished draft. Public publishes the Reel.",
  tiktok: "Inbox handoff only. The TikTok app is where the post is finished. This studio does not direct-post.",
  x: "Not implemented.",
};

const OAUTH_COPY = {
  connected: "Account connected. If more were left in the chain, the next login should have opened automatically.",
  access_denied: "Sign-in was cancelled. Use Connect accounts to start again.",
  invalid_state: "That connection attempt expired. Start Connect accounts again.",
  social_not_configured: "That platform's OAuth is not configured on this environment yet.",
  oauth_failed: "The account could not be connected.",
  account_mismatch: "That login is not the Swing Trade Pros account this studio expects.",
  ambiguous_page: "That Meta login can access more than one Page. Use the login for the Swing Trade Pros Page.",
};

const CONNECT_LABELS = {
  youtube: "YouTube",
  meta: "Meta (Facebook + Instagram)",
  tiktok: "TikTok",
};

function previewDesk() {
  return {
    brands: SOCIAL_BRANDS,
    brand_id: "swingtradepros",
    connections: [{
      brand_id: "swingtradepros",
      platform: "youtube",
      account_label: "@SwingTradePros",
      channel_id: "preview",
      connected_at: "2026-10-25T15:00:00.000Z",
    }],
    tokens: [{
      id: "tok_preview",
      brand_id: "swingtradepros",
      label: "Content agent",
      prefix: "stp_preview",
      created_at: "2026-10-25T15:00:00.000Z",
      revoked_at: null,
    }],
    posts: [
      {
        id: "post_preview_blocked",
        brand_id: "swingtradepros",
        platform: "youtube",
        status: "ready_for_review",
        title: "Opening range on SPY",
        description: "A first-pass breakdown of the opening range.",
        tags: ["spy", "opening range"],
        thumbnail_asset: null,
        video_asset: { pathname: "social/swingtradepros/post_preview_blocked/video.mp4", size: 1200000, content_type: "video/mp4" },
        caption: "",
        scheduled_at: null,
        privacy_status: "private",
        title_score: 84,
        thumbnail_score: 71,
        keywords: [],
        checked_at: "2026-10-25T15:04:00.000Z",
        approved_by: null,
        published_url: null,
        error: null,
      },
      {
        id: "post_preview_ready",
        brand_id: "swingtradepros",
        platform: "youtube",
        status: "ready_for_review",
        title: "How Swing Trade Pros reads the open",
        description: "Keywords in the copy: swing trading, opening range.",
        tags: ["swing trading"],
        thumbnail_asset: null,
        video_asset: { pathname: "social/swingtradepros/post_preview_ready/video.mp4", size: 2400000, content_type: "video/mp4" },
        caption: "",
        scheduled_at: null,
        privacy_status: "private",
        title_score: 94,
        thumbnail_score: 96,
        keywords: ["swing trading", "opening range"],
        checked_at: "2026-10-25T15:06:00.000Z",
        approved_by: null,
        published_url: null,
        error: null,
      },
    ],
    audit: [],
  };
}

function statusLabel(status) {
  return String(status || "").replaceAll("_", " ");
}

export default function SocialDesk({ previewMode = false, request }) {
  const oauth = new URLSearchParams(window.location.search);
  const [desk, setDesk] = useState(previewMode ? previewDesk() : null);
  const [brandId, setBrandId] = useState(oauth.get("brand") || "swingtradepros");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(previewMode ? "post_preview_blocked" : "");
  const [overrideReason, setOverrideReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [tokenLabel, setTokenLabel] = useState("");
  const [platforms, setPlatforms] = useState(["youtube", "instagram", "facebook", "tiktok"]);
  const [copies, setCopies] = useState({
    youtube: { title: "", description: "", tags: "" },
    instagram: { caption: "" },
    facebook: { title: "", description: "" },
    tiktok: { caption: "" },
  });
  const [videoFile, setVideoFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [scoreTitle, setScoreTitle] = useState("");
  const [scoreThumb, setScoreThumb] = useState("");
  const [scoreKeywords, setScoreKeywords] = useState("");
  const [editCopy, setEditCopy] = useState({ title: "", description: "", caption: "", tags: "" });
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState(oauth.get("social_oauth") ? (OAUTH_COPY[oauth.get("reason")] || OAUTH_COPY[oauth.get("social_oauth")] || "") : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!previewMode);
  const [busy, setBusy] = useState(false);

  async function load(nextBrand = brandId) {
    if (previewMode) return;
    setLoading(true);
    setError("");
    try {
      const data = await request(`/api/social/admin?brand_id=${encodeURIComponent(nextBrand)}`);
      setDesk(data.desk);
      setBrandId(data.desk.brand_id);
    } catch (requestError) {
      setError(requestError.message || "Social queue is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(brandId);
  }, []);

  useEffect(() => {
    const post = (desk?.posts || []).find((item) => item.id === selectedId);
    if (!post) return;
    setEditCopy({
      title: post.title || "",
      description: post.description || "",
      caption: post.caption || "",
      tags: (post.tags || []).join(", "),
    });
  }, [desk, selectedId]);

  async function act(body) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (previewMode) {
        setDesk((current) => ({
          ...current,
          posts: current.posts.map((post) => {
            if (post.id !== body.post_id) return post;
            if (body.action === "approve") {
              return { ...post, status: "approved", approved_by: "owner", override_reason: body.override_reason || null, override_by: body.override_reason ? "owner" : null };
            }
            if (body.action === "schedule") return { ...post, status: "scheduled", scheduled_at: body.scheduled_at };
            if (body.action === "reject") return { ...post, status: "rejected", error: body.reason || "Rejected by owner." };
            if (body.action === "set_privacy") return { ...post, privacy_status: body.privacy_status };
            if (body.action === "publish_now") {
              return {
                ...post,
                status: "scheduled",
                scheduled_at: body.scheduled_at || new Date().toISOString(),
                approved_by: "owner",
                override_reason: body.override_reason || post.override_reason || null,
                override_by: body.override_reason ? "owner" : post.override_by,
              };
            }
            if (body.action === "update_copy") {
              return {
                ...post,
                title: body.title,
                description: body.description,
                caption: body.caption,
                tags: Array.isArray(body.tags) ? body.tags : post.tags,
              };
            }
            return post;
          }),
        }));
        setMessage("Local preview. Approval and publishing run only in the signed-in studio.");
        return;
      }
      const data = await request("/api/social/admin", {
        method: "POST",
        body: JSON.stringify({ ...body, brand_id: brandId }),
      });
      if (data.desk) setDesk(data.desk);
      if (data.secret) setSecret(data.secret);
      if (data.authorization_url) {
        window.location.assign(data.authorization_url);
        return data;
      }
      if (body.action === "connect_all" && data.done) {
        setMessage(data.message || "All accounts for this brand are connected.");
      }
      if (body.action === "publish_now" && data.kick_publish) {
        setMessage("Scheduled. Running Publish due…");
        await publishDue();
        return data;
      }
      if (body.action === "publish_due") {
        if (data.status === "handed_off") setMessage(data.message || "Handed off. Finish it in the platform app.");
        else if (data.message) setMessage(data.message);
        else if (data.published_url) setMessage("Published.");
        else if (data.continued) setMessage(`Uploading ${data.bytes_uploaded || 0} of ${data.total_bytes || 0} bytes.`);
        else setMessage("Publish check finished.");
      } else if (body.action === "create_token") {
        setMessage("Copy the token now. It will not be shown again.");
      } else {
        setMessage("Saved.");
      }
      return data;
    } catch (requestError) {
      setError(requestError.message || "The action could not be completed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function queueShort(event) {
    event.preventDefault();
    if (!videoFile && !previewMode) {
      setError("Choose the video file first.");
      return;
    }
    const payloadCopies = {
      youtube: {
        title: copies.youtube.title,
        description: copies.youtube.description,
        tags: copies.youtube.tags.split(",").map((item) => item.trim()).filter(Boolean),
      },
      instagram: { caption: copies.instagram.caption },
      facebook: { title: copies.facebook.title, description: copies.facebook.description },
      tiktok: { caption: copies.tiktok.caption },
    };
    if (previewMode) {
      setMessage("Local preview. The file stays on this computer and nothing is queued.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const queued = await request("/api/social/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "queue_short",
          brand_id: brandId,
          platforms,
          copies: payloadCopies,
          privacy_status: "private",
        }),
      });
      const primary = (queued.posts || []).find((post) => post.platform === "youtube") || queued.posts?.[0];
      if (!primary) throw new Error("The queue did not return a post.");
      const upload = await request("/api/social/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "issue_upload",
          brand_id: brandId,
          post_id: primary.id,
          kind: "video",
          content_type: videoFile.type || "video/mp4",
          size: videoFile.size,
        }),
      });
      const put = await fetch(upload.upload.upload_url, { method: "PUT", headers: upload.upload.headers, body: videoFile });
      if (!put.ok) throw new Error("The video upload did not finish.");
      await request("/api/social/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "confirm_upload",
          brand_id: brandId,
          post_id: primary.id,
          confirm_upload: { kind: "video", pathname: upload.upload.pathname },
        }),
      });
      const youtube = (queued.posts || []).find((post) => post.platform === "youtube");
      if (youtube && thumbFile) {
        const thumb = await request("/api/social/admin", {
          method: "POST",
          body: JSON.stringify({
            action: "issue_upload",
            brand_id: brandId,
            post_id: youtube.id,
            kind: "thumbnail",
            content_type: thumbFile.type || "image/jpeg",
            size: thumbFile.size,
          }),
        });
        const thumbPut = await fetch(thumb.upload.upload_url, { method: "PUT", headers: thumb.upload.headers, body: thumbFile });
        if (!thumbPut.ok) throw new Error("The thumbnail upload did not finish.");
        await request("/api/social/admin", {
          method: "POST",
          body: JSON.stringify({
            action: "confirm_upload",
            brand_id: brandId,
            post_id: youtube.id,
            confirm_upload: { kind: "thumbnail", pathname: thumb.upload.pathname },
          }),
        });
      }
      await load(brandId);
      setSelectedId(primary.id);
      setMessage("Short queued as private. Review each platform before you approve it. YouTube still needs vidIQ scores or a typed override.");
    } catch (requestError) {
      setError(requestError.message || "The short could not be queued.");
    } finally {
      setBusy(false);
    }
  }

  async function publishDue() {
    setBusy(true);
    setError("");
    try {
      for (let step = 0; step < 5000; step += 1) {
        if (previewMode) {
          setMessage("Local preview. Publish due runs only in the signed-in studio.");
          break;
        }
        const data = await request("/api/social/admin", {
          method: "POST",
          body: JSON.stringify({ action: "publish_due", brand_id: brandId }),
        });
        if (data.desk) setDesk(data.desk);
        if (data.locked) {
          setMessage("Upload is already running. Waiting to continue.");
          await new Promise((resolve) => setTimeout(resolve, data.retry_after_ms || 2000));
          continue;
        }
        if (data.status === "handed_off") setMessage(data.message || "Handed off. Finish it in the platform app.");
        else if (data.published_url) setMessage("Published.");
        else if (data.message) setMessage(data.message);
        else setMessage(`Uploading ${data.bytes_uploaded || 0} of ${data.total_bytes || 0} bytes.`);
        if (!data.continued) break;
      }
    } catch (requestError) {
      setError(requestError.message || "Publish did not finish.");
    } finally {
      setBusy(false);
    }
  }

  const posts = useMemo(() => {
    const all = desk?.posts || [];
    return all.filter((post) => post.brand_id === brandId && (status === "all" || post.status === status));
  }, [desk, brandId, status]);
  const selected = posts.find((post) => post.id === selectedId) || posts[0] || null;
  const connections = (desk?.connections || []).filter((item) => item.brand_id === brandId);
  const connectionFor = (platform) => connections.find((item) => item.platform === platform);
  const brand = (desk?.brands || SOCIAL_BRANDS).find((item) => item.id === brandId) || SOCIAL_BRANDS[0];
  const block = selected ? vidiqBlockReason(selected) : "";
  const missingKeywords = selected ? keywordsMissingFromCopy(selected) : [];
  const reviewable = selected && ["draft", "ready_for_review", "rejected"].includes(selected.status);
  const needsOverride = Boolean(block);
  const approveDisabled = busy || !reviewable || !String(selected?.title || "").trim() || (needsOverride && !overrideReasonOk(overrideReason));

  return (
    <div className="page-content social-page">
      <div className="section-heading page-heading">
        <div>
          <h2>Social queue</h2>
          <p>Every brand post waits for you. Agents can draft. Only this studio can approve or publish.</p>
        </div>
        <div className="social-heading-actions">
          <button className="button" type="button" onClick={() => { void load(brandId); }} disabled={loading || busy || previewMode}>
            <RefreshCw size={16} />Refresh
          </button>
          <button className="button primary" type="button" onClick={() => { void publishDue(); }} disabled={busy || loading}>
            <Check size={16} />Publish due
          </button>
        </div>
      </div>

      {previewMode && <p className="social-note">Local preview of the queue. Sample posts stay in this browser and are not uploaded.</p>}
      {message && <p className="social-note" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {secret && (
        <section className="token-reveal" role="status">
          <div>
            <strong>Copy this brand token once</strong>
            <code>{secret}</code>
          </div>
          <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(secret)}><Copy size={15} />Copy</button>
          <button className="button ghost" type="button" onClick={() => setSecret("")}>Hide</button>
        </section>
      )}

      <div className="social-toolbar">
        <label className="field">Brand
          <select value={brandId} onChange={(event) => { setBrandId(event.target.value); setSelectedId(""); void load(event.target.value); }}>
            {(desk?.brands || SOCIAL_BRANDS).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        <label className="field">Queue
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </select>
        </label>
      </div>

      <div className="social-tools">
        <section className="editor-panel social-card social-accounts">
          <h3>Accounts</h3>
          <p className="social-note">
            Closest to one click: Connect accounts walks YouTube → Meta (Facebook + Instagram) → TikTok.
            Each provider still shows its own login screen. X is not implemented.
          </p>
          <div className="social-heading-actions" style={{ marginBottom: 12 }}>
            <button
              className="button primary"
              type="button"
              disabled={busy || previewMode || desk?.connect_ready}
              onClick={() => { void act({ action: "connect_all" }); }}
            >
              {desk?.connect_ready ? "All accounts connected" : "Connect accounts"}
            </button>
          </div>
          {(desk?.connect_missing || []).length > 0 && (
            <p className="social-note" role="status">
              Still needed: {(desk.connect_missing || []).map((step) => CONNECT_LABELS[step] || step).join(" → ")}.
            </p>
          )}
          {["youtube", "instagram", "facebook", "tiktok", "x"].map((platform) => {
            const connected = connectionFor(platform);
            const expected = brand?.accounts?.[platform];
            return (
              <div key={platform} className="social-account">
                <div>
                  <strong>{platform}</strong>
                  <p>{connected ? `Connected as ${connected.account_label}${connected.channel_id ? ` · ${connected.channel_id}` : ""}` : "Not connected."}</p>
                  <p>{PLATFORM_NOTES[platform]}{expected ? ` Expected: ${expected.label}.` : ""}</p>
                </div>
                {connected ? (
                  <button className="button compact" type="button" disabled={busy || previewMode} onClick={() => { void act({ action: "disconnect", platform }); }}>Disconnect</button>
                ) : platform === "youtube" ? (
                  <button className="button compact" type="button" disabled={busy || previewMode} onClick={() => { void act({ action: "connect_youtube" }); }}>Connect</button>
                ) : platform === "instagram" || platform === "facebook" ? (
                  <button className="button compact" type="button" disabled={busy || previewMode} onClick={() => { void act({ action: "connect_meta" }); }}>Connect Meta</button>
                ) : platform === "tiktok" ? (
                  <button className="button compact" type="button" disabled={busy || previewMode} onClick={() => { void act({ action: "connect_tiktok" }); }}>Connect</button>
                ) : (
                  <span className="social-note">No publisher</span>
                )}
              </div>
            );
          })}
        </section>
        <section className="editor-panel social-card">
          <h3>Brand tokens</h3>
          <form className="social-token-form" onSubmit={(event) => { event.preventDefault(); void act({ action: "create_token", label: tokenLabel }); setTokenLabel(""); }}>
            <label className="field">Label
              <input value={tokenLabel} onChange={(event) => setTokenLabel(event.target.value)} maxLength={60} placeholder="Content agent" />
            </label>
            <button className="button" type="submit" disabled={busy || tokenLabel.trim().length < 2}><Plus size={15} />Create token</button>
          </form>
          <div className="record-list">
            {(desk?.tokens || []).filter((token) => token.brand_id === brandId && !token.revoked_at).map((token) => (
              <div key={token.id} className="social-token-row">
                <span><strong>{token.label}</strong><small>{token.prefix}…</small></span>
                <button className="button compact" type="button" disabled={busy || previewMode} onClick={() => { void act({ action: "revoke_token", token_id: token.id }); }}>Revoke</button>
              </div>
            ))}
            {(desk?.tokens || []).filter((token) => token.brand_id === brandId && !token.revoked_at).length === 0 && <p className="list-empty">No active tokens for this brand.</p>}
          </div>
        </section>
      </div>

      <form className="editor-panel social-compose" onSubmit={(event) => { void queueShort(event); }}>
        <h3>Queue one short</h3>
        <p className="social-note">One file, separate copy per platform, private until you approve. This studio does not call vidIQ and does not post to X.</p>
        <div className="social-toolbar">
          {["youtube", "instagram", "facebook", "tiktok"].map((platform) => (
            <label key={platform} className="field">
              <input
                type="checkbox"
                checked={platforms.includes(platform)}
                onChange={(event) => setPlatforms((current) => event.target.checked ? [...current, platform] : current.filter((item) => item !== platform))}
              />
              {" "}{platform}
            </label>
          ))}
        </div>
        <div className="social-compose-grid">
          <label className="field">YouTube title
            <input value={copies.youtube.title} onChange={(event) => setCopies((current) => ({ ...current, youtube: { ...current.youtube, title: event.target.value } }))} maxLength={100} placeholder="Where is Bitcoin in six months?" />
          </label>
          <label className="field">YouTube description
            <textarea value={copies.youtube.description} onChange={(event) => setCopies((current) => ({ ...current, youtube: { ...current.youtube, description: event.target.value } }))} rows={3} maxLength={5000} placeholder="Closest prediction wins six months in the Swing Trade Pros Discord." />
          </label>
          <label className="field">YouTube tags
            <input value={copies.youtube.tags} onChange={(event) => setCopies((current) => ({ ...current, youtube: { ...current.youtube, tags: event.target.value } }))} placeholder="bitcoin, swing trading" />
          </label>
          <label className="field">Instagram caption
            <textarea value={copies.instagram.caption} onChange={(event) => setCopies((current) => ({ ...current, instagram: { caption: event.target.value } }))} rows={3} maxLength={2200} />
          </label>
          <label className="field">Facebook title
            <input value={copies.facebook.title} onChange={(event) => setCopies((current) => ({ ...current, facebook: { ...current.facebook, title: event.target.value } }))} maxLength={100} />
          </label>
          <label className="field">Facebook description
            <textarea value={copies.facebook.description} onChange={(event) => setCopies((current) => ({ ...current, facebook: { ...current.facebook, description: event.target.value } }))} rows={3} maxLength={5000} />
          </label>
          <label className="field">TikTok caption
            <textarea value={copies.tiktok.caption} onChange={(event) => setCopies((current) => ({ ...current, tiktok: { caption: event.target.value } }))} rows={3} maxLength={2200} />
          </label>
          <label className="field">Video
            <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => setVideoFile(event.target.files?.[0] || null)} />
          </label>
          <label className="field">YouTube thumbnail
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setThumbFile(event.target.files?.[0] || null)} />
          </label>
        </div>
        <button className="button primary" type="submit" disabled={busy || platforms.length === 0}>Queue short</button>
      </form>

      <div className="split-page social-split">
        <section className="list-panel">
          <div className="section-heading"><h2>Queue</h2></div>
          {loading && <p className="list-empty">Loading posts…</p>}
          {!loading && posts.length === 0 && <p className="list-empty">No posts in this queue. Queue a short below, or send a draft with a brand token.</p>}
          <div className="record-list social-queue">
            {posts.map((post) => (
              <button key={post.id} type="button" className={selected?.id === post.id ? "selected" : ""} onClick={() => setSelectedId(post.id)}>
                <span>
                  <strong>{post.title || "Untitled draft"}</strong>
                  <small>{post.platform} · {statusLabel(post.status)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="editor-panel">
          {!selected && <p className="list-empty">Select a post to review its metadata.</p>}
          {selected && (
            <div className="social-detail">
              <div className="section-heading">
                <div>
                  <h2>{selected.title || "Untitled draft"}</h2>
                  <p>{selected.platform} · created by token {selected.created_by_token_id || "preview"}</p>
                </div>
                <span className={`status ${selected.status}`}>{statusLabel(selected.status)}</span>
              </div>
              {!["publishing", "published"].includes(selected.status) && (
                <div className="social-compose-grid">
                  <label className="field">Title
                    <input value={editCopy.title} maxLength={100} onChange={(event) => setEditCopy((current) => ({ ...current, title: event.target.value }))} />
                  </label>
                  <label className="field">Description
                    <textarea value={editCopy.description} rows={3} maxLength={5000} onChange={(event) => setEditCopy((current) => ({ ...current, description: event.target.value }))} />
                  </label>
                  <label className="field">Caption
                    <textarea value={editCopy.caption} rows={3} maxLength={2200} onChange={(event) => setEditCopy((current) => ({ ...current, caption: event.target.value }))} />
                  </label>
                  <label className="field">Tags
                    <input value={editCopy.tags} onChange={(event) => setEditCopy((current) => ({ ...current, tags: event.target.value }))} placeholder="comma separated" />
                  </label>
                  <button
                    className="button"
                    type="button"
                    disabled={busy || !editCopy.title.trim()}
                    onClick={() => { void act({
                      action: "update_copy",
                      post_id: selected.id,
                      title: editCopy.title,
                      description: editCopy.description,
                      caption: editCopy.caption,
                      tags: editCopy.tags.split(",").map((item) => item.trim()).filter(Boolean),
                    }); }}
                  >
                    Save copy
                  </button>
                </div>
              )}
              <dl className="social-meta">
                <div><dt>Description</dt><dd>{selected.description || "—"}</dd></div>
                <div><dt>Tags</dt><dd>{(selected.tags || []).join(", ") || "—"}</dd></div>
                <div><dt>Caption</dt><dd>{selected.caption || "—"}</dd></div>
                <div><dt>Keywords</dt><dd className="keyword-row">{(selected.keywords || []).length ? selected.keywords.map((keyword) => <span key={keyword}>{keyword}</span>) : "None yet"}</dd></div>
                <div><dt>vidIQ</dt><dd>Title {selected.title_score ?? "—"} · Thumbnail {selected.thumbnail_score ?? "—"} · Checked {selected.checked_at ? new Date(selected.checked_at).toLocaleString() : "—"}</dd></div>
                <div><dt>Files</dt><dd>Video {selected.video_asset ? `${selected.video_asset.content_type} · ${selected.video_asset.size} bytes` : "missing"} · Thumbnail {selected.thumbnail_asset ? selected.thumbnail_asset.content_type : "missing"}</dd></div>
                <div><dt>Platform draft</dt><dd>{selected.platform_draft?.status === "ready" ? `Private on ${selected.platform} (${selected.platform_draft.video_id})` : selected.platform_draft?.status === "failed" ? `Failed: ${selected.platform_draft.error || "upload error"}` : selected.platform_draft?.status === "uploading" ? "Uploading as private draft…" : "Not uploaded yet"}</dd></div>
                {selected.status === "handed_off" && <div><dt>Handoff</dt><dd>{selected.error || "The platform has the video. This studio did not publish it."}{selected.platform_ref ? ` Ref ${selected.platform_ref}.` : ""}</dd></div>}
                {selected.published_url && <div><dt>Live URL</dt><dd><a href={selected.published_url}>{selected.published_url}</a></dd></div>}
                {selected.error && <div><dt>Note</dt><dd>{selected.error}</dd></div>}
              </dl>
              {selected.thumbnail_asset && !previewMode && (
                <img
                  className="social-thumb"
                  alt=""
                  src={`/api/social/asset?post_id=${encodeURIComponent(selected.id)}&kind=thumbnail`}
                />
              )}
              {missingKeywords.length > 0 && (
                <p className="social-warning"><AlertTriangle size={14} /> Keywords not in the title, description, or tags: {missingKeywords.join(", ")}.</p>
              )}
              {block && <p className="social-warning" role="status"><ShieldCheck size={14} /> {block} An override needs a typed reason and is written to the audit log.</p>}
              {selected.override_reason && <p className="social-note">Override by {selected.override_by}: {selected.override_reason}</p>}

              <label className="field">Privacy
                <select
                  value={selected.privacy_status || "private"}
                  disabled={busy || ["publishing", "published"].includes(selected.status)}
                  onChange={(event) => { void act({ action: "set_privacy", post_id: selected.id, privacy_status: event.target.value }); }}
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <p className="social-note">New posts default to private. An unaudited Google project can only publish private videos until YouTube approves the audit.</p>

              {selected.platform === "youtube" && reviewable && (
                <div className="social-compose-grid">
                  <label className="field">vidIQ title score
                    <input value={scoreTitle} onChange={(event) => setScoreTitle(event.target.value)} inputMode="decimal" placeholder="From vidIQ. Not filled in here." />
                  </label>
                  <label className="field">vidIQ thumbnail score
                    <input value={scoreThumb} onChange={(event) => setScoreThumb(event.target.value)} inputMode="decimal" />
                  </label>
                  <label className="field">Keywords
                    <input value={scoreKeywords} onChange={(event) => setScoreKeywords(event.target.value)} placeholder="comma separated" />
                  </label>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => { void act({ action: "record_scores", post_id: selected.id, title_score: scoreTitle, thumbnail_score: scoreThumb, keywords: scoreKeywords.split(",").map((item) => item.trim()).filter(Boolean) }); }}
                  >
                    Save vidIQ scores
                  </button>
                </div>
              )}
              {needsOverride && (
                <label className="field">Override reason
                  <textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} maxLength={500} placeholder="Why this post should go out below the score gate" />
                </label>
              )}
              <div className="social-actions">
                <button className="button primary" type="button" disabled={approveDisabled} onClick={() => { void act({ action: "approve", post_id: selected.id, override_reason: needsOverride ? overrideReason.trim() : "" }); }}>
                  <Check size={16} />{needsOverride ? "Approve with override" : "Approve"}
                </button>
                <label className="field">Reject reason
                  <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={500} />
                </label>
                <button className="button danger" type="button" disabled={busy || ["publishing", "published"].includes(selected.status)} onClick={() => { void act({ action: "reject", post_id: selected.id, reason: rejectReason }); }}>
                  <X size={16} />Reject
                </button>
              </div>
              {selected.proposed_scheduled_at && (
                <p className="social-note">
                  Agent proposed {new Date(selected.proposed_scheduled_at).toLocaleString()}.
                  <button
                    className="button compact"
                    type="button"
                    style={{ marginLeft: 8 }}
                    disabled={busy || (reviewable && approveDisabled)}
                    onClick={() => {
                      void act({
                        action: "publish_now",
                        post_id: selected.id,
                        scheduled_at: selected.proposed_scheduled_at,
                        override_reason: needsOverride ? overrideReason.trim() : "",
                      });
                    }}
                  >
                    Use proposed time
                  </button>
                </p>
              )}
              <div className="social-actions">
                <label className="field">Schedule
                  <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={busy || !scheduleAt || (reviewable ? approveDisabled : !["approved", "scheduled", "failed", "handed_off"].includes(selected.status))}
                  onClick={() => {
                    void act({
                      action: "publish_now",
                      post_id: selected.id,
                      scheduled_at: new Date(scheduleAt).toISOString(),
                      override_reason: needsOverride ? overrideReason.trim() : "",
                    });
                  }}
                >
                  Schedule
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={busy || (reviewable ? approveDisabled : !["approved", "scheduled", "failed", "handed_off"].includes(selected.status))}
                  onClick={() => {
                    void act({
                      action: "publish_now",
                      post_id: selected.id,
                      override_reason: needsOverride ? overrideReason.trim() : "",
                    });
                  }}
                >
                  Publish now
                </button>
                {(selected.status === "failed" || selected.status === "handed_off") && <button className="button" type="button" disabled={busy} onClick={() => { void act({ action: "retry_publish", post_id: selected.id }); }}>Retry publish</button>}
                {(selected.status === "failed" || selected.status === "publishing") && (
                  <button className="button" type="button" disabled={busy} onClick={() => { void act({ action: "restart_upload", post_id: selected.id }); }}>Start upload over</button>
                )}
              </div>
              {selected.scheduled_at && <p className="social-note">Scheduled {new Date(selected.scheduled_at).toLocaleString()}. Publish due / Publish now send posts whose time has arrived, one chunk at a time.</p>}
            </div>
          )}
        </section>
      </div>

      <section className="editor-panel social-audit">
        <h3>Recent audit</h3>
        <ul>
          {(desk?.audit || []).slice(0, 8).map((event) => (
            <li key={event.id}><strong>{event.action}</strong> · {event.actor} · {event.at ? new Date(event.at).toLocaleString() : ""}{event.detail?.reason ? ` · ${event.detail.reason}` : ""}</li>
          ))}
          {(desk?.audit || []).length === 0 && <li>No audit events for this brand yet.</li>}
        </ul>
      </section>
    </div>
  );
}
