import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  lots: vi.fn(),
  movements: vi.fn(),
  movementCount: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    transferLot: { findMany: mocks.lots },
    transferMovement: { findMany: mocks.movements, count: mocks.movementCount },
  },
}));

import {
  getCeibacTransferValidationWorkspace,
  getTransferValidationWorkspace,
} from "@/lib/services/transfer-validation-service";
import { parseTransferValidationSearch } from "@/lib/validation/transfer-validation-search";

describe("transfer validation search", () => {
  it("defaults to receptions ready for the ministry and normalizes URL parameters", () => {
    expect(parseTransferValidationSearch({})).toEqual({ statut: "A_VALIDER", page: 1 });
    expect(parseTransferValidationSearch({ q: ["  LOT-26  ", "ignored"], statut: ["VALIDES"], page: "3" }))
      .toEqual({ q: "LOT-26", statut: "VALIDES", page: 3 });
  });

  it.each([
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "Infinity" },
    { page: "9999999999999999" }, { statut: "UNKNOWN" }, { q: "x".repeat(201) },
  ])("uses safe defaults for invalid URL input %j", (params) => {
    expect(parseTransferValidationSearch(params)).toEqual({ statut: "A_VALIDER", page: 1 });
  });
});

describe("transfer validation workspaces", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requirePermission.mockResolvedValue({});
    mocks.lots.mockResolvedValue([]);
    mocks.movements.mockResolvedValue([]);
    mocks.movementCount.mockResolvedValue(0);
  });

  it.each([
    ["TRANSFER_AUTHORIZE", () => getTransferValidationWorkspace(parseTransferValidationSearch({}))],
    ["TRANSFER_CEIBAC_APPROVE", () => getCeibacTransferValidationWorkspace()],
  ] as const)("denies access without %s before querying the database", async (permission, load) => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));
    await expect(load()).rejects.toThrow("forbidden");
    expect(mocks.requirePermission).toHaveBeenCalledWith(permission);
    expect(mocks.lots).not.toHaveBeenCalled();
    expect(mocks.movements).not.toHaveBeenCalled();
    expect(mocks.movementCount).not.toHaveBeenCalled();
  });

  it("shows ministry-ready lots and receptions without selecting image signatures", async () => {
    mocks.lots.mockResolvedValue([{
      id: 8, reference: "LOT-8", createdAt: new Date("2026-10-23T08:00:00Z"),
      sourceSite: { nom: "Ministère" }, sourceEntrepot: { nom: "Archives", localisation: "Bâtiment A" },
      destinationSite: { nom: "Site CEIBA" }, destinationEntrepot: null,
      items: [{ dossierCountSnapshot: 4 }, { dossierCountSnapshot: 7 }],
    }]);
    mocks.movements.mockResolvedValue([{
      id: 5, reference: "REC-5", type: "RECEPTION", status: "VALIDE_CEIBAC",
      items: [{ transferLotItem: { dossierCountSnapshot: 4 } }, { transferLotItem: { dossierCountSnapshot: 7 } }],
      signatures: [{ signatoryName: "Responsable CEIBA", party: "CEIBAC_VALIDATOR", signedAt: new Date() }],
    }]);
    mocks.movementCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(3);

    const result = await getTransferValidationWorkspace(parseTransferValidationSearch({}));

    expect(mocks.lots.mock.calls[0][0].where).toEqual({ status: "VALIDE_CEIBAC" });
    expect(mocks.movements.mock.calls[0][0]).toMatchObject({
      where: { type: "RECEPTION", status: "VALIDE_CEIBAC" },
      skip: 0, take: 25,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(mocks.movements.mock.calls[0][0].select.signatures.select)
      .toEqual({ signatoryName: true, party: true, signedAt: true });
    expect(result.lots[0]).toMatchObject({ source: "Ministère · Archives · Bâtiment A", destination: "Site CEIBA", dossierCount: 11 });
    expect(result.movements[0].dossierCount).toBe(11);
    expect(result.summary).toEqual({ pendingLots: 1, pendingReceptions: 1, awaitingCeibac: 3 });
  });

  it.each([
    ["A_VALIDER", { type: "RECEPTION", status: "VALIDE_CEIBAC" }],
    ["ATTENTE_CEIBAC", { type: "RECEPTION", status: "SOUMIS_CEIBAC" }],
    ["VALIDES", { status: "VALIDE_MINISTERE" }],
    ["TOUS", {}],
  ])("filters %s, searches both references and paginates consistently", async (statut, expectedStatus) => {
    mocks.movementCount.mockResolvedValueOnce(51).mockResolvedValueOnce(8).mockResolvedValueOnce(4);
    const result = await getTransferValidationWorkspace(parseTransferValidationSearch({ statut, q: "TR-26", page: "2" }));
    const expectedWhere = {
      ...expectedStatus,
      OR: [{ reference: { contains: "TR-26" } }, { transferLot: { reference: { contains: "TR-26" } } }],
    };
    expect(mocks.movements.mock.calls[0][0]).toMatchObject({ where: expectedWhere, skip: 25, take: 25 });
    expect(mocks.movementCount.mock.calls).toEqual([
      [{ where: expectedWhere }],
      [{ where: { type: "RECEPTION", status: "VALIDE_CEIBAC" } }],
      [{ where: { type: "RECEPTION", status: "SOUMIS_CEIBAC" } }],
    ]);
    expect(result).toMatchObject({ total: 51, page: 2, totalPages: 3 });
    expect(result.summary).toEqual({ pendingLots: 0, pendingReceptions: 8, awaitingCeibac: 4 });
  });

  it("gives CEIBA its own submitted lots and receptions before ministry approval", async () => {
    const result = await getCeibacTransferValidationWorkspace();
    expect(mocks.requirePermission).toHaveBeenCalledWith("TRANSFER_CEIBAC_APPROVE");
    expect(mocks.lots.mock.calls[0][0].where).toEqual({ status: "SOUMIS" });
    expect(mocks.movements.mock.calls[0][0].where).toEqual({ type: "RECEPTION", status: "SOUMIS_CEIBAC" });
    expect(result).toMatchObject({ total: 0, page: 1, totalPages: 1 });
  });

  it("keeps further CEIBA receptions accessible through pagination and search", async () => {
    mocks.movementCount.mockResolvedValueOnce(26).mockResolvedValueOnce(0).mockResolvedValueOnce(26);
    const result = await getCeibacTransferValidationWorkspace({ page: 2, q: " LOT-12 " });
    expect(mocks.movements.mock.calls[0][0]).toMatchObject({
      where: {
        type: "RECEPTION", status: "SOUMIS_CEIBAC",
        OR: [{ reference: { contains: "LOT-12" } }, { transferLot: { reference: { contains: "LOT-12" } } }],
      },
      skip: 25, take: 25,
    });
    expect(result).toMatchObject({ total: 26, page: 2, totalPages: 2 });
  });
});
