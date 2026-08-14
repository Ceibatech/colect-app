import "server-only";

/**
 * Anti-bruteforce basique pour le login, en mémoire process.
 *
 * LIMITE CONNUE (documentée) : ce compteur est local à l'instance Node — il
 * ne protège pas contre un déploiement multi-instances (scaling horizontal
 * sur Render). Pour la production à fort trafic, remplacer par un store
 * partagé (Redis, table `settings`/dédiée, etc.). Suffisant pour la V1.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Attempt {
  count: number;
  firstAttemptAt: number;
}

const attempts = new Map<string, Attempt>();

/**
 * Purge opportuniste des entrées expirées (Phase 14, §94) : sans ça, une
 * clé (email:ip) qui échoue une seule fois puis n'est jamais retentée reste
 * en mémoire indéfiniment — fuite mémoire lente sur un process long-running.
 * `isRateLimited`/`clearAttempts` nettoient déjà leur propre clé au passage,
 * mais une clé jamais revisitée ne l'était par personne ; on balaie donc
 * tout le Map ici, déclenché par l'activité (pas de `setInterval` — évite
 * les instances dupliquées en hot-reload dev / multi-process).
 */
function sweepExpired(): void {
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (now - v.firstAttemptAt > WINDOW_MS) attempts.delete(k);
  }
}

export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(key: string): void {
  sweepExpired();
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
