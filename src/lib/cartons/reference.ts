/** Référence publique permanente, indépendante du site et du code hérité. */
export function formatCartonReference(id: number): string {
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new Error("Identifiant de carton invalide.");
  }
  return `CTN-${String(id).padStart(8, "0")}`;
}

export function parseCartonReference(value: string): number | null {
  const match = /^CTN-(\d{8,10})$/i.exec(value.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647
    && formatCartonReference(id).toUpperCase() === value.trim().toUpperCase() ? id : null;
}
