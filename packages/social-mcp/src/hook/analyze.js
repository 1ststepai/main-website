const OPENINGS = new Set(["question", "bold_claim", "contrarian", "result_first", "pattern_interrupt", "pov", "story", "other"]);

function words(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function clip(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function videoIdFrom(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{6,}$/.test(text)) return text;
  return "";
}

export function publicStructure(raw, { videoId, title, url, metrics, source }) {
  const opening = String(raw?.opening_type || raw?.opening || "other").trim().toLowerCase().replace(/\s+/g, "_");
  const quote = words(raw?.fragment || raw?.quote || "");
  const record = {
    video_id: videoId,
    url: url || `https://www.youtube.com/watch?v=${videoId}`,
    title: clip(title || raw?.title, 140),
    metrics: metrics || raw?.metrics || null,
    structure: {
      opening_type: OPENINGS.has(opening) ? opening : clip(opening, 40) || "other",
      pattern: clip(raw?.pattern || raw?.structure?.pattern, 240),
      visual_surprise: clip(raw?.visual_surprise || raw?.structure?.visual_surprise, 160),
      pacing: {
        cuts_or_beats: Number.isFinite(Number(raw?.pacing?.cuts_or_beats ?? raw?.cuts_or_beats))
          ? Number(raw?.pacing?.cuts_or_beats ?? raw?.cuts_or_beats)
          : null,
        seconds_to_first_payoff: Number.isFinite(Number(raw?.pacing?.seconds_to_first_payoff ?? raw?.seconds_to_first_payoff))
          ? Number(raw?.pacing?.seconds_to_first_payoff ?? raw?.seconds_to_first_payoff)
          : null,
      },
      delivery: {
        on_camera: typeof (raw?.delivery?.on_camera ?? raw?.on_camera) === "boolean" ? (raw?.delivery?.on_camera ?? raw?.on_camera) : null,
        energy: clip(raw?.delivery?.energy || raw?.energy, 40),
        eye_contact: typeof (raw?.delivery?.eye_contact ?? raw?.eye_contact) === "boolean" ? (raw?.delivery?.eye_contact ?? raw?.eye_contact) : null,
        text_on_screen: typeof (raw?.delivery?.text_on_screen ?? raw?.text_on_screen) === "boolean" ? (raw?.delivery?.text_on_screen ?? raw?.text_on_screen) : null,
      },
      promise: clip(raw?.promise || raw?.structure?.promise, 200),
    },
    fragment: quote.length > 0 && quote.length <= 6 ? quote.join(" ") : "",
    source,
  };
  delete record.transcript;
  delete record.structure.transcript;
  return record;
}

function geminiBody(url) {
  return {
    contents: [
      {
        parts: [
          {
            fileData: { fileUri: url },
            videoMetadata: { startOffset: "0s", endOffset: "10s" },
          },
          {
            text: "Describe only the structure of the first 10 seconds. Return JSON with opening_type, pattern, visual_surprise, pacing {cuts_or_beats, seconds_to_first_payoff}, delivery {on_camera, energy, eye_contact, text_on_screen}, promise, and an optional fragment of at most 6 words. Do not return a transcript. Do not quote more than 6 words.",
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };
}

export async function captureHookStructure(ctx, input = {}) {
  const videoId = videoIdFrom(input.video_id || input.url);
  if (!videoId) return { available: false, message: "A public YouTube link or video id is required." };
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const title = String(input.title || "").slice(0, 140);
  const metrics = input.metrics || null;
  let raw = null;
  let source = "assistant";
  if (input.observation && typeof input.observation === "object") {
    raw = input.observation;
    source = "assistant";
  } else if (typeof ctx.structureProvider === "function") {
    raw = await ctx.structureProvider({ url, videoId, startOffset: "0s", endOffset: "10s" });
    source = "mock";
  } else {
    const key = String(ctx.env.GEMINI_API_KEY || "").trim();
    if (!key) {
      return {
        available: false,
        video_id: videoId,
        url,
        message: "Add a Gemini key, or send an observation of the first 10 seconds. The video is not downloaded.",
      };
    }
    const model = String(ctx.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let response;
    try {
      response = await ctx.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(geminiBody(url)),
      });
    } catch {
      return { available: false, message: "Gemini could not be reached. The video was not downloaded." };
    }
    const payload = typeof response.json === "function" ? await response.json().catch(() => ({})) : {};
    if (!response.ok) return { available: false, message: `Gemini returned ${response.status}. The video was not downloaded.` };
    const text = (payload.candidates || []).flatMap((candidate) => candidate.content?.parts || []).map((part) => part.text || "").join("\n");
    try {
      raw = JSON.parse(text);
    } catch {
      return { available: false, message: "Gemini did not return a structure. Nothing was stored." };
    }
    source = "gemini";
  }
  const record = publicStructure(raw, { videoId, title: title || raw?.title, url, metrics, source });
  record.captured_at = new Date(ctx.now()).toISOString();
  ctx.store.updateSeo((seo) => {
    seo.structures = seo.structures || {};
    seo.structures[videoId] = record;
    return record;
  });
  const saved = ctx.store.readSeo().structures?.[videoId];
  return { available: true, structure: saved, stored_transcript: false };
}
