/**
 * Modules que l'administrateur peut désactiver sans redéployer : si l'un
 * d'eux est défaillant, il est mis hors service pendant que le reste de
 * l'application continue de tourner. L'administration, le tableau de bord,
 * la connexion et les routes techniques ne sont jamais désactivables.
 */
export interface AppModule {
  code: string;
  label: string;
  description: string;
  /** Préfixes des pages (et de leurs actions serveur). */
  pages: readonly string[];
  /**
   * Préfixes des routes API propres au module. Les API partagées
   * (/api/dossiers, /api/cartons, /api/recherche) restent ouvertes : d'autres
   * modules s'en servent.
   */
  api: readonly string[];
}

export const APP_MODULES: readonly AppModule[] = [
  { code: "collecte", label: "Collecte", description: "Saisie des fiches de dossiers sur le terrain.", pages: ["/collecte"], api: [] },
  { code: "dossiers", label: "Dossiers", description: "Liste, fiche et modification des dossiers.", pages: ["/dossiers"], api: [] },
  { code: "recherche", label: "Recherche documentaire", description: "Recherche plein texte dans les dossiers et documents.", pages: ["/recherche"], api: [] },
  { code: "cartons", label: "Cartons et QR codes", description: "Cartons, étiquettes et liens courts des QR codes.", pages: ["/cartons", "/c"], api: [] },
  { code: "preparation", label: "Préparation", description: "Préparation physique des dossiers.", pages: ["/preparation"], api: [] },
  { code: "numerisation", label: "Numérisation", description: "Numérisation des pièces.", pages: ["/numerisation"], api: [] },
  { code: "conditionnement", label: "Reconditionnement", description: "Reconditionnement des dossiers.", pages: ["/conditionnement"], api: ["/api/conditionnement"] },
  { code: "indexation", label: "Indexation", description: "Indexation des documents.", pages: ["/indexation"], api: [] },
  { code: "archivage", label: "Archivage", description: "Versement et archivage électronique.", pages: ["/archivage"], api: [] },
  { code: "transferts", label: "Transferts", description: "Circuit de transfert, convois, conteneurs et suivi GPS.", pages: ["/transferts", "/caisses"], api: ["/api/transferts", "/api/caisses", "/api/osmand"] },
  { code: "qualite", label: "Qualité", description: "Contrôle qualité.", pages: ["/qualite"], api: [] },
  { code: "import", label: "Import", description: "Import de fichiers de données.", pages: ["/import"], api: ["/api/import"] },
  { code: "export", label: "Export", description: "Export des données.", pages: ["/export"], api: ["/api/export"] },
  { code: "finance", label: "Finance", description: "Tableau de bord et exports financiers.", pages: ["/dashboard/finance"], api: ["/api/finance"] },
];

export const MODULE_CODES = new Set(APP_MODULES.map((mod) => mod.code));

/** Clé du paramètre (table settings) qui liste les modules désactivés. */
export const DISABLED_MODULES_SETTING = "MODULES_DESACTIVES";

export interface ModuleOutage {
  /** Date de mise hors service (ISO). */
  at: string;
  by: string | null;
  motif: string | null;
}

export type DisabledModules = Record<string, ModuleOutage>;

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Module désactivé auquel appartient ce chemin, s'il y en a un. */
export function disabledModuleFor(pathname: string, disabled: DisabledModules): { module: AppModule; api: boolean } | null {
  for (const mod of APP_MODULES) {
    if (!disabled[mod.code]) continue;
    if (mod.api.some((prefix) => matches(pathname, prefix))) return { module: mod, api: true };
    if (mod.pages.some((prefix) => matches(pathname, prefix))) return { module: mod, api: false };
  }
  return null;
}

/** Lecture tolérante du paramètre : un contenu invalide ne désactive rien. */
export function parseDisabledModules(value: string | null | undefined): DisabledModules {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: DisabledModules = {};
    for (const [code, outage] of Object.entries(parsed as Record<string, Partial<ModuleOutage>>)) {
      if (!MODULE_CODES.has(code) || !outage || typeof outage !== "object") continue;
      result[code] = {
        at: typeof outage.at === "string" ? outage.at : new Date(0).toISOString(),
        by: typeof outage.by === "string" ? outage.by : null,
        motif: typeof outage.motif === "string" ? outage.motif : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

/** Le lien de navigation est-il celui d'un module désactivé ? */
export function isHrefDisabled(href: string, disabled: DisabledModules) {
  const found = disabledModuleFor(href, disabled);
  return found !== null && !found.api;
}
