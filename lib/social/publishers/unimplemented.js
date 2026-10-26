import { socialError } from "../errors.js";

export function unimplementedPublisher(platform) {
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  return {
    id: platform,
    label,
    implemented: false,
    mode: "unimplemented",
    directPost: false,
    async publishSlice() {
      throw socialError(501, "publisher_not_implemented", `${label} publishing is not implemented.`);
    },
  };
}
