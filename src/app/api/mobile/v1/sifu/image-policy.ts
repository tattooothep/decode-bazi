export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

export type MobileSifuImageInspection = {
  present: boolean;
  tooLarge: boolean;
  invalid: boolean;
};

export function inspectMobileSifuImage(body: Record<string, unknown>): MobileSifuImageInspection {
  const hasBase64 = body.image_base64 !== undefined && body.image_base64 !== null && body.image_base64 !== "";
  const hasUrl = body.image_url !== undefined && body.image_url !== null && body.image_url !== "";
  if (!hasBase64 && !hasUrl) return { present: false, tooLarge: false, invalid: false };
  if ((hasBase64 && typeof body.image_base64 !== "string") || (hasUrl && typeof body.image_url !== "string")) {
    return { present: true, tooLarge: false, invalid: true };
  }

  const encoded = typeof body.image_base64 === "string"
    ? body.image_base64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "")
    : "";
  const estimatedBytes = Math.floor((encoded.length * 3) / 4);
  return { present: true, tooLarge: estimatedBytes > MAX_INLINE_IMAGE_BYTES, invalid: false };
}

export function mobileSifuStreamPolicy(wantsStream: boolean): { stream: boolean; noCache?: true } {
  return wantsStream ? { stream: true, noCache: true } : { stream: false };
}
