import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlfrescoArchiveClient, sanitizeAlfrescoName } from "@/lib/archive/alfresco-client";

const ENV_KEYS = [
  "ALFRESCO_API_URL",
  "ALFRESCO_USERNAME",
  "ALFRESCO_PASSWORD",
  "ALFRESCO_ROOT_NODE_ID",
  "ALFRESCO_WEB_URL",
  "ALFRESCO_NODE_TYPE",
  "ALFRESCO_CLASSIFICATION",
] as const;

describe("Alfresco archive client", () => {
  beforeEach(() => {
    process.env.ALFRESCO_API_URL = "https://archive.example.test/alfresco";
    process.env.ALFRESCO_USERNAME = "geoarchives-service";
    process.env.ALFRESCO_PASSWORD = "test-password";
    process.env.ALFRESCO_ROOT_NODE_ID = "root-node";
    process.env.ALFRESCO_WEB_URL = "https://archive.example.test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("normalizes names rejected by Alfresco", () => {
    expect(sanitizeAlfrescoName(' Bordereau: lot/12 <final>?.pdf ')).toBe(
      "Bordereau- lot-12 -final-.pdf",
    );
    expect(sanitizeAlfrescoName("... ")).toBe("document");
  });

  it("creates a dossier folder and archives a document with business metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ list: { entries: [] } }))
      .mockResolvedValueOnce(Response.json({ entry: { id: "folder-1", name: "Dossier-DOS-2026-1", isFolder: true } }))
      .mockResolvedValueOnce(Response.json({ list: { entries: [] } }))
      .mockResolvedValueOnce(Response.json({ entry: { id: "node-1", name: "7-abc123-document.pdf", isFile: true } }));

    const client = new AlfrescoArchiveClient();
    const result = await client.archiveDocument({
      dossierReference: "DOS-2026-1",
      documentId: 7,
      originalName: "document.pdf",
      title: "Titre foncier",
      businessReference: "DOS-2026-1/TF-44",
      hash: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd",
      contentType: "application/pdf",
      buffer: Buffer.from("pdf"),
    });

    expect(result).toEqual({
      nodeId: "node-1",
      webUrl: "https://archive.example.test/share/page/document-details?nodeRef=workspace%3A%2F%2FSpacesStore%2Fnode-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const folderRequest = fetchMock.mock.calls[1];
    expect(folderRequest?.[0]).toContain("/nodes/root-node/children");
    expect(folderRequest?.[1]?.method).toBe("POST");

    const uploadRequest = fetchMock.mock.calls[3];
    expect(uploadRequest?.[0]).toContain("/nodes/folder-1/children");
    const formData = uploadRequest?.[1]?.body as FormData;
    expect(formData.get("nodeType")).toBe("arc:archiveDocument");
    expect(JSON.parse(String(formData.get("properties")))).toMatchObject({
      "arc:classification": "INTERNAL",
      "arc:businessReference": "DOS-2026-1/TF-44",
    });
    expect(new Headers(uploadRequest?.[1]?.headers).get("Authorization")).toMatch(/^Basic /);
  });

  it("reuses the deterministic Alfresco node when a retry finds it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({
        list: { entries: [{ entry: { id: "folder-1", name: "Dossier-DOS-1", isFolder: true } }] },
      }))
      .mockResolvedValueOnce(Response.json({
        list: { entries: [{ entry: { id: "node-existing", name: "3-deadbeefdead-scan.pdf", isFile: true } }] },
      }));

    const client = new AlfrescoArchiveClient();
    const result = await client.archiveDocument({
      dossierReference: "DOS-1",
      documentId: 3,
      originalName: "scan.pdf",
      businessReference: "DOS-1/DOC-3",
      hash: "deadbeefdead0000000000000000000000000000000000000000000000000000",
      contentType: "application/pdf",
      buffer: Buffer.from("pdf"),
    });

    expect(result.nodeId).toBe("node-existing");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
