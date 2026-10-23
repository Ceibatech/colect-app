import "server-only";

import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/utils/api-error";

function schedulerToken(): string {
  const token = process.env.REPORTS_CRON_SECRET?.trim();
  if (!token || token.length < 32) {
    throw new ApiError("Le service de rapports n'est pas configuré.", 503);
  }
  return token;
}

export function requireEmailReportScheduler(request: Request): void {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const expected = schedulerToken();
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError("Ordonnanceur de rapports non autorisé.", 401);
  }
}
