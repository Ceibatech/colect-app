import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deliveries = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, updates: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/prisma/client", () => ({ prisma: { mulcvDelivery: {
  findMany: async () => deliveries.rows,
  update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => { deliveries.updates.push({ id: where.id, ...data }); },
  updateMany: async ({ data }: { data: Record<string, unknown> }) => { deliveries.updates.push({ all: true, ...data }); },
} } }));

import { processPendingMulcvDeliveries } from "@/lib/services/mulcv-sync-service";

const payload = { conteneurId: "LOT-2026-000007-C-01", zone: "Zone_Sud", cartons: [{ cartonUid: "2010-KOU-0201", dossiers: [{ dossierId: "2010-KOU-0201-001" }] }] };
const row = (id: number) => ({ id, payload, attemptCount: 0 });

describe("file d'envoi des caisses vers MULCV", () => {
  beforeEach(() => {
    deliveries.rows = [];
    deliveries.updates = [];
    vi.stubEnv("MULCV_API_BASE", "https://mulcv.test/api/v1/");
    vi.stubEnv("MULCV_TOKEN_URL", "https://kc.test/token");
    vi.stubEnv("MULCV_CLIENT_SECRET", "secret");
    vi.stubEnv("MULCV_ZONE", "Zone_Nord");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("ne fait rien tant que MULCV n'est pas configuré", async () => {
    vi.stubEnv("MULCV_CLIENT_SECRET", "");
    expect(await processPendingMulcvDeliveries()).toMatchObject({ configured: false, due: 0 });
  });

  it("envoie avec le jeton du compte geoarchiv et la zone configurée, puis marque l'envoi", async () => {
    deliveries.rows = [row(1)];
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/token")) return Response.json({ access_token: "jwt" });
      return Response.json({ path: "Scan/Production/Zone_Nord/LOT-2026-000007-C-01" }, { status: 201 });
    }));
    expect(await processPendingMulcvDeliveries()).toMatchObject({ sent: 1, failed: 0 });
    expect(String(calls[0].init.body)).toContain("client_id=geoarchiv");
    expect(calls[1].url).toBe("https://mulcv.test/api/v1/intake/geoarchiv/conteneurs");
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(calls[1].init.body)).zone).toBe("Zone_Nord");
    expect(deliveries.updates[0]).toMatchObject({ id: 1, status: "SENT", mulcvPath: "Scan/Production/Zone_Nord/LOT-2026-000007-C-01" });
  });

  it("un refus de MULCV est définitif et garde sa raison ; une panne est retentée", async () => {
    deliveries.rows = [row(1), row(2)];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/token")) return Response.json({ access_token: "jwt" });
      call++;
      return call === 1 ? Response.json({ message: "Le conteneur contiendrait 41 cartons" }, { status: 409 }) : new Response("", { status: 502 });
    }));
    expect(await processPendingMulcvDeliveries(new Date("2026-11-03T10:00:00Z"))).toMatchObject({ sent: 0, failed: 2 });
    expect(deliveries.updates[0]).toMatchObject({ id: 1, status: "REJECTED", nextAttemptAt: null });
    expect(String(deliveries.updates[0].errorMessage)).toContain("41 cartons");
    expect(deliveries.updates[1]).toMatchObject({ id: 2, status: "FAILED" });
    expect((deliveries.updates[1].nextAttemptAt as Date).getTime()).toBeGreaterThan(new Date("2026-11-03T10:00:00Z").getTime());
  });
});
