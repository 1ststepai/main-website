import { execFile } from "node:child_process";
import { renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { mcpError } from "../errors.js";

const exec = promisify(execFile);

const IMAGE_CODECS = new Set(["png", "mjpeg", "jpeg", "webp", "gif", "bmp"]);

export async function probeMedia(file) {
  let stdout = "";
  try {
    const result = await exec("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], {
      timeout: 20000,
    });
    stdout = result.stdout;
  } catch (error) {
    throw mcpError("media_probe", `Could not read the media file. ${error?.message || ""}`.trim());
  }
  const data = JSON.parse(stdout || "{}");
  const streams = data.streams || [];
  const visual = streams.find((row) => row.codec_type === "video") || streams.find((row) => row.width && row.height);
  const audio = streams.filter((row) => row.codec_type === "audio");
  const codec = String(visual?.codec_name || "");
  const duration = Number(data.format?.duration || visual?.duration || 0);
  const image = IMAGE_CODECS.has(codec) || (codec && duration < 0.05 && !audio.length && /png|jpe?g|webp|image/.test(codec));
  return {
    width: Number(visual?.width || 0),
    height: Number(visual?.height || 0),
    duration: Number.isFinite(duration) ? duration : 0,
    hasAudio: audio.length > 0,
    video: Boolean(visual) && !image,
    image: Boolean(image),
    codec,
  };
}

export async function stripAudio(file) {
  const tmp = join(dirname(file), `.silent-${basename(file)}`);
  try {
    await exec("ffmpeg", ["-y", "-i", file, "-map", "0:v:0", "-an", "-c:v", "copy", tmp], { timeout: 120000 });
  } catch {
    await exec(
      "ffmpeg",
      ["-y", "-i", file, "-map", "0:v:0", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", tmp],
      { timeout: 120000 },
    );
  }
  const probe = await probeMedia(tmp);
  if (probe.hasAudio) {
    rmSync(tmp, { force: true });
    throw mcpError("audio_present", "Generated video still has audio after stripping. It was not attached.");
  }
  renameSync(tmp, file);
  return probe;
}
