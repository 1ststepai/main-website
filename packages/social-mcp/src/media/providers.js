import { writeFileSync } from "node:fs";
import { mcpError } from "../errors.js";
import { deriveImage, writeSilentVideo } from "./derive.js";

export const MEDIA_PROVIDERS = ["none", "mock", "openai", "google", "xai", "replicate", "fal"];

export const SILENT_VIDEO_NOTE = "Silent video only. No music, no sound effects, no voices, and no voiceover.";

const DEFAULT_MODELS = {
  openaiImage: "gpt-image-1",
  googleImage: "imagen-4.0-generate-001",
  googleVideo: "veo-3.0-generate-001",
  xaiImage: "grok-imagine-image",
  xaiVideo: "grok-imagine-video",
};

export function redactSecrets(text, secrets) {
  let out = String(text || "");
  for (const secret of secrets) {
    const value = String(secret || "");
    if (value.length > 4) out = out.split(value).join("••••");
  }
  return out;
}

export function providerPrompt(prompt, style, type) {
  const base = [String(prompt || "").trim(), String(style || "").trim()].filter(Boolean).join(". ");
  if (type === "video") return `${base}. ${SILENT_VIDEO_NOTE}`;
  return base;
}

function missingKey(name) {
  throw mcpError("missing_media_key", `Add a ${name} API key in the desk. The key stays on this computer.`);
}

function openAiSize(aspect) {
  if (aspect === "9:16" || aspect === "4:5" || aspect === "3:4") return "1024x1536";
  if (aspect === "16:9" || aspect === "4:3") return "1536x1024";
  return "1024x1024";
}

async function callProvider({ url, key, body, fetchImpl, headers, method = "POST" }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
  } catch (error) {
    throw mcpError("media_provider", redactSecrets(error?.message || "The media provider could not be reached.", [key]));
  }
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 300) };
  }
  if (!response.ok) {
    throw mcpError(
      "media_provider",
      redactSecrets(`The media provider returned ${response.status}. ${text.slice(0, 240)}`, [key]),
    );
  }
  return payload;
}

function writeBase64(dest, value) {
  const bytes = Buffer.from(String(value || ""), "base64");
  if (!bytes.length) throw mcpError("media_provider", "The media provider returned an empty file.");
  writeFileSync(dest, bytes);
}

