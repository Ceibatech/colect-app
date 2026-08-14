import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "@/lib/storage/storage-provider";

/**
 * Stockage sur disque local — implémentation par défaut pour le
 * développement et un premier déploiement simple. Hors de `public/` pour
 * qu'aucun fichier ne soit servi sans passer par la vérification de
 * permission de la Route Handler de téléchargement.
 *
 * Racine configurable via `DOCUMENTS_STORAGE_PATH` (utile en production pour
 * pointer vers un volume persistant — sur Render, le disque éphémère ne
 * survit pas aux redéploiements : voir DEPLOYMENT.md).
 */
const ROOT = process.env.DOCUMENTS_STORAGE_PATH ?? path.join(process.cwd(), "storage", "documents");
// Résolu une seule fois au chargement du module : la racine est un chemin
// applicatif fixe (ou une variable d'environnement de déploiement), jamais
// une entrée utilisateur — le traçage de fichiers Next.js ne peut pas le
// prouver statiquement et tracerait tout le projet sans cet échappatoire
// documenté (cf. avertissement de build officiel).
const RESOLVED_ROOT = path.resolve(/*turbopackIgnore: true*/ ROOT) + path.sep;

function resolveSafePath(key: string): string {
  // Empêche toute traversée de répertoire (`../..`) : la clé ne doit jamais sortir de ROOT.
  const resolved = path.resolve(ROOT, key);
  if (!resolved.startsWith(RESOLVED_ROOT)) {
    throw new Error("Clé de stockage invalide.");
  }
  return resolved;
}

// Chaque appel fs ci-dessous porte le même échappatoire documenté que
// `RESOLVED_ROOT` ci-dessus : chemin borné et validé par `resolveSafePath`,
// jamais une entrée utilisateur brute.
export class LocalStorageProvider implements StorageProvider {
  async save(key: string, buffer: Buffer): Promise<{ url: string }> {
    const filePath = resolveSafePath(key);
    await mkdir(/*turbopackIgnore: true*/ path.dirname(filePath), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ filePath, buffer);
    return { url: key };
  }

  async read(key: string): Promise<Buffer> {
    return readFile(/*turbopackIgnore: true*/ resolveSafePath(key));
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(/*turbopackIgnore: true*/ resolveSafePath(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
