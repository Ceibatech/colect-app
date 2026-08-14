import "server-only";

/**
 * Abstraction de stockage de fichiers (§22/§56) : les métadonnées vivent
 * toujours dans `documents` (base MySQL), jamais le contenu binaire. Cette
 * interface permet de brancher un stockage externe (S3-compatible, cPanel)
 * sans changer le code appelant — seul `getStorageProvider()` (index.ts)
 * change d'implémentation.
 */
export interface StorageProvider {
  /** Enregistre le fichier sous la clé donnée et retourne l'URL/référence à stocker en base. */
  save(key: string, buffer: Buffer): Promise<{ url: string }>;
  /** Relit le contenu d'un fichier précédemment enregistré. */
  read(key: string): Promise<Buffer>;
  /** Supprime un fichier. Ne doit pas lever si le fichier est déjà absent. */
  remove(key: string): Promise<void>;
}
