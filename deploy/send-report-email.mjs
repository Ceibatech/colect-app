// Envoie par e-mail (service d'envoi de GeoArchives, Resend) les fichiers de la
// récupération des boîtes : tableur, rapport et planches d'étiquettes.
//
//   node deploy/send-report-email.mjs --dir=/outbox --to=a@x --cc=b@x,c@x [--replaces=1]
//
// Lit summary.json et les fichiers .xlsx / .pdf du dossier. Utilise
// RESEND_API_KEY et EMAIL_FROM de la configuration de l'application.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function parseList(value) {
  const list = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of list) if (!EMAIL.test(item)) throw new Error(`Adresse invalide : ${item}`);
  if (list.length > 10) throw new Error("10 adresses au plus.");
  return list;
}

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const nf = (value) => new Intl.NumberFormat("fr-FR").format(value);

export function buildMessage(summary, files, { replaces = false } = {}) {
  const subject = `Récupération des archives MULCV – liste des ${nf(summary.boxes)} premiers cartons et étiquettes`;
  const labels = {
    "liste-cartons": "Liste des cartons et de leurs dossiers (Excel)",
    "rapport-cartons": "Rapport de synthèse (PDF)",
    "etiquettes-cartons": "Étiquettes des cartons (PDF)",
    "etiquettes-dossiers": "Étiquettes des dossiers (PDF)",
  };
  const documents = files.map((file) => labels[Object.keys(labels).find((key) => file.startsWith(key))] ?? file);
  const points = [
    `${nf(summary.boxes)} cartons, contenant au total ${nf(summary.dossiers)} dossiers ; chaque carton est récupéré avec l'ensemble de ses dossiers ;`,
    "chaque carton est identifié par un nom unique et un code-barres (exemple\u00a0: CTN\u201100000123) ;",
    "chaque dossier porte le code-barres de son carton suivi de son numéro d'ordre (exemple\u00a0: CTN\u201100000123\u20110001), ce qui permet de rattacher chaque dossier à son carton lors de la récupération.",
  ];
  const notes = [
    ...(summary.toCheck ? [`${nf(summary.toCheck)} carton${summary.toCheck > 1 ? "s présentent" : " présente"} une information à confirmer sur place ; ${summary.toCheck > 1 ? "ils sont signalés" : "il est signalé"} dans la liste ;`] : []),
    `${nf(summary.generic)} intitulés de l'inventaire regroupent un grand nombre de dossiers (${nf(summary.genericDossiers)} au total, par exemple «\u00a0Koumassi\u00a0») et correspondent à plusieurs cartons ; ils ne figurent pas dans cette liste et seront répartis en cartons lors d'une prochaine étape.`,
  ];
  const intro = `Comme convenu, nous vous transmettons la liste des ${nf(summary.boxes)} premiers cartons à récupérer au site du ministère (Plateau, Salle 1 – Mezzanine, Tour D), ainsi que les étiquettes à apposer lors de la récupération.`;
  const replaceNote = "Ce message constitue la version définitive. L'envoi de ce matin (9 h 45) était un message de test destiné à vérifier la bonne réception.";
  const p = (text) => `<p style="margin:0 0 12px">${text}</p>`;
  const ul = (items, tag = "ul") => `<${tag} style="margin:0 0 14px;padding-left:22px">${items.map((item) => `<li style="margin-bottom:4px">${esc(item)}</li>`).join("")}</${tag}>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55;max-width:680px">
${replaces ? p(`<i>${esc(replaceNote)}</i>`) : ""}${p("Bonjour à tous,")}
${p(esc(intro))}
${p("En synthèse :")}${ul(points)}
${p("Points à noter :")}${ul(notes)}
${p("Documents joints :")}${ul(documents, "ol")}
${p("Nous restons à votre disposition pour tout complément.")}
<p style="margin:16px 0 0">Cordialement,<br><b>L'équipe GeoArchives</b><br><span style="color:#6b7280">CEIBA Analytics</span></p></div>`;
  const text = [
    ...(replaces ? [replaceNote, ""] : []),
    "Bonjour à tous,", "", intro, "",
    "En synthèse :", ...points.map((x) => `- ${x}`), "",
    "Points à noter :", ...notes.map((x) => `- ${x}`), "",
    "Documents joints :", ...documents.map((x, i) => `${i + 1}. ${x}`), "",
    "Nous restons à votre disposition pour tout complément.", "", "Cordialement,", "L'équipe GeoArchives", "CEIBA Analytics",
  ].join("\n");
  return { subject, html, text };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
  const dir = args.dir ?? "/outbox";
  const to = parseList(args.to);
  const cc = parseList(args.cc);
  if (!to.length) throw new Error("--to est requis.");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("RESEND_API_KEY et EMAIL_FROM doivent être configurées.");
  const summary = JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8"));
  const order = ["liste-cartons", "rapport-cartons", "etiquettes-cartons", "etiquettes-dossiers"];
  const files = readdirSync(dir).filter((file) => /\.(xlsx|pdf)$/.test(file))
    .sort((a, b) => order.findIndex((k) => a.startsWith(k)) - order.findIndex((k) => b.startsWith(k)));
  if (files.length < 4) throw new Error(`Pièces jointes incomplètes : ${files.join(", ")}`);
  const total = files.reduce((sum, file) => sum + statSync(path.join(dir, file)).size, 0);
  if (total > 30 * 1024 * 1024) throw new Error("Pièces jointes trop volumineuses (plus de 30 Mo).");
  const { subject, html, text } = buildMessage(summary, files, { replaces: args.replaces === "1" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `recuperation-${args.key ?? Date.now()}` },
    body: JSON.stringify({
      from, to, cc: cc.length ? cc : undefined, subject, html, text,
      attachments: files.map((file) => ({ filename: file, content: readFileSync(path.join(dir, file)).toString("base64") })),
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Envoi refusé (${response.status}) : ${body.slice(0, 300)}`);
  console.log(`E-mail envoyé à ${to.join(", ")}${cc.length ? ` (copie : ${cc.join(", ")})` : ""} — ${files.length} pièces jointes, ${(total / 1024 / 1024).toFixed(1)} Mo. ${body.slice(0, 120)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Envoi échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
