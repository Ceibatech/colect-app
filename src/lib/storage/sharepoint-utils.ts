export function encodeSharePointSharingUrl(url: string) {
  return `u!${Buffer.from(url, "utf8").toString("base64url")}`;
}

export function sanitizeSharePointName(value: string) {
  const sanitized = value
    .normalize("NFKC")
    .replace(/["*:<>?/\\|#%]/g, "-")
    .replace(/\s*-+\s*/g, "-")
    .replace(/-+(?=\.)/g, "")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized.slice(0, 120) || "document";
}