async function downloadUrl(url, dest, { fetchImpl, headers, key }) {
  let response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    throw mcpError("media_provider", redactSecrets(error?.message || "Could not download the generated file.", [key]));
  }
  if (!response.ok) {
    throw mcpError("media_provider", `Could not download the generated file (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw mcpError("media_provider", "The downloaded file is empty.");
  writeFileSync(dest, bytes);
}

function videoUri(payload) {
  return (
    payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    payload?.response?.videos?.[0]?.uri ||
    payload?.video?.url ||
    payload?.url ||
    payload?.output ||
    (Array.isArray(payload?.output) ? payload.output[0] : "") ||
    ""
  );
}

function createMock() {
  return {
    id: "mock",
    label: "Mock demo",
    nativeAspects: true,
    async generateImage({ dest, width, height }) {
      const sharp = (await import("sharp")).default;
      await sharp({
        create: { width, height, channels: 3, background: { r: 16, g: 35, b: 58 } },
      })
        .png()
        .toFile(dest);
      return { status: "succeeded", model: "mock-image", dest };
    },
    async generateVideo({ dest, width, height, duration }) {
      await writeSilentVideo(dest, { width, height, duration: duration || 4 });
      return { status: "succeeded", model: "mock-video", dest };
    },
  };
}

function createOpenAI({ key, fetchImpl, env }) {
  const model = env.OPENAI_IMAGE_MODEL || DEFAULT_MODELS.openaiImage;
  return {
    id: "openai",
    label: "OpenAI images",
    nativeAspects: true,
    async generateImage({ dest, prompt, aspect }) {
      if (!key) missingKey("OpenAI");
      const payload = await callProvider({
        url: "https://api.openai.com/v1/images/generations",
        key,
        fetchImpl,
        headers: { authorization: `Bearer ${key}` },
        body: {
          model,
          prompt,
          size: openAiSize(aspect),
          quality: "medium",
          output_format: "png",
          n: 1,
        },
      });
      const row = payload?.data?.[0] || {};
      if (row.b64_json) writeBase64(dest, row.b64_json);
      else if (row.url) await downloadUrl(row.url, dest, { fetchImpl, key });
      else throw mcpError("media_provider", "OpenAI did not return an image.");
      return { status: "succeeded", model, dest };
    },
    async generateVideo() {
      throw mcpError(
        "media_provider",
        "The OpenAI image adapter does not generate video. Use Google, xAI, Replicate, or fal for video, or attach your own file.",
      );
    },
  };
}

function createGoogle({ key, fetchImpl, env }) {
  const imageModel = env.GEMINI_IMAGE_MODEL || DEFAULT_MODELS.googleImage;
  const videoModel = env.GEMINI_VIDEO_MODEL || DEFAULT_MODELS.googleVideo;
  return {
    id: "google",
    label: "Google Imagen / Veo",
    nativeAspects: true,
    async generateImage({ dest, prompt, aspect }) {
      if (!key) missingKey("Google Gemini");
      const payload = await callProvider({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict`,
        key,
        fetchImpl,
        headers: { "x-goog-api-key": key },
        body: { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: aspect } },
      });
      const b64 = payload?.predictions?.[0]?.bytesBase64Encoded || payload?.generatedImages?.[0]?.image?.imageBytes;
      if (!b64) throw mcpError("media_provider", "Google did not return an image.");
      writeBase64(dest, b64);
      return { status: "succeeded", model: imageModel, dest };
    },
    async generateVideo({ dest, prompt, aspect, duration }) {
      if (!key) missingKey("Google Gemini");
      const started = await callProvider({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${videoModel}:predictLongRunning`,
        key,
        fetchImpl,
        headers: { "x-goog-api-key": key },
        body: {
          instances: [{ prompt }],
          parameters: {
            aspectRatio: aspect,
            durationSeconds: Math.round(duration || 8),
            generateAudio: false,
          },
        },
      });
      if (started?.predictions?.[0]?.bytesBase64Encoded) {
        writeBase64(dest, started.predictions[0].bytesBase64Encoded);
        return { status: "succeeded", model: videoModel, dest };
      }
      const name = started?.name;
      if (!name) throw mcpError("media_provider", "Google did not return a video operation.");
      return { status: "running", model: videoModel, jobId: name, dest, key };
    },
    async poll(job) {
      const payload = await callProvider({
        url: `https://generativelanguage.googleapis.com/v1beta/${job.jobId}`,
        key: job.key,
        fetchImpl,
        headers: { "x-goog-api-key": job.key },
        method: "GET",
      });
      if (!payload?.done) return { ...job, status: "running" };
      const b64 = payload?.response?.predictions?.[0]?.bytesBase64Encoded;
      if (b64) {
        writeBase64(job.dest, b64);
        return { ...job, status: "succeeded" };
      }
      const uri = videoUri(payload);
      if (!uri) throw mcpError("media_provider", "Google finished without a video file.");
      await downloadUrl(uri, job.dest, { fetchImpl, key: job.key, headers: { "x-goog-api-key": job.key } });
      return { ...job, status: "succeeded" };
    },
  };
}

