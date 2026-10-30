// Lots de transfert préparés par plage de cotes, au nom d'un gestionnaire, puis
// soumis à la validation interne. Appelle la route interne de l'application.
//
//   node deploy/creer-lots.mjs --gestionnaire="IDRISS BADO" --plages="2010-KOU-0001 à 200;2010-KOU-0201 à 320" \
//     --date=2026-10-31T10:00 [--apply]
const arg = (name, fallback = "") => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = (process.env.GEOARCHIVES_INTERNAL_URL || "http://app:3000").replace(/\/$/, "");
const token = process.env.REPORTS_CRON_SECRET?.trim();
if (!token) { console.error("REPORTS_CRON_SECRET manquant."); process.exit(1); }

const body = {
  apply: process.argv.includes("--apply"),
  userName: arg("gestionnaire"),
  destinationSiteNom: arg("destination", "Site CEIBA"),
  plannedAt: arg("date"),
  transportMethod: arg("transport", "VEHICULE_CEIBA"),
  plannedRoute: arg("itineraire", "Site ministère - Plateau → Site CEIBA, trajet direct sans arrêt"),
  motif: arg("motif", "Enlèvement des cartons étiquetés (liste d'enlèvement de Koumassi)"),
  plages: arg("plages").split(";").map((plage) => plage.trim()).filter(Boolean),
};
const response = await fetch(`${baseUrl}/api/internal/transferts/lots`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) { console.error(`Refusé (${response.status}) : ${payload.error ?? JSON.stringify(payload)}`); process.exit(1); }
console.log(body.apply ? `CRÉÉS au nom de ${payload.createdFor} :` : `SIMULATION (rien n'est créé), au nom de ${payload.createdFor} :`);
for (const lot of payload.results) {
  console.log(`  - ${lot.plage} : ${lot.cartons} cartons, ${lot.dossiers} dossiers${lot.autresEmplacements ? ` (${lot.autresEmplacements} autre(s) emplacement(s) écarté(s))` : ""}${lot.reference ? ` → ${lot.reference} (${lot.status})${lot.soumis ? ", soumis à la validation interne" : `, non soumis : ${lot.erreur}`}` : ""}`);
}
