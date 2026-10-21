import "server-only";

/**
 * Abstraction de stockage de fichiers (§22/§56) : les métadonnées vivent
 * toujours dans `documents` (base MySQL), jamais le contenu binaire. Cette
 * interface permet de brancher un stockage externe (S3-compatible, cPanel)
 * sans changer le code appelant — seul `getStorageProvider()` (index.ts)
 * change d'implémentation.
 */
export interface StorageProvider {
  readonly kind: "LOCAL" | "SHAREPOINT";
  /** Enregistre le fichier sous la clé donnée et retourne l'URL/référence à stocker en base. */
  save(key: string, buffer: Buffer, options?: { contentType?: string }): Promise<StoredFile>;
  /** Relit le contenu d'un fichier précédemment enregistré. */
  read(reference: StorageReference): Promise<Buffer>;
  /** Supprime un fichier. Ne doit pas lever si le fichier est déjà absent. */
  remove(reference: StorageReference): Promise<void>;
}

export interface StoredFile {
  url: string;
  externalDriveId?: string;
  externalItemId?: string;
  externalWebUrl?: string;
}

export interface StorageReference {
  key: string;
  externalDriveId?: string | null;
  externalItemId?: string | null;
}
