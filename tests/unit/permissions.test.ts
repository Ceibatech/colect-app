import { describe, expect, it } from "vitest";
import { getRoleLabel, PERMISSIONS, ROLE_CODES, ROLE_LABELS, ROLE_PERMISSIONS, ROLE_ONLY_ROUTE_PREFIXES } from "@/lib/permissions/constants";

/**
 * Vérifie l'intégrité de la matrice RBAC (§11/§12) — source unique de vérité
 * partagée par le seed et l'application. `hasPermission()`
 * (src/lib/auth/current-user.ts) n'est volontairement pas testée ici : ce
 * fichier importe "server-only"/"next/headers" (couplage Next.js), sa valeur
 * ajoutée réelle (juste un `.includes()`) est déjà exercée en continu par
 * les tests API/E2E (Playwright) qui frappent de vraies routes protégées.
 */
describe("ROLE_PERMISSIONS (matrice RBAC)", () => {
  it("utilise CEIBA dans tous les libellés de rôle affichés", () => {
    expect(getRoleLabel("VALIDATEUR_CEIBAC")).toBe("Validateur CEIBA");
    expect(Object.values(ROLE_LABELS).join(" ")).not.toMatch(/CEIBAC/i);
  });

  it("définit une entrée pour chacun des rôles", () => {
    for (const role of ROLE_CODES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLE_CODES].sort());
  });

  it("ADMIN possède l'intégralité des permissions", () => {
    expect(new Set(ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(PERMISSIONS));
  });

  it("chaque permission listée par rôle existe dans le référentiel PERMISSIONS", () => {
    for (const role of ROLE_CODES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it("aucun rôle ne liste deux fois la même permission", () => {
    for (const role of ROLE_CODES) {
      const perms = ROLE_PERMISSIONS[role];
      expect(new Set(perms).size).toBe(perms.length);
    }
  });

  it("CONSULTATION n'a aucune permission d'écriture (CREATE/UPDATE/DELETE/VALIDATE/REJECT/MANAGE)", () => {
    const writeVerbs = /_(CREATE|UPDATE|DELETE|VALIDATE|REJECT|MANAGE|DATA)$/;
    const writePerms = ROLE_PERMISSIONS.CONSULTATION.filter((p) => writeVerbs.test(p));
    expect(writePerms).toEqual([]);
  });

  it("EXECUTIF est strictement limité aux tableaux de bord", () => {
    expect(ROLE_PERMISSIONS.EXECUTIF).toEqual(["DASHBOARD_VIEW"]);
  });

  it("FINANCE ne reçoit que le pilotage financier", () => {
    expect(ROLE_PERMISSIONS.FINANCE).toEqual(["DASHBOARD_VIEW", "FINANCE_VIEW", "FINANCE_CONFIGURE"]);
  });

  it("PMO reçoit uniquement les tableaux de bord de son périmètre", () => {
    expect(ROLE_PERMISSIONS.PMO).toEqual(["DASHBOARD_VIEW", "PMO_VIEW"]);
  });

  it("réserve les barèmes à ADMIN et FINANCE", () => {
    const roles = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("FINANCE_CONFIGURE"));
    expect(new Set(roles)).toEqual(new Set(["ADMIN", "FINANCE"]));
  });

  it("seuls ADMIN et SUPERVISEUR ont AUDIT_VIEW", () => {
    const rolesWithAudit = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("AUDIT_VIEW"));
    expect(new Set(rolesWithAudit)).toEqual(new Set(["ADMIN", "SUPERVISEUR"]));
  });

  it("réserve la création des dossiers aux administrateurs et agents d'inventaire", () => {
    const rolesWithCreate = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("DOSSIER_CREATE"));
    expect(new Set(rolesWithCreate)).toEqual(new Set(["ADMIN", "OPERATEUR", "AGENT_INVENTAIRE"]));
  });

  it("cloisonne chaque rôle de production à son activité", () => {
    const expectedActivityPermissions = {
      PREPARATEUR: ["PREPARATION_VIEW", "PREPARATION_UPDATE"],
      NUMERISATEUR: ["NUMERISATION_VIEW", "NUMERISATION_UPDATE"],
      CONDITIONNEUR: ["CONDITIONNEMENT_VIEW", "CONDITIONNEMENT_UPDATE"],
      INDEXEUR: ["INDEXATION_VIEW", "INDEXATION_UPDATE"],
      ARCHIVISTE: ["ARCHIVAGE_VIEW", "ARCHIVAGE_UPDATE"],
    } as const;

    const activityPrefixes = ["PREPARATION_", "NUMERISATION_", "CONDITIONNEMENT_", "INDEXATION_", "ARCHIVAGE_"];
    for (const [role, expected] of Object.entries(expectedActivityPermissions)) {
      const actual = ROLE_PERMISSIONS[role as keyof typeof expectedActivityPermissions]
        .filter((permission) => activityPrefixes.some((prefix) => permission.startsWith(prefix)));
      expect(actual).toEqual(expected);
    }
  });

  it("conserve l'opérateur polyvalent pour les comptes cumulant plusieurs activités", () => {
    expect(ROLE_PERMISSIONS.OPERATEUR).toEqual(expect.arrayContaining([
      "DOSSIER_CREATE",
      "PREPARATION_UPDATE",
      "NUMERISATION_UPDATE",
      "CONDITIONNEMENT_UPDATE",
      "INDEXATION_UPDATE",
      "ARCHIVAGE_UPDATE",
    ]));
  });

  it("seuls ADMIN et SUPERVISEUR peuvent valider/rejeter un dossier", () => {
    const rolesWithValidate = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("DOSSIER_VALIDATE"));
    const rolesWithReject = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("DOSSIER_REJECT"));
    expect(new Set(rolesWithValidate)).toEqual(new Set(["ADMIN", "SUPERVISEUR"]));
    expect(new Set(rolesWithReject)).toEqual(new Set(["ADMIN", "SUPERVISEUR"]));
  });

  it("réserve les opérations de transfert au gestionnaire dédié et à ADMIN", () => {
    const rolesWithCreate = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("TRANSFER_CREATE"));
    const rolesWithOperate = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("TRANSFER_OPERATE"));
    const rolesWithAuthorize = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("TRANSFER_AUTHORIZE"));
    const rolesWithCeibacValidation = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("TRANSFER_CEIBAC_VALIDATE"));
    const rolesWithCeibacApproval = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("TRANSFER_CEIBAC_APPROVE"));
    const rolesWithTracking = ROLE_CODES.filter((role) => ROLE_PERMISSIONS[role].includes("TRANSFER_TRACK"));

    expect(new Set(rolesWithCreate)).toEqual(new Set(["ADMIN", "GESTIONNAIRE_TRANSFERT"]));
    expect(new Set(rolesWithOperate)).toEqual(new Set(["ADMIN", "GESTIONNAIRE_TRANSFERT"]));
    expect(new Set(rolesWithAuthorize)).toEqual(new Set(["ADMIN", "SUPERVISEUR", "VALIDATEUR_MINISTERE"]));
    expect(new Set(rolesWithCeibacValidation)).toEqual(new Set(["ADMIN", "VALIDATEUR_CEIBAC"]));
    expect(new Set(rolesWithCeibacApproval)).toEqual(new Set(["ADMIN", "VALIDATEUR_CEIBAC"]));
    expect(new Set(rolesWithTracking)).toEqual(new Set(["ADMIN", "GESTIONNAIRE_TRANSFERT"]));
    expect(ROLE_PERMISSIONS.OPERATEUR).not.toContain("TRANSFER_VIEW");
  });

  it("limite le validateur ministère aux visas et à la consultation des transferts", () => {
    expect(ROLE_PERMISSIONS.VALIDATEUR_MINISTERE).toEqual(["DASHBOARD_VIEW", "TRANSFER_VIEW", "TRANSFER_AUTHORIZE"]);
    expect(ROLE_PERMISSIONS.VALIDATEUR_MINISTERE).not.toContain("TRANSFER_CEIBAC_VALIDATE");
    expect(ROLE_PERMISSIONS.VALIDATEUR_MINISTERE).not.toContain("TRANSFER_CEIBAC_APPROVE");
    expect(ROLE_PERMISSIONS.VALIDATEUR_MINISTERE).not.toContain("TRANSFER_OPERATE");
    expect(ROLE_PERMISSIONS.VALIDATEUR_MINISTERE).not.toContain("DOSSIER_READ");
  });
});

