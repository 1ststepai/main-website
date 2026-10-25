import { unimplementedPublisher } from "./unimplemented.js";
import { publishYouTubeSlice } from "./youtube.js";
import { socialError } from "../errors.js";

export const publishers = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    implemented: true,
    publishSlice: publishYouTubeSlice,
  },
  instagram: unimplementedPublisher("instagram"),
  facebook: unimplementedPublisher("facebook"),
  tiktok: unimplementedPublisher("tiktok"),
  x: unimplementedPublisher("x"),
};

export function publisherFor(platform) {
  const publisher = publishers[platform];
  if (!publisher) throw socialError(400, "unsupported_platform", "Platform is not supported.");
  return publisher;
}
