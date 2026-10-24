import { describe, expect, it } from "vitest";
import { getDossierWorkspaceActivityPath, getWorkspaceTheme, WORKSPACE_PALETTES } from "@/config/workspace-theme";
import { ROLE_CODES, ROLE_LABELS, ROLE_PERMISSIONS, type PermissionCode, type RoleCode } from "@/lib/permissions/constants";

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(background: string, foreground: string) {
  const [min, max] = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
  return (max + 0.05) / (min + 0.05);
}

describe("workspace identity palettes", () => {
  it("covers every configured role with a distinct accent and a visible role label", () => {
    expect(Object.keys(WORKSPACE_PALETTES).sort()).toEqual([...ROLE_CODES].sort());
    expect(new Set(ROLE_CODES.map((role) => WORKSPACE_PALETTES[role].light.primary)).size).toBe(ROLE_CODES.length);
    for (const role of ROLE_CODES) {
      const theme = getWorkspaceTheme(role, ROLE_PERMISSIONS[role], "/dashboard");
      expect(theme.rolePalette.key).toBe(role);
      expect(theme.activePalette.key).toBe(role);
      expect(theme.roleLabel).toBe(ROLE_LABELS[role]);
    }
  });

  it.each(ROLE_CODES)("provides AA text contrast for %s in both display modes", (role) => {
    for (const tokens of [WORKSPACE_PALETTES[role].light, WORKSPACE_PALETTES[role].dark]) {
      for (const value of Object.values(tokens)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(tokens.primary, tokens.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.sidebar, tokens.sidebarForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.sidebarAccent, tokens.sidebarAccentForeground)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(WORKSPACE_PALETTES[role].light.surface, "#111827")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WORKSPACE_PALETTES[role].dark.surface, "#f8fafc")).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    "AGENT_INVENTAIRE", "PREPARATEUR", "NUMERISATEUR", "CONDITIONNEUR", "INDEXEUR", "ARCHIVISTE",
    "GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC", "VALIDATEUR_MINISTERE", "FINANCE", "PMO", "EXECUTIF", "CONSULTATION",
  ] satisfies RoleCode[])("keeps %s identity stable when navigating unrelated or read-only pages", (role) => {
    for (const path of ["/dashboard", "/dossiers/42", "/preparation", "/transferts/validation", "/administration"]) {
      const theme = getWorkspaceTheme(role, ROLE_PERMISSIONS[role], path);
      expect(theme.isMultiFunction).toBe(false);
      expect(theme.activePalette.key).toBe(role);
      expect(theme.activityLabel).toBeNull();
    }
  });
});

