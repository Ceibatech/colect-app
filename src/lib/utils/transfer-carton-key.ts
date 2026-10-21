import "server-only";

export interface TransferCartonKey {
  siteId: number;
  entrepotId: number | null;
  cartonCode: string;
}

export function encodeTransferCartonKey(value: TransferCartonKey) {
  const code = Buffer.from(value.cartonCode, "utf8").toString("base64url");
  return `${value.siteId}.${value.entrepotId ?? 0}.${code}`;
}

export function decodeTransferCartonKey(value: string): TransferCartonKey | null {
  const [sitePart, entrepotPart, codePart, ...rest] = value.split(".");
  if (!sitePart || !entrepotPart || !codePart || rest.length > 0) return null;
  const siteId = Number(sitePart);
  const rawEntrepotId = Number(entrepotPart);
  if (!Number.isInteger(siteId) || siteId <= 0 || !Number.isInteger(rawEntrepotId) || rawEntrepotId < 0) return null;

  try {
    const cartonCode = Buffer.from(codePart, "base64url").toString("utf8").trim();
    if (!cartonCode) return null;
    return { siteId, entrepotId: rawEntrepotId || null, cartonCode };
  } catch {
    return null;
  }
}
