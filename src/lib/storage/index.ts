import "server-only";
import type { StorageProvider } from "@/lib/storage/storage-provider";
import type { StorageProvider as PrismaStorageProvider } from "@prisma/client";
import { LocalStorageProvider } from "@/lib/storage/local-storage-provider";
import { SharePointStorageProvider } from "@/lib/storage/sharepoint-storage-provider";

/**
 * Point d'extension unique : ajouter un `case "s3":` (ou `"cpanel"`) ici
 * quand un provider externe est implémenté, piloté par `STORAGE_PROVIDER`.
 * Aucun autre fichier n'a besoin de changer (voir `storage-provider.ts`).
 */
export function getConfiguredStorageProviderKind(): "LOCAL" | "SHAREPOINT" {
  const kind = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  switch (kind) {
    case "local":
      return "LOCAL";
    case "sharepoint":
      return "SHAREPOINT";
    default:
      throw new Error(`Provider de stockage inconnu : "${kind}".`);
  }
}

export function getStorageProvider(kind?: PrismaStorageProvider): StorageProvider {
  const resolvedKind = kind ?? getConfiguredStorageProviderKind();
  switch (resolvedKind) {
    case "LOCAL":
      return new LocalStorageProvider();
    case "SHAREPOINT":
      return new SharePointStorageProvider();
    default:
      throw new Error(`Provider de stockage non implémenté : "${resolvedKind}".`);
  }
}

export type { StorageProvider, StorageReference, StoredFile } from "@/lib/storage/storage-provider";
