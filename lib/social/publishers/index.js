import { unimplementedPublisher } from "./unimplemented.js";
import { publishYouTubeSlice } from "./youtube.js";
import { publishInstagramSlice } from "./instagram.js";
import { publishFacebookSlice } from "./facebook.js";
import { publishTikTokSlice } from "./tiktok.js";
import { socialError } from "../errors.js";

export const publishers = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    implemented: true,
    mode: "direct",
    publishSlice: publishYouTubeSlice,
  },
  instagram: {
    id: "instagram",
    label: "Instagram Reels",
    implemented: true,
    mode: "direct",
    directPost: true,
    privateDraft: false,
    publishSlice: publishInstagramSlice,
  },
  facebook: {
    id: "facebook",
    label: "Facebook Page",
    implemented: true,
    mode: "page_reel",
    directPost: true,
    privateDraft: true,
    publishSlice: publishFacebookSlice,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    implemented: true,
    mode: "inbox_handoff",
    directPost: false,
    publishSlice: publishTikTokSlice,
  },
  x: unimplementedPublisher("x"),
};

export function publisherFor(platform) {
  const publisher = publishers[platform];
  if (!publisher) throw socialError(400, "unsupported_platform", "Platform is not supported.");
  return publisher;
}
