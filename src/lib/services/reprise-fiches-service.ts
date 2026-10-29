import "server-only";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireApiPermission } from "@/lib/auth/current-user";
import { ApiError } from "@/lib/utils/api-error";

/** Dépôt des fiches terrain (Excel), traité ensuite sur le serveur par deploy/reprise-fiches.mjs. */
export const DEPOT_ROOT = path.join(process.env.DOCUMENTS_STORAGE_PATH ?? "/var/data/documents", "reprise-fiches");
const MAX_FILES = 12;
const MAX_SIZE = 25 * 1024 * 1024;

export async function deposerFiches(files: File[]) {
  const session = await requireApiPermission("IMPORT_DATA");
  if (session.roleCode !== "ADMIN") throw new ApiError("Réservé à l'administrateur.", 403);
  const fiches = files.filter((file) => file.size > 0);
  if (!fiches.length) throw new ApiError("Choisissez au moins une fiche Excel (.xlsx).", 400);
  if (fiches.length > MAX_FILES) throw new ApiError(`${MAX_FILES} fichiers au plus.`, 400);
  for (const file of fiches) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ApiError(`${file.name} : seules les fiches .xlsx sont acceptées.`, 400);
    if (file.size > MAX_SIZE) throw new ApiError(`${file.name} : 25 Mo au plus.`, 400);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const dir = path.join(DEPOT_ROOT, `${stamp}-u${session.userId}`);
  await mkdir(dir, { recursive: true });
  for (const [index, file] of fiches.entries()) {
    const safe = file.name.normalize("NFKD").replace(/[^\w.() -]+/g, "_").slice(0, 120);
    await writeFile(path.join(dir, `${String(index + 1).padStart(2, "0")}-${safe}`), Buffer.from(await file.arrayBuffer()));
  }
  return { depot: path.basename(dir), fichiers: fiches.length };
}

/** Dernier dépôt : c'est lui que la reprise traite. */
export async function dernierDepot() {
  try {
    const dirs = (await readdir(DEPOT_ROOT)).sort();
    const last = dirs[dirs.length - 1];
    if (!last) return null;
    const dir = path.join(DEPOT_ROOT, last);
    const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".xlsx")).sort();
    const fichiers = await Promise.all(names.map(async (name) => ({ name: name.replace(/^\d+-/, ""), size: (await stat(path.join(dir, name))).size })));
    return { depot: last, fichiers, depose: (await stat(dir)).mtime };
  } catch {
    return null;
  }
}
