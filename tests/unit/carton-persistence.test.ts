import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { buildCartonLegacyKey, resolveCartonId } from "@/lib/cartons/persistence";

const identity = { siteId: 2, entrepotId: 3, codeBarres: "BOX-1", libelleCarton: "Archives" };

function transaction() {
  const mocks = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    carton: {
      findUnique: vi.fn().mockResolvedValue({ id: 11 }),
      update: vi.fn().mockResolvedValue({ id: 11 }),
    },
    dossier: { count: vi.fn().mockResolvedValue(0) },
    transferLotItem: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { mocks, tx: mocks as unknown as Prisma.TransactionClient };
}

describe("résolution persistante des cartons", () => {
  it("identifie le carton par son libellé, sans mélanger deux sites ou salles", () => {
    const key = buildCartonLegacyKey(identity);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(buildCartonLegacyKey({ ...identity, codeBarres: "AUTRE-CODE" })).toBe(key);
    expect(buildCartonLegacyKey({ ...identity, libelleCarton: " ARCHIVES. " })).toBe(key);
    expect(buildCartonLegacyKey({ ...identity, siteId: 4 })).not.toBe(key);
    expect(buildCartonLegacyKey({ ...identity, entrepotId: null })).not.toBe(key);
  });

  it("utilise le code (casse significative) uniquement en l'absence de libellé et préserve les frontières des champs", () => {
    const byCode = { ...identity, libelleCarton: null };
    expect(buildCartonLegacyKey({ ...byCode, codeBarres: " BOX-1 " })).toBe(buildCartonLegacyKey(byCode));
    expect(buildCartonLegacyKey({ ...byCode, codeBarres: "box-1" })).not.toBe(buildCartonLegacyKey(byCode));
    expect(buildCartonLegacyKey({ siteId: 1, entrepotId: 23, codeBarres: "x" })).not.toBe(buildCartonLegacyKey({ siteId: 12, entrepotId: 3, codeBarres: "x" }));
    expect(buildCartonLegacyKey({ codeBarres: "x" })).not.toBe(buildCartonLegacyKey({ libelleCarton: "x" }));
  });

  it("laisse un dossier non identifié sans carton inventé", async () => {
    const { tx, mocks } = transaction();
    expect(await resolveCartonId(tx, { codeBarres: " ", libelleCarton: null })).toBeNull();
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
  });

  it("attribue le même carton aux nouvelles fiches d'un carton présent", async () => {
    const { tx, mocks } = transaction();
    mocks.$queryRaw.mockResolvedValueOnce([{ cartonId: 11 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ cartonId: 11 }]);
    expect(await resolveCartonId(tx, identity)).toBe(11);
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.transferLotItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cartonId: 11 }) }));
  });

  it("utilise un upsert SQL atomique pour deux admissions concurrentes de la même identification", async () => {
    const { tx, mocks } = transaction();
    expect(await resolveCartonId(tx, identity)).toBe(11);
    const statement = mocks.$executeRaw.mock.calls[0][0];
    expect(statement.sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(statement.values).toContain(buildCartonLegacyKey(identity));
    expect(mocks.carton.findUnique).toHaveBeenCalledWith({ where: { legacyKey: buildCartonLegacyKey(identity) }, select: { id: true } });
  });

  it("ne fusionne pas deux cartons partageant une ancienne identification", async () => {
    const { tx, mocks } = transaction();
    mocks.$queryRaw.mockResolvedValueOnce([{ cartonId: 11 }, { cartonId: 12 }]);
    await expect(resolveCartonId(tx, identity)).rejects.toThrow("Plusieurs cartons");
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
  });

  it("refuse l'ajout d'un dossier après gel du contenu pour transfert", async () => {
    const { tx, mocks } = transaction();
    mocks.$queryRaw.mockResolvedValueOnce([{ cartonId: 11 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ cartonId: 11 }]);
    mocks.transferLotItem.findFirst.mockResolvedValue({ id: 7 });
    await expect(resolveCartonId(tx, identity)).rejects.toThrow("transfert ouvert");
  });

  it("conserve l'identité d'un dossier déjà lié pendant une correction de libellé", async () => {
    const { tx, mocks } = transaction();
    const result = await resolveCartonId(tx, { ...identity, libelleCarton: "Archives renommées" }, { ...identity, id: 6, cartonId: 11 });
    expect(result).toBe(11);
    expect(mocks.carton.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { legacyKey: null } });
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
  });

  it("refuse de déplacer isolément un dossier d'un carton partagé", async () => {
    const { tx, mocks } = transaction();
    mocks.dossier.count.mockResolvedValue(1);
    await expect(resolveCartonId(tx, { ...identity, siteId: 9 }, { ...identity, id: 6, cartonId: 11 })).rejects.toThrow("carton complet");
    expect(mocks.carton.update).not.toHaveBeenCalled();
  });

  it("refuse une admission si le carton a bougé pendant l'attente du verrou", async () => {
    const { tx, mocks } = transaction();
    mocks.$queryRaw.mockResolvedValueOnce([{ cartonId: 11 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(resolveCartonId(tx, identity)).rejects.toThrow("vient de changer");
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
  });
});
