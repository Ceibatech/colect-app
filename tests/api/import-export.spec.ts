import { test, expect } from "@playwright/test";
import { sessionCookieHeader, testPrisma, DEMO_USERS } from "../helpers/auth";
import { stringifyCsv } from "../../src/lib/utils/csv";
import { IMPORT_COLUMNS } from "../../src/lib/validation/import-columns";

/**
 * Tests API (Phase 13, §72) : import (§54) et export (§55). Le fichier CSV
 * de test est construit avec les mêmes en-têtes que `IMPORT_COLUMNS` (source
 * unique de vérité) pour ne jamais dupliquer un format en dur qui
 * diverge silencieusement du code réel. Code-barres préfixé `TEST-IMPORT-`
 * (donnée de test explicitement fictive) pour rester identifiable et
 * supprimé en fin de test.
 */

function buildImportCsv(codeBarres: string): string {
  const header = IMPORT_COLUMNS.map((c) => c.header);
  const row = IMPORT_COLUMNS.map((c) => {
    switch (c.key) {
      case "operateurMatricule":
        return "OP-001";
      case "codeBarres":
        return codeBarres;
      case "libelleCarton":
        return "Carton import test";
      case "communeRef":
        return "COM-01";
      case "natureRef":
        return "NAT-TF";
      case "nom":
        return "Import";
      case "prenoms":
        return "Test";
      default:
        return "";
    }
  });
  return stringifyCsv([header, row]);
}

test.describe("POST /api/import (aperçu — §54, ne modifie jamais la base)", () => {
  test("prévisualise un CSV valide sans créer de dossier", async ({ request }) => {
    const codeBarres = `TEST-IMPORT-${Date.now()}`;
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);

    const res = await request.post("/api/import", {
      headers: { Cookie: cookie },
      multipart: { file: { name: "test-import.csv", mimeType: "text/csv", buffer: Buffer.from(buildImportCsv(codeBarres), "utf-8") } },
    });
    expect(res.status()).toBe(200);
    const preview = await res.json();
    expect(preview.totalLignes).toBe(1);
    expect(preview.valides).toBe(1);
    expect(preview.invalides).toBe(0);
    expect(preview.doublons).toBe(0);

    // §54 : l'aperçu ne doit rien écrire en base.
    const existing = await testPrisma.dossier.findUnique({ where: { codeBarres } });
    expect(existing).toBeNull();
  });

  test("signale une erreur pour un opérateur inconnu", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const csv = stringifyCsv([IMPORT_COLUMNS.map((c) => c.header), ["OP-INEXISTANT", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
    const res = await request.post("/api/import", {
      headers: { Cookie: cookie },
      multipart: { file: { name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") } },
    });
    const preview = await res.json();
    expect(preview.invalides).toBe(1);
    expect(preview.rows[0].errors[0]).toContain("introuvable");
  });

  test("rejette un format de fichier non supporté", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const res = await request.post("/api/import", {
      headers: { Cookie: cookie },
      multipart: { file: { name: "test.txt", mimeType: "text/plain", buffer: Buffer.from("x") } },
    });
    expect(res.status()).toBe(400);
  });

  test("refuse un utilisateur sans IMPORT_DATA (SUPERVISEUR)", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const res = await request.post("/api/import", {
      headers: { Cookie: cookie },
      multipart: { file: { name: "test.csv", mimeType: "text/csv", buffer: Buffer.from(buildImportCsv("x")) } },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("POST /api/import/confirm (§54 — revalide tout côté serveur, §60)", () => {
  test("importe une ligne valide puis détecte le doublon à la seconde tentative", async ({ request }) => {
    const codeBarres = `TEST-IMPORT-${Date.now()}-confirm`;
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const csv = buildImportCsv(codeBarres);

    const previewRes = await request.post("/api/import", {
      headers: { Cookie: cookie },
      multipart: { file: { name: "test-import.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") } },
    });
    const preview = await previewRes.json();

    let createdId: number | undefined;
    try {
      const confirmRes = await request.post("/api/import/confirm", {
        headers: { Cookie: cookie },
        data: { fileName: "test-import.csv", rows: preview.rows.map((r: { data: unknown }) => r.data) },
      });
      expect(confirmRes.status()).toBe(200);
      const confirmed = await confirmRes.json();
      expect(confirmed.imported).toBe(1);
      expect(confirmed.skipped).toBe(0);

      const created = await testPrisma.dossier.findUnique({ where: { codeBarres } });
      expect(created).not.toBeNull();
      expect(created?.statutCollecte).toBe("BROUILLON");
      createdId = created?.id;

      // Deuxième tentative sur le même fichier : le code-barres existe
      // maintenant en base -> détecté comme doublon, rien de plus importé.
      const secondPreviewRes = await request.post("/api/import", {
        headers: { Cookie: cookie },
        multipart: { file: { name: "test-import.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") } },
      });
      const secondPreview = await secondPreviewRes.json();
      expect(secondPreview.doublons).toBe(1);
      expect(secondPreview.valides).toBe(0);
    } finally {
      if (createdId) await testPrisma.dossier.delete({ where: { id: createdId } }).catch(() => {});
    }
  });
});

test.describe("GET /api/export (§55)", () => {
  test("ADMIN exporte en CSV", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.admin);
    const res = await request.get("/api/export?format=csv", { headers: { Cookie: cookie } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("SUPERVISEUR exporte en XLSX", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const res = await request.get("/api/export?format=xlsx", { headers: { Cookie: cookie } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("refuse un utilisateur sans EXPORT_DATA (OPERATEUR)", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const res = await request.get("/api/export?format=csv", { headers: { Cookie: cookie } });
    expect(res.status()).toBe(403);
  });

  test("rejette une date de filtre invalide", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.admin);
    const res = await request.get("/api/export?format=csv&from=not-a-date", { headers: { Cookie: cookie } });
    expect(res.status()).toBe(400);
  });
});
