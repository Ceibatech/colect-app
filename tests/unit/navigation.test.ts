import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isNavItemVisible } from "@/config/navigation";
import { ROLE_ONLY_ROUTE_PREFIXES, ROLE_PERMISSIONS, type RoleCode } from "@/lib/permissions/constants";

const dashboard = NAV_ITEMS.find((item) => item.href === "/dashboard")!;
const dashboardChildren = dashboard.children!;

describe("role-aware dashboard navigation", () => {
  const cases: Array<[RoleCode, string[]]> = [
    ["ADMIN", ["/dashboard", "/dashboard/direction", "/dashboard/operateurs", "/dashboard/geographie", "/dashboard/finance", "/dashboard/pmo"]],
    ["SUPERVISEUR", ["/dashboard", "/dashboard/operateurs", "/dashboard/geographie"]],
    ["OPERATEUR", ["/dashboard"]],
    ["AGENT_INVENTAIRE", ["/dashboard"]],
    ["PREPARATEUR", ["/dashboard"]],
    ["NUMERISATEUR", ["/dashboard"]],
    ["CONDITIONNEUR", ["/dashboard"]],
    ["INDEXEUR", ["/dashboard"]],
    ["ARCHIVISTE", ["/dashboard"]],
    ["GESTIONNAIRE_TRANSFERT", ["/dashboard"]],
    ["VALIDATEUR_CEIBAC", ["/dashboard"]],
    ["VALIDATEUR_MINISTERE", ["/dashboard"]],
    ["FINANCE", ["/dashboard", "/dashboard/finance"]],
    ["PMO", ["/dashboard", "/dashboard/direction", "/dashboard/operateurs", "/dashboard/geographie", "/dashboard/pmo"]],
    ["EXECUTIF", ["/dashboard", "/dashboard/direction", "/dashboard/operateurs", "/dashboard/geographie"]],
    ["CONSULTATION", ["/dashboard", "/dashboard/direction", "/dashboard/geographie"]],
  ];

  it.each(cases)("shows only the dashboard views allowed for %s", (roleCode, expected) => {
    const visible = dashboardChildren
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS[roleCode], roleCode))
      .map((item) => item.href);

    expect(visible).toEqual(expected);
  });

  it("limits the executive sidebar to the dashboard module", () => {
    const visible = NAV_ITEMS
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS.EXECUTIF, "EXECUTIF"))
      .map((item) => item.href);

    expect(visible).toEqual(["/dashboard"]);
  });

  it("limits Finance to dashboards and excludes operational modules", () => {
    const visible = NAV_ITEMS
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS.FINANCE, "FINANCE"))
      .map((item) => item.href);

    expect(visible).toEqual(["/dashboard"]);
  });

  it("shows transfers to the dedicated transfer actors and not to operators", () => {
    const visibleForManager = NAV_ITEMS
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS.GESTIONNAIRE_TRANSFERT, "GESTIONNAIRE_TRANSFERT"))
      .map((item) => item.href);
    const visibleForOperator = NAV_ITEMS
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS.OPERATEUR, "OPERATEUR"))
      .map((item) => item.href);
    const visibleForValidator = NAV_ITEMS
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS.VALIDATEUR_CEIBAC, "VALIDATEUR_CEIBAC"))
      .map((item) => item.href);

    expect(visibleForManager).toEqual(["/transferts"]);
    expect(visibleForValidator).toEqual(["/transferts"]);
    expect(visibleForOperator).not.toContain("/transferts");
  });

  it.each([
    ["AGENT_INVENTAIRE", ["/dashboard", "/collecte", "/dossiers", "/recherche", "/import"]],
    ["PREPARATEUR", ["/dashboard", "/preparation"]],
    ["NUMERISATEUR", ["/dashboard", "/numerisation"]],
    ["CONDITIONNEUR", ["/dashboard", "/conditionnement"]],
    ["INDEXEUR", ["/dashboard", "/indexation"]],
    ["ARCHIVISTE", ["/dashboard", "/archivage"]],
  ] satisfies Array<[RoleCode, string[]]>)
  ("limits %s to its assigned activity", (role, expected) => {
    const visible = NAV_ITEMS
      .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS[role], role))
      .map((item) => item.href);
    expect(visible).toEqual(expected);
  });

  it("keeps route restrictions aligned with navigation roles", () => {
    for (const item of dashboardChildren.filter((entry) => entry.roles)) {
      const restriction = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => entry.prefix === item.href);
      expect(restriction?.roles).toEqual(item.roles);
    }
  });

  it("shows each validation workspace only to its authorized actors", () => {
    const transfers = NAV_ITEMS.find((item) => item.href === "/transferts")!;
    const cases: Array<[RoleCode, string[]]> = [
      ["ADMIN", ["/transferts", "/transferts/validation-ceibac", "/transferts/validation"]],
      ["VALIDATEUR_CEIBAC", ["/transferts", "/transferts/validation-ceibac"]],
      ["VALIDATEUR_MINISTERE", ["/transferts", "/transferts/validation"]],
      ["SUPERVISEUR", ["/transferts", "/transferts/validation"]],
      ["GESTIONNAIRE_TRANSFERT", ["/transferts"]],
      ["OPERATEUR", []],
    ];
    for (const [role, expected] of cases) {
      expect((transfers.children ?? [])
        .filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS[role], role))
        .map((item) => item.href)).toEqual(expected);
    }
    expect(NAV_ITEMS.filter((item) => isNavItemVisible(item, ROLE_PERMISSIONS.VALIDATEUR_MINISTERE, "VALIDATEUR_MINISTERE"))
      .map((item) => item.href)).toEqual(["/transferts"]);
  });
});
