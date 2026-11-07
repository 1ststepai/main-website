import React, { useEffect, useState } from "react";

export default function DesktopPairing({ api, id }) {
  const [pairing, setPairing] = useState(null);
  const [devices, setDevices] = useState([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const data = await api(`/api/studio-desktop?action=${id ? `review&id=${encodeURIComponent(id)}` : "devices"}`);
      if (id) setPairing(data.pairing); else setDevices(data.devices);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [id]);
  async function approve(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/studio-desktop?action=approve", { method: "POST", body: JSON.stringify({ id, code }) });
      setMessage("This PC is paired. Return to Newsletter Studio; it will open your saved pipeline.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function revoke(device) {
    if (!window.confirm("Disconnect this PC? The desktop app will need pairing again. Cloud records will stay saved.")) return;
    setBusy(true); setError("");
    try {
      await api(`/api/studio-desktop?id=${encodeURIComponent(device.id)}`, { method: "DELETE" });
      await load(); setMessage("PC disconnected. Cloud records are unchanged.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-card">
    <p className="eyebrow">NEWSLETTER STUDIO / LINKED PCS</p>
    <h1>{id ? "Pair your desktop app" : "Your linked PCs"}</h1>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {id && !message && <>
      <p>Only approve a request you started in Newsletter Studio on your own PC.</p>
      <p>This connection can read your newsletter and UGC pipelines, clients and newsletter/UGC quotes, with supporting templates and pricing. It can save pipeline records, clients and newsletter/UGC drafts only. Other quote types stay on the website. It cannot change workspace pricing or existing templates, alter issued or payment-linked quotes, send emails, create payment links or access Job Agent operations.</p>
      {pairing ? <form onSubmit={approve}>
        <label htmlFor="desktop-code">Six-digit code shown in the desktop app</label>
        <input id="desktop-code" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
        <button className="button primary" disabled={busy || code.length !== 6}>{busy ? "Pairing…" : "Pair this PC"}</button>
        <p>Request expires at {new Date(pairing.expires_at).toLocaleTimeString()}. You can disconnect the PC later.</p>
      </form> : <button className="button" onClick={load}>Retry pairing review</button>}
    </>}
    {!id && <>
      <p>Disconnect a PC to stop its cloud access. Your pipeline and quotes stay saved.</p>
      {devices.map(d => <div key={d.id}><strong>{d.name}</strong><p>Paired {new Date(d.paired_at).toLocaleString()}</p><button className="button" disabled={busy} onClick={() => revoke(d)}>Disconnect PC</button></div>)}
      {!devices.length && !error && <p>No paired PCs recorded.</p>}
      <button className="button" onClick={load} disabled={busy}>Refresh linked PCs</button>
    </>}
    <p><a href="/admin/?page=newsletter">Return to your newsletter pipeline</a></p>
  </section></main>;
}
