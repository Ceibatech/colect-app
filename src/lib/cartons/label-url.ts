/**
 * Adresse encodée dans le QR des cartons et dossiers. Les étiquettes restent chez le ministère
 * après l'archivage : elles ouvrent le SAE (portail MULCV), jamais GeoArchiv. LABEL_QR_BASE est
 * l'adresse du portail, par exemple https://mulcv-dev.ceiba-analytics.com/app ; sans elle, l'ancienne
 * adresse GeoArchiv (…/c/<cote>) est conservée.
 */
export function labelQrBase(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.LABEL_QR_BASE?.trim().replace(/\/+$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.search && !url.hash ? value : null;
  } catch {
    return null;
  }
}

/** Adresse du QR : <SAE>/q/<cote> si LABEL_QR_BASE est défini, sinon <GeoArchiv>/c/<cote>. */
export function labelScanUrl(origin: string, reference: string, base: string | null = labelQrBase()): string {
  const ref = encodeURIComponent(reference);
  return base ? `${base}/q/${ref}` : `${origin}/c/${ref}`;
}
