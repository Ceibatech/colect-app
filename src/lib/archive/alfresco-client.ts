import "server-only";

const ALFRESCO_API_PATH = "/api/-default-/public/alfresco/versions/1";
const DEFAULT_NODE_TYPE = "arc:archiveDocument";
const DEFAULT_CLASSIFICATION = "INTERNAL";
const REQUEST_TIMEOUT_MS = 60_000;

interface AlfrescoConfig {
  apiUrl: string;
  username: string;
  password: string;
  rootNodeId: string;
  webUrl?: string;
  nodeType: string;
  classification: string;
}

interface AlfrescoEntry {
  id: string;
  name: string;
  isFile?: boolean;
  isFolder?: boolean;
}

interface AlfrescoEntryResponse {
  entry: AlfrescoEntry;
}

interface AlfrescoListResponse {
  list: {
    entries: Array<{ entry: AlfrescoEntry }>;
  };
}

export interface AlfrescoArchiveInput {
  dossierReference: string;
  documentId: number;
  originalName: string;
  title?: string | null;
  businessReference: string;
  classificationPath?: string | null;
  hash: string;
  contentType: string;
  buffer: Buffer;
}

export interface AlfrescoArchiveResult {
  nodeId: string;
  webUrl?: string;
}

export class AlfrescoArchiveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AlfrescoArchiveError";
  }
}

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AlfrescoArchiveError(`La variable ${name} est requise.`);
  return value;
}

function getConfig(): AlfrescoConfig {
  return {
    apiUrl: requireValue("ALFRESCO_API_URL").replace(/\/+$/, ""),
    username: requireValue("ALFRESCO_USERNAME"),
    password: requireValue("ALFRESCO_PASSWORD"),
    rootNodeId: process.env.ALFRESCO_ROOT_NODE_ID?.trim() || "-my-",
    webUrl: process.env.ALFRESCO_WEB_URL?.trim().replace(/\/+$/, "") || undefined,
    nodeType: process.env.ALFRESCO_NODE_TYPE?.trim() || DEFAULT_NODE_TYPE,
    classification: process.env.ALFRESCO_CLASSIFICATION?.trim() || DEFAULT_CLASSIFICATION,
  };
}

export function sanitizeAlfrescoName(value: string, fallback = "document"): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .slice(0, 180)
    .trim();
  return sanitized || fallback;
}

function encodedNodeId(nodeId: string): string {
  return encodeURIComponent(nodeId);
}

export class AlfrescoArchiveClient {
  private readonly config = getConfig();

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
    );

    let response: Response;
    try {
      response = await fetch(`${this.config.apiUrl}${ALFRESCO_API_PATH}${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "connexion impossible";
      throw new AlfrescoArchiveError(`Alfresco est indisponible : ${message}`);
    }

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      const detail = payload.slice(0, 300).replace(/\s+/g, " ").trim();
      throw new AlfrescoArchiveError(
        `Alfresco a répondu ${response.status}${detail ? ` : ${detail}` : ""}.`,
        response.status,
      );
    }
    return response;
  }

  private async listChildren(parentNodeId: string): Promise<AlfrescoEntry[]> {
    const response = await this.request(
      `/nodes/${encodedNodeId(parentNodeId)}/children?skipCount=0&maxItems=1000`,
    );
    const payload = (await response.json()) as AlfrescoListResponse;
    return payload.list.entries.map(({ entry }) => entry);
  }

  private async ensureFolder(parentNodeId: string, requestedName: string): Promise<AlfrescoEntry> {
    const folderName = sanitizeAlfrescoName(requestedName, "Dossier");
    const children = await this.listChildren(parentNodeId);
    const existing = children.find((entry) => entry.isFolder && entry.name === folderName);
    if (existing) return existing;

    try {
      const response = await this.request(`/nodes/${encodedNodeId(parentNodeId)}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, nodeType: "cm:folder" }),
      });
      return ((await response.json()) as AlfrescoEntryResponse).entry;
    } catch (error) {
      if (!(error instanceof AlfrescoArchiveError) || error.status !== 409) throw error;
      const refreshed = await this.listChildren(parentNodeId);
      const concurrent = refreshed.find((entry) => entry.isFolder && entry.name === folderName);
      if (!concurrent) throw error;
      return concurrent;
    }
  }

  private async ensureDossierFolder(dossierReference: string, classificationPath?: string | null): Promise<AlfrescoEntry> {
    const segments = classificationPath
      ?.split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!segments?.length) return this.ensureFolder(this.config.rootNodeId, `Dossier-${dossierReference}`);

    let parentNodeId = this.config.rootNodeId;
    let folder: AlfrescoEntry | null = null;
    for (const segment of segments) {
      folder = await this.ensureFolder(parentNodeId, segment);
      parentNodeId = folder.id;
    }
    return folder ?? this.ensureFolder(this.config.rootNodeId, `Dossier-${dossierReference}`);
  }

  private documentWebUrl(nodeId: string): string | undefined {
    if (!this.config.webUrl) return undefined;
    const nodeRef = encodeURIComponent(`workspace://SpacesStore/${nodeId}`);
    return `${this.config.webUrl}/share/page/document-details?nodeRef=${nodeRef}`;
  }

  async archiveDocument(input: AlfrescoArchiveInput): Promise<AlfrescoArchiveResult> {
    const folder = await this.ensureDossierFolder(input.dossierReference, input.classificationPath);
    const fileName = sanitizeAlfrescoName(
      `${input.documentId}-${input.hash.slice(0, 12)}-${input.originalName}`,
      `document-${input.documentId}`,
    );
    const children = await this.listChildren(folder.id);
    const existing = children.find((entry) => entry.isFile && entry.name === fileName);
    if (existing) {
      return { nodeId: existing.id, webUrl: this.documentWebUrl(existing.id) };
    }

    const properties: Record<string, string> = {
      "cm:title": input.title?.trim() || input.originalName,
      "cm:description": `Versement GeoArchives ${input.businessReference}`,
    };
    if (this.config.nodeType === DEFAULT_NODE_TYPE) {
      properties["arc:classification"] = this.config.classification;
      properties["arc:businessReference"] = input.businessReference;
    }

    const formData = new FormData();
    formData.set("name", fileName);
    formData.set("nodeType", this.config.nodeType);
    formData.set("autoRename", "false");
    formData.set("properties", JSON.stringify(properties));
    formData.set(
      "filedata",
      new Blob([new Uint8Array(input.buffer)], { type: input.contentType || "application/octet-stream" }),
      fileName,
    );

    const response = await this.request(`/nodes/${encodedNodeId(folder.id)}/children`, {
      method: "POST",
      body: formData,
    });
    const entry = ((await response.json()) as AlfrescoEntryResponse).entry;
    return { nodeId: entry.id, webUrl: this.documentWebUrl(entry.id) };
  }
}

export function isAlfrescoDigitalArchiveEnabled(): boolean {
  return (process.env.ARCHIVE_STORAGE_PROVIDER ?? "").trim().toLowerCase() === "alfresco";
}