function createXai({ key, fetchImpl, env }) {
  const imageModel = env.XAI_IMAGE_MODEL || DEFAULT_MODELS.xaiImage;
  const videoModel = env.XAI_VIDEO_MODEL || DEFAULT_MODELS.xaiVideo;
  return {
    id: "xai",
    label: "xAI Grok Imagine",
    nativeAspects: true,
    async generateImage({ dest, prompt, aspect }) {
      if (!key) missingKey("xAI");
      const payload = await callProvider({
        url: "https://api.x.ai/v1/images/generations",
        key,
        fetchImpl,
        headers: { authorization: `Bearer ${key}` },
        body: { model: imageModel, prompt, n: 1, response_format: "b64_json", aspect_ratio: aspect },
      });
      const row = payload?.data?.[0] || {};
      if (row.b64_json) writeBase64(dest, row.b64_json);
      else if (row.url) await downloadUrl(row.url, dest, { fetchImpl, key, headers: { authorization: `Bearer ${key}` } });
      else throw mcpError("media_provider", "xAI did not return an image.");
      return { status: "succeeded", model: imageModel, dest };
    },
    async generateVideo({ dest, prompt, aspect, duration }) {
      if (!key) missingKey("xAI");
      const payload = await callProvider({
        url: "https://api.x.ai/v1/videos/generations",
        key,
        fetchImpl,
        headers: { authorization: `Bearer ${key}` },
        body: {
          model: videoModel,
          prompt,
          duration: Math.round(duration || 4),
          aspect_ratio: aspect,
          audio: false,
        },
      });
      const row = payload?.data?.[0] || payload;
      if (row.b64_json) {
        writeBase64(dest, row.b64_json);
        return { status: "succeeded", model: videoModel, dest };
      }
      const url = row.url || videoUri(payload);
      if (url && String(url).startsWith("http")) {
        await downloadUrl(url, dest, { fetchImpl, key, headers: { authorization: `Bearer ${key}` } });
        return { status: "succeeded", model: videoModel, dest };
      }
      const jobId = payload?.id || payload?.request_id;
      if (!jobId) throw mcpError("media_provider", "xAI did not return a video.");
      return { status: "running", model: videoModel, jobId, dest, key };
    },
    async poll(job) {
      const payload = await callProvider({
        url: `https://api.x.ai/v1/videos/${job.jobId}`,
        key: job.key,
        fetchImpl,
        headers: { authorization: `Bearer ${job.key}` },
        method: "GET",
      });
      const status = String(payload?.status || "").toLowerCase();
      if (status && status !== "succeeded" && status !== "completed" && status !== "done") {
        if (status === "failed") throw mcpError("media_provider", "xAI video generation failed.");
        return { ...job, status: "running" };
      }
      const url = payload?.url || payload?.data?.[0]?.url || videoUri(payload);
      if (!url) throw mcpError("media_provider", "xAI finished without a video file.");
      await downloadUrl(url, job.dest, { fetchImpl, key: job.key, headers: { authorization: `Bearer ${job.key}` } });
      return { ...job, status: "succeeded" };
    },
  };
}

