import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_CODES, ROLE_PERMISSIONS, ROLE_ONLY_ROUTE_PREFIXES } from "@/lib/permissions/constants";

/**
 * Vérifie l'intégrité de la matrice RBAC (§11/§12) — source unique de vérité
 * partagée par le seed et l'application. `hasPermission()`
 * (src/lib/auth/current-user.ts) n'est volontairement pas testée ici : ce
 * fichier importe "server-only"/"next/headers" (couplage Next.js), sa valeur
 * ajoutée réelle (juste un `.includes()`) est déjà exercée en continu par
 * les tests API/E2E (Playwright) qui frappent de vraies routes protégées.
 */
describe("ROLE_PERMISSIONS (matrice RBAC)", () => {
  it("définit une entrée pour chacun des 4 rôles", () => {
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

  it("seuls ADMIN et SUPERVISEUR ont AUDIT_VIEW", () => {
    const rolesWithAudit = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("AUDIT_VIEW"));
    expect(new Set(rolesWithAudit)).toEqual(new Set(["ADMIN", "SUPERVISEUR"]));
  });

  it("seuls ADMIN et OPERATEUR ont DOSSIER_CREATE (SUPERVISEUR et CONSULTATION ne créent pas de dossier)", () => {
    const rolesWithCreate = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("DOSSIER_CREATE"));
    expect(new Set(rolesWithCreate)).toEqual(new Set(["ADMIN", "OPERATEUR"]));
  });

  it("seuls ADMIN et SUPERVISEUR peuvent valider/rejeter un dossier", () => {
    const rolesWithValidate = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("DOSSIER_VALIDATE"));
    const rolesWithReject = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("DOSSIER_REJECT"));
    expect(new Set(rolesWithValidate)).toEqual(new Set(["ADMIN", "SUPERVISEUR"]));
    expect(new Set(rolesWithReject)).toEqual(new Set(["ADMIN", "SUPERVISEUR"]));
  });
});

describe("ROLE_ONLY_ROUTE_PREFIXES (garde-fou grossier middleware/proxy)", () => {
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
});
