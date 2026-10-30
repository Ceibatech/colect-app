import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Session « au nom de » : utilisée uniquement par une route interne protégée
 * par le jeton du serveur, pour qu'une opération préparée par l'équipe
 * GeoArchives soit créée au nom du gestionnaire désigné, avec ses droits.
 * Jamais alimentée depuis une requête de navigateur.
 */
const storage = new AsyncLocalStorage<SessionPayload>();

export function actingAs<T>(session: SessionPayload, run: () => Promise<T>): Promise<T> {
  return storage.run(session, run);
}

export function getActingSession(): SessionPayload | null {
  return storage.getStore() ?? null;
}
