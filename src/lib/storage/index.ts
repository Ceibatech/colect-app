import "server-only";
import type { StorageProvider } from "@/lib/storage/storage-provider";
import { LocalStorageProvider } from "@/lib/storage/local-storage-provider";

/**
 * Point d'extension unique : ajouter un `case "s3":` (ou `"cpanel"`) ici
 * quand un provider externe est implémenté, piloté par `STORAGE_PROVIDER`.
 * Aucun autre fichier n'a besoin de changer (voir `storage-provider.ts`).
 */
export function getStorageProvider(): StorageProvider {
  const kind = process.env.STORAGE_PROVIDER ?? "local";
  switch (kind) {
    case "local":
      return new LocalStorageProvider();
    default:
      throw new Error(`Provider de stockage inconnu : "${kind}". Seul "local" est implémenté en V1.`);
  }
}

export type { StorageProvider } from "@/lib/storage/storage-provider";