function createHosted({ id, key, fetchImpl, model }) {
  const isFal = id === "fal";
  if (!model) {
    const which = isFal ? "FAL_IMAGE_MODEL or FAL_VIDEO_MODEL" : "REPLICATE_IMAGE_MODEL or REPLICATE_VIDEO_MODEL";
    throw mcpError("missing_model", `Set ${which} to the model id. PostPath does not pick a paid model for you.`);
  }
  async function start({ dest, prompt, aspect, duration }, type) {
      if (!key) missingKey(isFal ? "fal" : "Replicate");
      const input = {
        prompt,
        aspect_ratio: aspect,
        ...(type === "video" ? { duration: Math.round(duration || 4), generate_audio: false, audio: false } : {}),
      };
      if (isFal) {
        const payload = await callProvider({
          url: `https://queue.fal.run/${model}`,
          key,
          fetchImpl,
          headers: { authorization: `Key ${key}` },
          body: input,
        });
        const immediate = payload?.images?.[0]?.url || payload?.video?.url || payload?.image?.url;
        if (immediate) {
          await downloadUrl(immediate, dest, { fetchImpl, key });
          return { status: "succeeded", model, dest };
        }
        const jobId = payload?.request_id;
        if (!jobId) throw mcpError("media_provider", "fal did not return a request id.");
        return { status: "running", model, jobId, dest, key };
      }
      const payload = await callProvider({
        url: `https://api.replicate.com/v1/models/${model}/predictions`,
        key,
        fetchImpl,
        headers: { authorization: `Bearer ${key}`, prefer: "wait=5" },
        body: { input },
      });
      if (payload?.status === "succeeded") {
        const url = videoUri(payload);
        if (!url) throw mcpError("media_provider", "Replicate finished without a file.");
        await downloadUrl(url, dest, { fetchImpl, key, headers: { authorization: `Bearer ${key}` } });
        return { status: "succeeded", model, dest };
      }
      if (!payload?.id) throw mcpError("media_provider", "Replicate did not return a prediction id.");
      return { status: "running", model, jobId: payload.id, dest, key };
    }
  return {
    id,
    label: isFal ? "fal" : "Replicate",
    nativeAspects: true,
    model,
    generateImage(request) {
      return start(request, "image");
    },
    generateVideo(request) {
      return start(request, "video");
    },
    async poll(job) {
      if (isFal) {
        const status = await callProvider({
          url: `https://queue.fal.run/${job.model}/requests/${job.jobId}/status`,
          key: job.key,
          fetchImpl,
          headers: { authorization: `Key ${job.key}` },
          method: "GET",
        });
        const state = String(status?.status || "").toUpperCase();
        if (state && state !== "COMPLETED") {
          if (state === "FAILED") throw mcpError("media_provider", "fal generation failed.");
          return { ...job, status: "running" };
        }
        const result = await callProvider({
          url: `https://queue.fal.run/${job.model}/requests/${job.jobId}`,
          key: job.key,
          fetchImpl,
          headers: { authorization: `Key ${job.key}` },
          method: "GET",
        });
        const url = result?.images?.[0]?.url || result?.video?.url || result?.image?.url || videoUri(result);
        if (!url) throw mcpError("media_provider", "fal finished without a file.");
        await downloadUrl(url, job.dest, { fetchImpl, key: job.key });
        return { ...job, status: "succeeded" };
      }
      const payload = await callProvider({
        url: `https://api.replicate.com/v1/predictions/${job.jobId}`,
        key: job.key,
        fetchImpl,
        headers: { authorization: `Bearer ${job.key}` },
        method: "GET",
      });
      if (payload?.status === "failed" || payload?.status === "canceled") {
        throw mcpError("media_provider", "Replicate generation failed.");
      }
      if (payload?.status !== "succeeded") return { ...job, status: "running" };
      const url = videoUri(payload);
      if (!url) throw mcpError("media_provider", "Replicate finished without a file.");
      await downloadUrl(url, job.dest, { fetchImpl, key: job.key, headers: { authorization: `Bearer ${job.key}` } });
      return { ...job, status: "succeeded" };
    },
  };
}

export function createMediaProvider(id, { keys = {}, fetchImpl = fetch, env = process.env, model } = {}) {
  if (id === "mock") return createMock();
  if (id === "openai") return createOpenAI({ key: keys.openai || "", fetchImpl, env });
  if (id === "google") return createGoogle({ key: keys.google || "", fetchImpl, env });
  if (id === "xai") return createXai({ key: keys.xai || "", fetchImpl, env });
  if (id === "replicate") {
    return {
      image: () => createHosted({ id, key: keys.replicate || "", fetchImpl, model: model || env.REPLICATE_IMAGE_MODEL }),
      video: () => createHosted({ id, key: keys.replicate || "", fetchImpl, model: model || env.REPLICATE_VIDEO_MODEL }),
    };
  }
  if (id === "fal") {
    return {
      image: () => createHosted({ id, key: keys.fal || "", fetchImpl, model: model || env.FAL_IMAGE_MODEL }),
      video: () => createHosted({ id, key: keys.fal || "", fetchImpl, model: model || env.FAL_VIDEO_MODEL }),
    };
  }
  throw mcpError("unknown_provider", "Choose a media provider, or use your own file.");
}

export async function generateToFile(provider, request) {
  const active = provider.image && provider.video ? (request.type === "video" ? provider.video() : provider.image()) : provider;
  const next = request.type === "video" && !String(request.prompt || "").includes("Silent video only")
    ? { ...request, prompt: `${request.prompt}. ${SILENT_VIDEO_NOTE}` }
    : request;
  let state = next.type === "video" ? await active.generateVideo(next) : await active.generateImage(next);
  let spins = 0;
  while (state.status === "running" || state.status === "queued") {
    spins += 1;
    if (spins > 40) throw mcpError("media_provider", "Generation is still running. It was not attached.");
    if (request.sleep) await request.sleep(250);
    state = await active.poll(state);
  }
  return state;
}

export { deriveImage };
