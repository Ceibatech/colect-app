import "server-only";

import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/utils/api-error";

function workerToken(): string {
  const token = process.env.INDEXING_WORKER_TOKEN?.trim();
  if (!token || token.length < 32) {
    throw new ApiError("Le service d'indexation n'est pas configuré.", 503);
  }
  return token;
}

export function requireIndexingWorker(request: Request): void {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const expected = workerToken();
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError("Worker d'indexation non autorisé.", 401);
  }
}
