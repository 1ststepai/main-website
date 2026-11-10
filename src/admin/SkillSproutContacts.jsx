import React, { useEffect, useState } from "react";
export default function SkillSproutContacts({ api, previewMode }) {
  const [contacts, setContacts] = useState([]);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(start) {
    if (previewMode) return;
    setBusy(true); setError("");
    try { const result = await api(`/api/admin-skillsprout?offset=${start}`); setContacts(result.contacts); setOffset(start); }
    catch { setError("SkillSprout contacts could not be loaded. Please retry."); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(0); }, [previewMode]);
  return <section className="page-content" aria-labelledby="skillsprout-title">
    <h1 id="skillsprout-title">SkillSprout contacts</h1>
    <p>Starter Pack and feature-request consent records. Kept separate from sales, nurture, and newsletter outreach. No email is sent here.</p>
    {previewMode && <p>Preview only. Live contacts require the protected admin.</p>}
    {error && <p role="alert">{error}</p>}
    <button className="button" disabled={busy || previewMode} onClick={() => load(0)}>Refresh</button>
    <div aria-live="polite">{busy ? <p>Loading contacts…</p> : <>{!contacts.length && <p>No contacts on this page.</p>}{contacts.map(c => <article key={c.id} className="panel"><h2>{c.email}</h2><p>{c.tag} · {c.source}</p><p>Consent recorded: {c.timestamp} · {c.consent_version}</p></article>)}</>}</div>
    <button className="button" disabled={busy || !offset} onClick={() => load(Math.max(0, offset - 50))}>Previous</button>
    <button className="button" disabled={busy || contacts.length < 50} onClick={() => load(offset + 50)}>Next</button>
  </section>;
}
