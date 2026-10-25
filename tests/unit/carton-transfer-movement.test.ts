import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), movement: vi.fn(), lock: vi.fn(), extraMembers: vi.fn(),
  dossiers: vi.fn(), cartons: vi.fn(), items: vi.fn(), signature: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ requirePermission: async () => ({ userId: 7 }) }));
vi.mock("@/lib/prisma/client", () => ({ prisma: {
  $transaction: mocks.transaction, transferMovement: { findUnique: async () => null },
} }));
vi.mock("@/lib/utils/server-request", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/services/transfer-notification-service", () => ({ notifyTransferWorkflow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { approveTransferMovementByMinistry } from "@/lib/services/transfer-actions";

function approval() {
  const form = new FormData();
  form.set("signatoryName", "Responsable ministère");
  form.set("signatoryTitle", "Directeur des archives");
  form.set("signature", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
  return form;
}

describe("permanent carton identity across physical movements", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.extraMembers.mockResolvedValue(0);
    mocks.dossiers.mockResolvedValue({ count: 2 });
    mocks.items.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (run) => run({
      $queryRaw: mocks.lock,
      carton: { updateMany: mocks.cartons },
      dossier: { count: mocks.extraMembers, updateMany: mocks.dossiers },
      transferMovement: { findFirst: mocks.movement, update: vi.fn() },
      transferLotItem: { updateMany: mocks.items, findMany: async () => [{ status: "RECU" }] },
      transferLot: { update: vi.fn() },
      transferSignature: { create: mocks.signature },
      dossierHistory: { createMany: vi.fn() },
      auditLog: { create: vi.fn() },
    }));
  });

  it.each([
    { type: "SORTIE", before: "PREVU", from: { siteId: 2, entrepotId: 8 }, to: { siteId: null, entrepotId: null } },
    { type: "RECEPTION", before: "SORTI", from: { siteId: null, entrepotId: null }, to: { siteId: 3, entrepotId: 9 } },
    { type: "RETOUR", before: "RECU", from: { siteId: 3, entrepotId: 9 }, to: { siteId: 2, entrepotId: 8 } },
  ])("preserves the carton FK and all manifest members on $type", async ({ type, before, from, to }) => {
    mocks.movement.mockResolvedValue({
      id: 12, transferLotId: 4, reference: "F-12", type, occurredAt: new Date(),
      transferLot: { status: "AUTORISE", sourceSiteId: 2, sourceEntrepotId: 8, destinationSiteId: 3, destinationEntrepotId: 9 },
      items: [{ transferLotItemId: 5, transferLotItem: { cartonId: 123, status: before, dossiers: [{ dossierId: 10 }, { dossierId: 11 }] } }],
    });
    expect(await approveTransferMovementByMinistry(12, {}, approval())).toMatchObject({ success: true });
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.extraMembers).toHaveBeenCalledWith({ where: { cartonId: { in: [123] }, id: { notIn: [10, 11] } } });
    // Only the location changes: neither the carton identity nor its members do.
    expect(mocks.dossiers).toHaveBeenCalledWith({ where: { id: { in: [10, 11] }, ...from }, data: to });
    expect(mocks.cartons).toHaveBeenCalledWith({ where: { id: { in: [123] } }, data: { legacyKey: null } });
    expect(mocks.signature).toHaveBeenCalledOnce();
  });

  it("refuses to move a carton whose current content exceeds the signed manifest", async () => {
    mocks.movement.mockResolvedValue({
      id: 12, transferLotId: 4, reference: "F-12", type: "SORTIE", occurredAt: new Date(),
      transferLot: { sourceSiteId: 2, sourceEntrepotId: 8 },
      items: [{ transferLotItemId: 5, transferLotItem: { cartonId: 123, status: "PREVU", dossiers: [{ dossierId: 10 }, { dossierId: 11 }] } }],
    });
    mocks.extraMembers.mockResolvedValue(1);
    const result = await approveTransferMovementByMinistry(12, {}, approval());
    expect(result.error).toContain("contenu d'un carton a changé");
    expect(mocks.dossiers).not.toHaveBeenCalled();
    expect(mocks.cartons).not.toHaveBeenCalled();
    expect(mocks.signature).not.toHaveBeenCalled();
  });
});