describe("multifunction workspace context", () => {
  it.each([
    ["/collecte", "AGENT_INVENTAIRE"],
    ["/import", "AGENT_INVENTAIRE"],
    ["/preparation", "PREPARATEUR"],
    ["/preparation/42", "PREPARATEUR"],
    ["/numerisation", "NUMERISATEUR"],
    ["/conditionnement", "CONDITIONNEUR"],
    ["/indexation", "INDEXEUR"],
    ["/archivage", "ARCHIVISTE"],
  ] satisfies Array<[string, RoleCode]>)("adapts the operator workspace at %s without changing its assigned role", (path, expected) => {
    const theme = getWorkspaceTheme("OPERATEUR", ROLE_PERMISSIONS.OPERATEUR, path);
    expect(theme.isMultiFunction).toBe(true);
    expect(theme.activePalette.key).toBe(expected);
    expect(theme.rolePalette.key).toBe("OPERATEUR");
    expect(theme.roleLabel).toBe(ROLE_LABELS.OPERATEUR);
    expect(theme.activityLabel).toBeTruthy();
  });

  it("uses actual permissions instead of assuming every polyvalent operator has every function", () => {
    const permissions: PermissionCode[] = ["DASHBOARD_VIEW", "DOSSIER_READ", "PREPARATION_VIEW", "PREPARATION_UPDATE", "NUMERISATION_VIEW", "NUMERISATION_UPDATE", "ARCHIVAGE_VIEW"];
    expect(getWorkspaceTheme("OPERATEUR", permissions, "/preparation").activePalette.key).toBe("PREPARATEUR");
    expect(getWorkspaceTheme("OPERATEUR", permissions, "/numerisation").activePalette.key).toBe("NUMERISATEUR");
    expect(getWorkspaceTheme("OPERATEUR", permissions, "/archivage").activePalette.key).toBe("OPERATEUR");
  });

  it("does not count read-only modules or multiple operations within the same function", () => {
    const permissions: PermissionCode[] = ["DOSSIER_CREATE", "DOSSIER_UPDATE", "IMPORT_DATA", "PREPARATION_VIEW", "NUMERISATION_VIEW", "INDEXATION_VIEW", "ARCHIVAGE_VIEW"];
    expect(getWorkspaceTheme("AGENT_INVENTAIRE", permissions, "/numerisation").isMultiFunction).toBe(false);
    expect(getWorkspaceTheme("CONSULTATION", ROLE_PERMISSIONS.CONSULTATION, "/preparation").isMultiFunction).toBe(false);
  });

  it("keeps supervision distinct from performing a stage", () => {
    const theme = getWorkspaceTheme("SUPERVISEUR", ROLE_PERMISSIONS.SUPERVISEUR, "/preparation");
    expect(theme.activePalette.key).toBe("SUPERVISEUR");
    expect(theme.activityLabel).toBe("Supervision · Préparation");
    expect(getWorkspaceTheme("SUPERVISEUR", ROLE_PERMISSIONS.SUPERVISEUR, "/transferts/validation").activePalette.key).toBe("VALIDATEUR_MINISTERE");
  });

  it("resolves the separate internal and SDA validation paths for an authorized multifunction actor", () => {
    expect(getWorkspaceTheme("ADMIN", ROLE_PERMISSIONS.ADMIN, "/transferts/validation-ceibac").activePalette.key).toBe("VALIDATEUR_CEIBAC");
    expect(getWorkspaceTheme("ADMIN", ROLE_PERMISSIONS.ADMIN, "/transferts/validation").activePalette.key).toBe("VALIDATEUR_MINISTERE");
    expect(getWorkspaceTheme("ADMIN", ROLE_PERMISSIONS.ADMIN, "/transferts/nouveau").activePalette.key).toBe("GESTIONNAIRE_TRANSFERT");
    expect(getWorkspaceTheme("ADMIN", ROLE_PERMISSIONS.ADMIN, "/dashboard/finance").activePalette.key).toBe("FINANCE");
  });

  it("requires the relevant permission and respects restricted roles even for a manually typed path", () => {
    const permissions = ROLE_PERMISSIONS.ADMIN.filter((permission) => permission !== "TRANSFER_AUTHORIZE");
    expect(getWorkspaceTheme("ADMIN", permissions, "/transferts/validation").activePalette.key).toBe("ADMIN");
    expect(getWorkspaceTheme("OPERATEUR", ROLE_PERMISSIONS.OPERATEUR, "/transferts/validation").activePalette.key).toBe("OPERATEUR");
    expect(getWorkspaceTheme("SUPERVISEUR", ROLE_PERMISSIONS.ADMIN, "/transferts/validation-ceibac").activePalette.key).toBe("SUPERVISEUR");
  });

  it("matches complete path segments and leaves general dossier pages in the role workspace", () => {
    for (const path of ["/preparation-extra", "/numerisation-old", "/dashboard/finance-other", "/dossiers/42", "/recherche"]) {
      expect(getWorkspaceTheme("OPERATEUR", ROLE_PERMISSIONS.OPERATEUR, path).activePalette.key).toBe("OPERATEUR");
    }
    // This is a generic transfer path, never the SDA validation workspace.
    expect(getWorkspaceTheme("ADMIN", ROLE_PERMISSIONS.ADMIN, "/transferts/validation-ceibac-extra").activePalette.key).toBe("GESTIONNAIRE_TRANSFERT");
    expect(getWorkspaceTheme("OPERATEUR", ROLE_PERMISSIONS.OPERATEUR, "/preparation?statut=A_TRAITER").activePalette.key).toBe("PREPARATEUR");
  });
});

describe("dossier work tab visual context", () => {
  it.each([
    ["collecte", "AGENT_INVENTAIRE"],
    ["controle", "SUPERVISEUR"],
    ["preparation", "PREPARATEUR"],
    ["numerisation", "NUMERISATEUR"],
    ["indexation", "INDEXEUR"],
    ["archivage", "ARCHIVISTE"],
  ] satisfies Array<[string, RoleCode]>)("uses the initial or selected %s tab as the administrator's activity context", (tab, expected) => {
    const path = getDossierWorkspaceActivityPath("/dossiers/42", tab);
    expect(path).toBeTruthy();
    expect(getWorkspaceTheme("ADMIN", ROLE_PERMISSIONS.ADMIN, path!).activePalette.key).toBe(expected);
  });

  it("does not assign an operational function on read-only or general dossier tabs", () => {
    for (const tab of ["informations", "foncier", "titulaire", "documents", "historique", "unknown", "constructor", "toString"]) {
      expect(getDossierWorkspaceActivityPath("/dossiers/42", tab)).toBeNull();
    }
    const controlPath = getDossierWorkspaceActivityPath("/dossiers/42", "controle")!;
    expect(getWorkspaceTheme("OPERATEUR", ROLE_PERMISSIONS.OPERATEUR, controlPath).activePalette.key).toBe("OPERATEUR");
    expect(getWorkspaceTheme("CONSULTATION", ROLE_PERMISSIONS.CONSULTATION, controlPath).activePalette.key).toBe("CONSULTATION");
  });

  it("cannot attach dossier tab context to lists, edit forms or unrelated pages", () => {
    for (const path of ["/dossiers", "/dossiers/new", "/dossiers/42/modifier", "/preparation", "/dashboard", "/dossiers/0"]) {
      expect(getDossierWorkspaceActivityPath(path, "numerisation")).toBeNull();
    }
    expect(getDossierWorkspaceActivityPath("/dossiers/42/", "numerisation")).toBe("/numerisation");
  });

  it("keeps a single-function worker's assigned palette on another stage's tab", () => {
    const path = getDossierWorkspaceActivityPath("/dossiers/42", "archivage")!;
    expect(getWorkspaceTheme("PREPARATEUR", ROLE_PERMISSIONS.PREPARATEUR, path).activePalette.key).toBe("PREPARATEUR");
  });
});
