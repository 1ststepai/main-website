import { runFfmpeg } from "./audio.js";

export async function deriveImage(source, dest, spec) {
  const sharp = (await import("sharp")).default;
  await sharp(source)
    .rotate()
    .resize(spec.width, spec.height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 86 })
    .toFile(dest);
}

export async function deriveVideo(source, dest, spec, duration) {
  const vf = `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height}`;
  const args = ["-y", "-i", source, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];
  if (duration) args.push("-t", String(duration));
  args.push(dest);
  await runFfmpeg(args, { timeout: 180000 });
}

export async function writeSilentVideo(dest, { width, height, duration }) {
  await runFfmpeg(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x10233a:s=${width}x${height}:d=${duration}`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      dest,
    ],
    { timeout: 180000 },
  );
}
