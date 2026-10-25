import type { Prisma } from "@prisma/client";
import { formatCartonReference } from "@/lib/cartons/reference";

export type CartonIdentity = {
  cartonId?: number | null;
  siteId: number | null | undefined;
  codeBarres: string | null;
  libelleCarton: string | null;
};

export function buildCartonToken(identity: CartonIdentity) {
  if (identity.cartonId != null) {
    return Number.isInteger(identity.cartonId) && identity.cartonId > 0 && identity.cartonId <= 2_147_483_647
      ? `carton:${identity.cartonId}`
      : null;
  }
  const site = identity.siteId === undefined ? "any" : identity.siteId === null ? "none" : String(identity.siteId);
  if (identity.codeBarres?.trim()) {
    return `site:${site}|code:${encodeURIComponent(identity.codeBarres.trim())}`;
  }
  if (identity.libelleCarton?.trim()) {
    return `site:${site}|label:${encodeURIComponent(identity.libelleCarton.trim())}`;
  }
  return null;
}

export function parseCartonToken(token: string): CartonIdentity | null {
  const trimmed = token.trim();
  if (trimmed.startsWith("carton:")) {
    const rawId = trimmed.slice(7);
    const cartonId = Number(rawId);
    if (!/^\d+$/.test(rawId) || !Number.isInteger(cartonId) || cartonId <= 0 || cartonId > 2_147_483_647) return null;
    return { cartonId, siteId: undefined, codeBarres: null, libelleCarton: null };
  }
  const separator = trimmed.indexOf("|");
  const sitePart = separator >= 0 ? trimmed.slice(0, separator) : "site:any";
  const identityPart = separator >= 0 ? trimmed.slice(separator + 1) : trimmed;

  if (!sitePart.startsWith("site:")) return null;
  const rawSite = sitePart.slice(5);
  let siteId: number | null | undefined;
  if (rawSite === "any") siteId = undefined;
  else if (rawSite === "none") siteId = null;
  else if (/^\d+$/.test(rawSite)) siteId = Number(rawSite);
  else return null;

  const delimiter = identityPart.indexOf(":");
  if (delimiter < 1) return null;
  const kind = identityPart.slice(0, delimiter);
  let value: string;
  try {
    value = decodeURIComponent(identityPart.slice(delimiter + 1)).trim();
  } catch {
    return null;
  }
  if (!value) return null;

  if (kind === "code") return { siteId, codeBarres: value, libelleCarton: null };
  if (kind === "label") return { siteId, codeBarres: null, libelleCarton: value };
  return null;
}

export function cartonWhereFromToken(token: string): Prisma.DossierWhereInput | null {
  const identity = parseCartonToken(token);
  if (!identity) return null;
  if (identity.cartonId != null) return { cartonId: identity.cartonId };

  return {
    ...(identity.siteId !== undefined ? { siteId: identity.siteId } : {}),
    ...(identity.codeBarres
      ? { codeBarres: identity.codeBarres }
      : { codeBarres: null, libelleCarton: identity.libelleCarton }),
  };
}

export function getCartonDisplay(identity: Pick<CartonIdentity, "cartonId" | "codeBarres" | "libelleCarton">) {
  if (identity.cartonId != null) {
    return {
      label: formatCartonReference(identity.cartonId),
      description: Array.from(new Set([identity.codeBarres?.trim(), identity.libelleCarton?.trim()].filter(Boolean))).join(" · ") || null,
    };
  }
  return {
    label: identity.codeBarres ?? identity.libelleCarton ?? "Carton non identifié",
    description: identity.codeBarres && identity.libelleCarton ? identity.libelleCarton : null,
  };
}
