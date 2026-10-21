import { describe, expect, it } from "vitest";
import { encodeSharePointSharingUrl, sanitizeSharePointName } from "@/lib/storage/sharepoint-utils";

describe("SharePoint storage helpers", () => {
  it("encodes a sharing URL using the Microsoft Graph u! format", () => {
    const url = "https://ceibaanalytics800.sharepoint.com/:f:/s/CEIBAProjects/folder?e=token";
    const encoded = encodeSharePointSharingUrl(url);

    expect(encoded.startsWith("u!")).toBe(true);
    expect(encoded).not.toMatch(/[+/=]/);

    const base64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    expect(Buffer.from(base64 + padding, "base64").toString("utf8")).toBe(url);
  });

  it("removes characters SharePoint rejects from file and folder names", () => {
    expect(sanitizeSharePointName('  Bordereau #12: lot/archives?.pdf  ')).toBe("Bordereau-12-lot-archives.pdf");
    expect(sanitizeSharePointName("... ")).toBe("document");
  });
});
