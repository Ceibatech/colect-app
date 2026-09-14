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

  it("keeps route restrictions aligned with navigation roles", () => {
    for (const item of dashboardChildren.filter((entry) => entry.roles)) {
      const restriction = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => entry.prefix === item.href);
      expect(restriction?.roles).toEqual(item.roles);
    }
  });
});