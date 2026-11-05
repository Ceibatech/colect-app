import { describe, expect, it } from "vitest";
import { CONTROLES, diagnostiquer, plain } from "../../deploy/diagnostic-base.mjs";

describe("diagnostic de la base", () => {
  it("convertit les entiers 64 bits et les dates en valeurs JSON", () => {
    expect(plain([{ n: BigInt(5), d: new Date("2026-11-05T00:00:00Z"), t: "x" }])).toEqual([{ n: 5, d: "2026-11-05T00:00:00.000Z", t: "x" }]);
  });

  it("ne contient que des lectures : aucune requête ne modifie la base", () => {
    for (const [nom, sql] of CONTROLES as Array<[string, string]>) {
      expect(sql, nom).toMatch(/^\s*SELECT\b/i);
      expect(sql, nom).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE|CREATE)\b/i);
    }
  });

  it("n'expose aucune colonne de données personnelles dans les résultats", () => {
    for (const [nom, sql] of CONTROLES as Array<[string, string]>) {
      expect(sql, nom).not.toMatch(/\bd\.(nom|prenoms|adresse|telephone|email|mobile|personne_contact)\b/i);
      expect(sql, nom).not.toMatch(/SELECT[^;]*\b(prenoms|telephone|email|mobile)\b/i);
    }
  });

  it("isole un contrôle en erreur sans arrêter les autres", async () => {
    const db = { $queryRawUnsafe: async (sql: string) => { if (sql.includes("BOOM")) throw new Error("table inconnue"); return [{ n: BigInt(2) }]; } };
    const resultat = await diagnostiquer(db, [["bon", "SELECT 1"], ["mauvais", "SELECT BOOM"]]);
    expect(resultat.controles.bon).toEqual([{ n: 2 }]);
    expect(resultat.erreurs.mauvais).toContain("table inconnue");
  });
});
