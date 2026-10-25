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
  "failed",
  "rejected",
];

const OAUTH_COPY = {
  connected: "YouTube connected for this brand.",
  access_denied: "Google sign-in was cancelled.",
  invalid_state: "That connection attempt expired. Try Connect YouTube again.",
  social_not_configured: "Google OAuth is not configured on this environment yet.",
  oauth_failed: "YouTube could not be connected.",
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
    load(brandId);
  }, []);

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
      if (data.authorization_url) window.location.assign(data.authorization_url);
      if (body.action === "publish_due") {
        if (data.message) setMessage(data.message);
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
        if (data.published_url) setMessage("Published.");
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
  const connection = (desk?.connections || []).find((item) => item.platform === "youtube" && item.brand_id === brandId);
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
          <button className="button" type="button" onClick={() => load(brandId)} disabled={loading || busy || previewMode}>
            <RefreshCw size={16} />Refresh
          </button>
          <button className="button primary" type="button" onClick={publishDue} disabled={busy || loading}>
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
          <select value={brandId} onChange={(event) => { setBrandId(event.target.value); setSelectedId(""); load(event.target.value); }}>
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
        <section className="editor-panel social-card">
          <h3>YouTube</h3>
          {connection ? (
            <>
              <p>Connected as {connection.account_label}</p>
              <button className="button" type="button" disabled={busy} onClick={() => act({ action: "disconnect", platform: "youtube" })}>Disconnect</button>
            </>
          ) : (
            <>
              <p>Not connected. Start Google OAuth for this brand. Scope is upload plus readonly.</p>
              <button className="button primary" type="button" disabled={busy} onClick={() => act({ action: "connect_youtube" })}>Connect YouTube</button>
            </>
          )}
        </section>
        <section className="editor-panel social-card">
          <h3>Brand tokens</h3>
          <form className="social-token-form" onSubmit={(event) => { event.preventDefault(); act({ action: "create_token", label: tokenLabel }); setTokenLabel(""); }}>
            <label className="field">Label
              <input value={tokenLabel} onChange={(event) => setTokenLabel(event.target.value)} maxLength={60} placeholder="Content agent" />
            </label>
            <button className="button" type="submit" disabled={busy || tokenLabel.trim().length < 2}><Plus size={15} />Create token</button>
          </form>
          <div className="record-list">
            {(desk?.tokens || []).filter((token) => token.brand_id === brandId && !token.revoked_at).map((token) => (
              <div key={token.id} className="social-token-row">
                <span><strong>{token.label}</strong><small>{token.prefix}…</small></span>
                <button className="button compact" type="button" disabled={busy || previewMode} onClick={() => act({ action: "revoke_token", token_id: token.id })}>Revoke</button>
              </div>
            ))}
            {(desk?.tokens || []).filter((token) => token.brand_id === brandId && !token.revoked_at).length === 0 && <p className="list-empty">No active tokens for this brand.</p>}
          </div>
        </section>
      </div>

      <div className="split-page social-split">
        <section className="list-panel">
          <div className="section-heading"><h2>Queue</h2></div>
          {loading && <p className="list-empty">Loading posts…</p>}
          {!loading && posts.length === 0 && <p className="list-empty">No posts in this queue. A brand token creates drafts through the API.</p>}
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
              <dl className="social-meta">
                <div><dt>Description</dt><dd>{selected.description || "—"}</dd></div>
                <div><dt>Tags</dt><dd>{(selected.tags || []).join(", ") || "—"}</dd></div>
                <div><dt>Caption</dt><dd>{selected.caption || "—"}</dd></div>
                <div><dt>Keywords</dt><dd className="keyword-row">{(selected.keywords || []).length ? selected.keywords.map((keyword) => <span key={keyword}>{keyword}</span>) : "None yet"}</dd></div>
                <div><dt>vidIQ</dt><dd>Title {selected.title_score ?? "—"} · Thumbnail {selected.thumbnail_score ?? "—"} · Checked {selected.checked_at ? new Date(selected.checked_at).toLocaleString() : "—"}</dd></div>
                <div><dt>Files</dt><dd>Video {selected.video_asset ? `${selected.video_asset.content_type} · ${selected.video_asset.size} bytes` : "missing"} · Thumbnail {selected.thumbnail_asset ? selected.thumbnail_asset.content_type : "missing"}</dd></div>
                <div><dt>Platform draft</dt><dd>{selected.platform_draft?.status === "ready" ? `Private on ${selected.platform} (${selected.platform_draft.video_id})` : selected.platform_draft?.status === "failed" ? `Failed: ${selected.platform_draft.error || "upload error"}` : selected.platform_draft?.status === "uploading" ? "Uploading as private draft…" : "Not uploaded yet"}</dd></div>
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
                  onChange={(event) => act({ action: "set_privacy", post_id: selected.id, privacy_status: event.target.value })}
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <p className="social-note">New posts default to private. An unaudited Google project can only publish private videos until YouTube approves the audit.</p>

              {needsOverride && (
                <label className="field">Override reason
                  <textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} maxLength={500} placeholder="Why this post should go out below the score gate" />
                </label>
              )}
              <div className="social-actions">
                <button className="button primary" type="button" disabled={approveDisabled} onClick={() => act({ action: "approve", post_id: selected.id, override_reason: needsOverride ? overrideReason.trim() : "" })}>
                  <Check size={16} />{needsOverride ? "Approve with override" : "Approve"}
                </button>
                <label className="field">Reject reason
                  <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={500} />
                </label>
                <button className="button danger" type="button" disabled={busy || ["publishing", "published"].includes(selected.status)} onClick={() => act({ action: "reject", post_id: selected.id, reason: rejectReason })}>
                  <X size={16} />Reject
                </button>
              </div>
              <div className="social-actions">
                <label className="field">Schedule
                  <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={busy || !scheduleAt || !["approved", "scheduled"].includes(selected.status)}
                  onClick={() => act({ action: "schedule", post_id: selected.id, scheduled_at: new Date(scheduleAt).toISOString() })}
                >
                  Schedule
                </button>
                {selected.status === "failed" && <button className="button" type="button" disabled={busy} onClick={() => act({ action: "retry_publish", post_id: selected.id })}>Retry publish</button>}
                {(selected.status === "failed" || selected.status === "publishing") && (
                  <button className="button" type="button" disabled={busy} onClick={() => act({ action: "restart_upload", post_id: selected.id })}>Start upload over</button>
                )}
              </div>
              {selected.scheduled_at && <p className="social-note">Scheduled {new Date(selected.scheduled_at).toLocaleString()}. Publish due sends posts whose time has arrived, one chunk at a time.</p>}
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
