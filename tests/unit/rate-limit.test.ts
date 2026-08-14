import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Module à état module-level (un seul `Map` partagé par tout le process) —
 * on réimporte à chaque test (`vi.resetModules()`) pour repartir d'un état
 * vide, plutôt que de dépendre de l'ordre d'exécution des tests.
 */
async function freshRateLimit() {
  vi.resetModules();
  return import("@/lib/auth/rate-limit");
}

describe("rate-limit (anti-bruteforce login, §94 — purge mémoire)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'est pas limité avant MAX_ATTEMPTS (5) échecs", async () => {
    const { isRateLimited, registerFailedAttempt } = await freshRateLimit();
    const key = "a@b.com:127.0.0.1";
    for (let i = 0; i < 4; i++) registerFailedAttempt(key);
    expect(isRateLimited(key)).toBe(false);
  });

  it("est limité à partir du 5e échec dans la fenêtre de 15 min", async () => {
    const { isRateLimited, registerFailedAttempt } = await freshRateLimit();
    const key = "a@b.com:127.0.0.1";
    for (let i = 0; i < 5; i++) registerFailedAttempt(key);
    expect(isRateLimited(key)).toBe(true);
  });

  it("clearAttempts lève la limitation immédiatement (login réussi)", async () => {
    const { isRateLimited, registerFailedAttempt, clearAttempts } = await freshRateLimit();
    const key = "a@b.com:127.0.0.1";
    for (let i = 0; i < 5; i++) registerFailedAttempt(key);
    expect(isRateLimited(key)).toBe(true);
    clearAttempts(key);
    expect(isRateLimited(key)).toBe(false);
  });

  it("la limitation expire après la fenêtre de 15 minutes", async () => {
    const { isRateLimited, registerFailedAttempt } = await freshRateLimit();
    const key = "a@b.com:127.0.0.1";
    for (let i = 0; i < 5; i++) registerFailedAttempt(key);
    expect(isRateLimited(key)).toBe(true);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(isRateLimited(key)).toBe(false);
  });

  it("des clés distinctes (email:ip différents) sont comptées indépendamment", async () => {
    const { isRateLimited, registerFailedAttempt } = await freshRateLimit();
    for (let i = 0; i < 5; i++) registerFailedAttempt("a@b.com:127.0.0.1");
    expect(isRateLimited("a@b.com:127.0.0.1")).toBe(true);
    expect(isRateLimited("c@d.com:127.0.0.1")).toBe(false);
  });

  // Note : la purge opportuniste des entrées expirées (`sweepExpired()`,
  // Phase 14 §94) est une optimisation mémoire pure — elle ne change aucun
  // comportement observable via l'API publique (`registerFailedAttempt` sait
  // déjà, indépendamment, repartir de zéro pour une clé expirée). Elle n'a
  // donc pas de test comportemental dédié ici ; ce qui compte (la fenêtre de
  // 15 min par clé) est déjà couvert par les tests ci-dessus.
});
