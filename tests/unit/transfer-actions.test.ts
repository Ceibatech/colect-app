import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  transaction: vi.fn(),
  lotUpdate: vi.fn(),
  lotFind: vi.fn(),
  auditCreate: vi.fn(),
  movementCreate: vi.fn(),
  itemUpdate: vi.fn(),
  dossierUpdate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/prisma/client", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/utils/server-request", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  approveTransferLotByCeibac,
  authorizeTransferLot,
  recordTransferMovement,
  submitTransferLot,
} from "@/lib/services/transfer-actions";

const drawnSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const now = new Date("2026-10-23T09:00:00Z");

interface MemoryLot {
  id: number;
  status: string;
  createdAt: Date;
  items: { id: number; status: string; dossiers: { dossierId: number }[] }[];
  submittedAt?: Date;
  ceibacValidatedAt?: Date | null;
  ceibacValidatedById?: number;
  ceibacSignatoryName?: string;
  ceibacSignatoryTitle?: string;
  ceibacSignatureData?: string;
  authorizedAt?: Date;
  authorizedById?: number;
  approvalSignatoryName?: string;
  approvalSignatoryTitle?: string;
  approvalSignatureData?: string;
}

interface LotUpdate {
  where: { id: number; status: string; items?: { some: object }; ceibacValidatedAt?: { not: null } };
  data: Partial<MemoryLot>;
}

type AuditEntry = { userId: number; action: string; entityId: number; [key: string]: unknown };

const tx = {
  transferLot: { updateMany: mocks.lotUpdate, findUnique: mocks.lotFind },
  auditLog: { create: mocks.auditCreate },
  transferMovement: { create: mocks.movementCreate },
  transferLotItem: { updateMany: mocks.itemUpdate },
  dossier: { updateMany: mocks.dossierUpdate },
};

let lot: MemoryLot;
let audits: AuditEntry[];

function approvalForm(name = "Responsable CEIBA", signature = drawnSignature) {
  const form = new FormData();
  form.set("signatoryName", name);
  form.set("signatoryTitle", "Directeur des archives");
  form.set("signature", signature);
  return form;
}

function departureForm() {
  const form = new FormData();
  form.set("type", "SORTIE");
  form.set("itemIds", "51");
  form.set("occurredAt", now.toISOString());
  form.set("observations", "");
  form.set("ministryName", "Responsable Ministère");
  form.set("ministryTitle", "Directeur des archives");
  form.set("ministrySignature", drawnSignature);
  form.set("ceibacName", "Responsable CEIBA");
  form.set("ceibacTitle", "Directeur logistique");
  form.set("ceibacSignature", drawnSignature);
  return form;
}

