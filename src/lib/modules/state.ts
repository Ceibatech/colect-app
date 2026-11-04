import { prisma } from "@/lib/prisma/client";
import { DISABLED_MODULES_SETTING, parseDisabledModules, type DisabledModules } from "@/lib/modules/catalog";

// Lu à chaque requête par le proxy : gardé quelques secondes en mémoire.
// Le proxy et les pages sont des bundles distincts du même processus : le
// cache vit sur globalThis pour qu'un changement fait par l'administrateur
// s'applique aussitôt partout.
const TTL_MS = 10_000;
type Cache = { value: DisabledModules; expires: number } | null;
const store = globalThis as unknown as { __geoarchivesDisabledModules?: Cache };

/**
 * Modules actuellement désactivés. Si la base ne répond pas, rien n'est
 * désactivé : le contrôle ne doit jamais bloquer toute l'application.
 */
export async function getDisabledModules(): Promise<DisabledModules> {
  const cache = store.__geoarchivesDisabledModules;
  if (cache && cache.expires > Date.now()) return cache.value;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: DISABLED_MODULES_SETTING }, select: { value: true } });
    const value = parseDisabledModules(setting?.value);
    store.__geoarchivesDisabledModules = { value, expires: Date.now() + TTL_MS };
    return value;
  } catch {
    return cache?.value ?? {};
  }
}

export function forgetDisabledModulesCache() {
  store.__geoarchivesDisabledModules = null;
}