describe("ROLE_ONLY_ROUTE_PREFIXES (garde-fou grossier middleware/proxy)", () => {
  it("distingue l'espace CEIBA du préfixe ministère et réserve son visa", () => {
    const validation = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => "/transferts/validation-ceibac".startsWith(entry.prefix));
    expect(validation?.roles).toEqual(["ADMIN", "VALIDATEUR_CEIBAC"]);
    expect(ROLE_PERMISSIONS.VALIDATEUR_CEIBAC).not.toContain("TRANSFER_AUTHORIZE");
    expect(ROLE_PERMISSIONS.GESTIONNAIRE_TRANSFERT).not.toContain("TRANSFER_CEIBAC_APPROVE");
  });

  it("réserve l'espace ministère aux acteurs autorisés et préserve l'accès aux bordereaux", () => {
    const validation = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => "/transferts/validation".startsWith(entry.prefix));
    expect(validation?.roles).toEqual(["ADMIN", "SUPERVISEUR", "VALIDATEUR_MINISTERE"]);
    const bordereau = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => "/transferts/12/bordereaux/34".startsWith(entry.prefix));
    expect(bordereau?.roles).toContain("VALIDATEUR_MINISTERE");
    expect(bordereau?.roles).toContain("VALIDATEUR_CEIBAC");
    expect(bordereau?.roles).toContain("GESTIONNAIRE_TRANSFERT");
    expect(bordereau?.roles).not.toContain("OPERATEUR");
  });

  it("ne bloque jamais /administration au niveau préfixe (bug corrigé Phase 12 — non-régression)", () => {
    const blocksAdministration = ROLE_ONLY_ROUTE_PREFIXES.some((entry) => entry.prefix === "/administration");
    expect(blocksAdministration).toBe(false);
  });

  it("chaque rôle listé dans un préfixe est un rôle valide", () => {
    for (const entry of ROLE_ONLY_ROUTE_PREFIXES) {
      for (const role of entry.roles) {
        expect(ROLE_CODES).toContain(role);
      }
    }
  });

  it("autorise l'import aux agents d'inventaire", () => {
    const restriction = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => entry.prefix === "/import");
    expect(restriction?.roles).toEqual(["ADMIN", "OPERATEUR", "AGENT_INVENTAIRE"]);
  });
});