describe("pre-departure transfer approvals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    lot = {
      id: 12,
      status: "BROUILLON",
      createdAt: new Date("2026-10-22T09:00:00Z"),
      items: [{ id: 51, status: "PREVU", dossiers: [{ dossierId: 99 }] }],
      ceibacValidatedAt: null,
    };
    audits = [];
    mocks.requirePermission.mockResolvedValue({ userId: 27 });
    mocks.lotUpdate.mockImplementation(async ({ where, data }: LotUpdate) => {
      if (where.id !== lot.id || where.status !== lot.status) return { count: 0 };
      if (where.items?.some && lot.items.length === 0) return { count: 0 };
      if (where.ceibacValidatedAt?.not === null && !lot.ceibacValidatedAt) return { count: 0 };
      Object.assign(lot, data);
      return { count: 1 };
    });
    mocks.lotFind.mockImplementation(async ({ where }: { where: { id: number } }) => where.id === lot.id ? structuredClone(lot) : null);
    mocks.auditCreate.mockImplementation(async ({ data }: { data: AuditEntry }) => {
      audits.push(structuredClone(data));
      return data;
    });
    mocks.transaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) => {
      const previousLot = structuredClone(lot);
      const previousAudits = structuredClone(audits);
      try {
        return await run(tx);
      } catch (error) {
        lot = previousLot;
        audits = previousAudits;
        throw error;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("records submission, CEIBA visa and ministry authorization in that order", async () => {
    expect(await submitTransferLot(12)).toMatchObject({ success: true });
    expect(lot).toMatchObject({ status: "SOUMIS", submittedAt: now });

    expect(await approveTransferLotByCeibac(12, {}, approvalForm())).toMatchObject({ success: true });
    expect(lot).toMatchObject({
      status: "VALIDE_CEIBAC", ceibacValidatedAt: now, ceibacValidatedById: 27,
      ceibacSignatoryName: "Responsable CEIBA", ceibacSignatureData: drawnSignature,
    });
    expect(lot.authorizedAt).toBeUndefined();

    mocks.requirePermission.mockResolvedValue({ userId: 31 });
    expect(await authorizeTransferLot(12, {}, approvalForm("Responsable Ministère"))).toMatchObject({ success: true });
    expect(lot).toMatchObject({
      status: "AUTORISE", authorizedAt: now, authorizedById: 31,
      approvalSignatoryName: "Responsable Ministère", approvalSignatureData: drawnSignature,
      ceibacSignatoryName: "Responsable CEIBA", ceibacValidatedById: 27,
    });
    expect(audits.map(({ action, userId, entityId }) => ({ action, userId, entityId }))).toEqual([
      { action: "TRANSFER_LOT_SUBMIT", userId: 27, entityId: 12 },
      { action: "TRANSFER_LOT_CEIBAC_APPROVE", userId: 27, entityId: 12 },
      { action: "TRANSFER_LOT_AUTHORIZE", userId: 31, entityId: 12 },
    ]);
    expect(mocks.requirePermission.mock.calls.map(([permission]) => permission))
      .toEqual(["TRANSFER_SUBMIT", "TRANSFER_CEIBAC_APPROVE", "TRANSFER_AUTHORIZE"]);
  });

  it.each(["BROUILLON", "SOUMIS"])("refuses ministry approval from %s without a CEIBA visa", async (status) => {
    lot.status = status;
    const result = await authorizeTransferLot(12, {}, approvalForm("Responsable Ministère"));
    expect(result.success).not.toBe(true);
    expect(result.error).toContain("validé par CEIBA");
    expect(lot.status).toBe(status);
    expect(lot.approvalSignatureData).toBeUndefined();
    expect(audits).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires evidence of the CEIBA visa even if the lot carries its status", async () => {
    lot.status = "VALIDE_CEIBAC";
    expect(await authorizeTransferLot(12, {}, approvalForm())).toHaveProperty("error");
    expect(audits).toEqual([]);
    expect(lot.status).toBe("VALIDE_CEIBAC");
  });

  it.each(["BROUILLON", "AUTORISE", "ANNULE", "CLOTURE"])("refuses CEIBA approval from %s", async (status) => {
    lot.status = status;
    expect(await approveTransferLotByCeibac(12, {}, approvalForm())).toHaveProperty("error");
    expect(lot.status).toBe(status);
    expect(lot.ceibacSignatureData).toBeUndefined();
    expect(audits).toEqual([]);
  });

  it("does not replace an existing CEIBA signature when an approval is retried", async () => {
    lot.status = "SOUMIS";
    await approveTransferLotByCeibac(12, {}, approvalForm());
    const signedLot = structuredClone(lot);
    expect(await approveTransferLotByCeibac(12, {}, approvalForm("Second signataire"))).toHaveProperty("error");
    expect(lot).toEqual(signedLot);
    expect(audits).toHaveLength(1);
  });

  it("does not replace an existing ministry signature when an authorization is retried", async () => {
    lot.status = "VALIDE_CEIBAC";
    lot.ceibacValidatedAt = now;
    await authorizeTransferLot(12, {}, approvalForm("Responsable Ministère"));
    const signedLot = structuredClone(lot);
    expect(await authorizeTransferLot(12, {}, approvalForm("Second signataire"))).toHaveProperty("error");
    expect(lot).toEqual(signedLot);
    expect(audits).toHaveLength(1);
  });

  it("refuses to submit or sign an empty lot", async () => {
    lot.items = [];
    expect(await submitTransferLot(12)).toHaveProperty("error");
    lot.status = "SOUMIS";
    expect(await approveTransferLotByCeibac(12, {}, approvalForm())).toHaveProperty("error");
    expect(audits).toEqual([]);
  });

  it.each([
    ["CEIBA", approveTransferLotByCeibac],
    ["Ministère", authorizeTransferLot],
  ] as const)("rejects malformed %s signatures before opening a transaction", async (_label, approve) => {
    const result = await approve(12, {}, approvalForm("Responsable", "data:text/plain;base64," + "A".repeat(120)));
    expect(result.error).toContain("format de signature");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it.each([
    ["TRANSFER_SUBMIT", () => submitTransferLot(12)],
    ["TRANSFER_CEIBAC_APPROVE", () => approveTransferLotByCeibac(12, {}, approvalForm())],
    ["TRANSFER_AUTHORIZE", () => authorizeTransferLot(12, {}, approvalForm())],
    ["TRANSFER_OPERATE", () => recordTransferMovement(12, {}, departureForm())],
  ] as const)("checks %s before opening a transaction", async (permission, act) => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));
    await expect(act()).rejects.toThrow("forbidden");
    expect(mocks.requirePermission).toHaveBeenCalledWith(permission);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("blocks physical departure while the CEIBA-approved lot awaits ministry authorization", async () => {
    lot.status = "VALIDE_CEIBAC";
    lot.ceibacValidatedAt = now;
    const result = await recordTransferMovement(12, {}, departureForm());
    expect(result.error).toContain("autorisé par le ministère");
    expect(lot.status).toBe("VALIDE_CEIBAC");
    expect(lot.items[0].status).toBe("PREVU");
    expect(mocks.movementCreate).not.toHaveBeenCalled();
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
    expect(mocks.dossierUpdate).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("rolls back the CEIBA visa when its audit record cannot be written", async () => {
    lot.status = "SOUMIS";
    const previousLot = structuredClone(lot);
    mocks.auditCreate.mockRejectedValue(new Error("audit storage unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await approveTransferLotByCeibac(12, {}, approvalForm())).toHaveProperty("error");
    expect(lot).toEqual(previousLot);
    expect(audits).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
