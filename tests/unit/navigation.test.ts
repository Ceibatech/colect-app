import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isNavItemVisible } from "@/config/navigation";
import { ROLE_ONLY_ROUTE_PREFIXES, type RoleCode } from "@/lib/permissions/constants";

const dashboard = NAV_ITEMS.find((item) => item.href === "/dashboard")!;
const child = (href: string) => dashboard.children!.find((item) => item.href === href)!;
const permissions = ["DASHBOARD_VIEW"] as const;

describe("role-aware dashboard navigation", () => {
  const cases: Array<[RoleCode, string[]]> = [
    ["ADMIN", ["/dashboard", "/dashboard/direction", "/dashboard/operateurs", "/dashboard/geographie"]],
    ["SUPERVISEUR", ["/dashboard", "/dashboard/operateurs", "/dashboard/geographie"]],
    ["OPERATEUR", ["/dashboard"]],
    ["CONSULTATION", ["/dashboard", "/dashboard/direction", "/dashboard/geographie"]],
  ];

  it.each(cases)("shows only the dashboard views allowed for %s", (roleCode, expected) => {
    const visible = [child("/dashboard"), child("/dashboard/direction"), child("/dashboard/operateurs"), child("/dashboard/geographie")]
      .filter((item) => isNavItemVisible(item, permissions, roleCode))
      .map((item) => item.href);

    expect(visible).toEqual(expected);
  });

  it("keeps route restrictions aligned with navigation roles", () => {
    for (const item of dashboard.children!.filter((entry) => entry.roles)) {
      const restriction = ROLE_ONLY_ROUTE_PREFIXES.find((entry) => entry.prefix === item.href);
      expect(restriction?.roles).toEqual(item.roles);
    }
  });
});
