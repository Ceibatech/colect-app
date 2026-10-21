import "server-only";

import path from "node:path";
import type { StorageProvider, StorageReference, StoredFile } from "@/lib/storage/storage-provider";
import { encodeSharePointSharingUrl, sanitizeSharePointName } from "@/lib/storage/sharepoint-utils";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const TOKEN_SCOPE = "https://graph.microsoft.com/.default";

interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId?: string;
  folderItemId?: string;
  sharedFolderUrl?: string;
}

interface DriveItemResponse {
  id: string;
  name: string;
  webUrl?: string;
  parentReference?: { driveId?: string };
}

let tokenCache: { value: string; expiresAt: number } | null = null;
let folderCache: { key: string; driveId: string; itemId: string; webUrl?: string } | null = null;

export class SharePointStorageError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SharePointStorageError";
  }
}

function getConfig(): SharePointConfig {
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim();
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const driveId = process.env.SHAREPOINT_DRIVE_ID?.trim();
  const folderItemId = process.env.SHAREPOINT_FOLDER_ITEM_ID?.trim();
  const sharedFolderUrl = process.env.SHAREPOINT_SHARED_FOLDER_URL?.trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw new SharePointStorageError("Configuration Microsoft Graph incomplète.");
  }
  if ((!driveId || !folderItemId) && !sharedFolderUrl) {
    throw new SharePointStorageError("Dossier SharePoint non configuré.");
  }
  return { tenantId, clientId, clientSecret, driveId, folderItemId, sharedFolderUrl };
}

async function getAccessToken(config: SharePointConfig) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: TOKEN_SCOPE,
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new SharePointStorageError(`Authentification Microsoft Graph refusée (${response.status}).`, response.status);
  }
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new SharePointStorageError("Jeton Microsoft Graph manquant.");
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(300, data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.value;
}

async function graphFetch(endpoint: string, init: RequestInit = {}) {
  const config = getConfig();
  const token = await getAccessToken(config);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${GRAPH_ROOT}${endpoint}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const requestId = response.headers.get("request-id");
    throw new SharePointStorageError(
      `Microsoft Graph a refusé l'opération (${response.status}${requestId ? `, requête ${requestId}` : ""}).`,
      response.status,
    );
  }
  return response;
}

async function resolveRootFolder() {
  const config = getConfig();
  const cacheKey = `${config.driveId ?? ""}:${config.folderItemId ?? ""}:${config.sharedFolderUrl ?? ""}`;
  if (folderCache?.key === cacheKey) return folderCache;

  if (config.driveId && config.folderItemId) {
    folderCache = { key: cacheKey, driveId: config.driveId, itemId: config.folderItemId };
    return folderCache;
  }

  const shareToken = encodeSharePointSharingUrl(config.sharedFolderUrl!);
  const response = await graphFetch(`/shares/${shareToken}/driveItem?$select=id,name,webUrl,parentReference`);
  const item = await response.json() as DriveItemResponse;
  const driveId = item.parentReference?.driveId;
  if (!item.id || !driveId) throw new SharePointStorageError("Le lien partagé ne désigne pas un dossier SharePoint exploitable.");
  folderCache = { key: cacheKey, driveId, itemId: item.id, webUrl: item.webUrl };
  return folderCache;
}

async function ensureChildFolder(driveId: string, parentItemId: string, rawName: string) {
  const name = sanitizeSharePointName(rawName);
  try {
    const response = await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    return await response.json() as DriveItemResponse;
  } catch (error) {
    if (!(error instanceof SharePointStorageError) || error.status !== 409) throw error;
    const response = await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(name)}?$select=id,name,webUrl,parentReference`);
    return await response.json() as DriveItemResponse;
  }
}

function requireExternalReference(reference: StorageReference) {
  if (!reference.externalDriveId || !reference.externalItemId) {
    throw new SharePointStorageError("Référence SharePoint incomplète.");
  }
  return { driveId: reference.externalDriveId, itemId: reference.externalItemId };
}

export class SharePointStorageProvider implements StorageProvider {
  readonly kind = "SHAREPOINT" as const;

  async save(key: string, buffer: Buffer, options?: { contentType?: string }): Promise<StoredFile> {
    const root = await resolveRootFolder();
    const dossierFolder = await ensureChildFolder(root.driveId, root.itemId, `Dossier-${path.dirname(key)}`);
    const filename = sanitizeSharePointName(path.basename(key));
    const response = await graphFetch(
      `/drives/${encodeURIComponent(root.driveId)}/items/${encodeURIComponent(dossierFolder.id)}:/${encodeURIComponent(filename)}:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": options?.contentType ?? "application/octet-stream" },
        body: new Uint8Array(buffer),
      },
    );
    const item = await response.json() as DriveItemResponse;
    if (!item.id) throw new SharePointStorageError("Microsoft Graph n'a pas retourné l'identifiant du document.");
    return {
      url: item.webUrl ?? root.webUrl ?? "",
      externalDriveId: root.driveId,
      externalItemId: item.id,
      externalWebUrl: item.webUrl,
    };
  }

  async read(reference: StorageReference): Promise<Buffer> {
    const { driveId, itemId } = requireExternalReference(reference);
    const response = await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`);
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(reference: StorageReference): Promise<void> {
    const { driveId, itemId } = requireExternalReference(reference);
    try {
      await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof SharePointStorageError && error.status === 404) return;
      throw error;
    }
  }
}
