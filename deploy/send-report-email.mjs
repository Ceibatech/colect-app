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

/** Liste et étiquettes QR d'une plage de cartons cotés (ex. 2010-KOU-0001 à 0320). */
export function buildCotesMessage(summary, files, { replaces = false } = {}) {
  const name = summary.listName ? `la liste ${summary.listName}` : null;
  const subject = name
    ? `Archives MULCV – liste ${summary.listName} et complément à ${nf(summary.boxes + 200)} cartons : étiquettes QR ${summary.first} à ${summary.last}`
    : `Archives MULCV – liste et étiquettes QR des cartons ${summary.first} à ${summary.last}`;
  const labels = {
    "liste-cartons": "Liste des cartons et de leurs dossiers (Excel)",
    "etiquettes-cartons": "Étiquettes QR des cartons (PDF, 8 par page A4)",
    "etiquettes-dossiers": "Étiquettes QR des dossiers (PDF, 24 par page A4)",
  };
  const documents = files.map((file) => labels[Object.keys(labels).find((key) => file.startsWith(key))] ?? file);
  // Liste nommée : celle reçue a été comparée à la liste de Kably ; ce qui est déjà tiré n'est pas refait.
  const intro = name
    ? `${name[0].toUpperCase()}${name.slice(1)} nous a été transmise : nous l'avons comparée à la liste d'enlèvement tirée par Kably pour nous assurer qu'elle n'était pas identique. Elle reprend les mêmes 200 cartons, déjà étiquetés : aucune étiquette n'est à refaire pour elle. Pour compléter la liste à ${nf(summary.boxes + 200)} cartons, nous vous transmettons les ${nf(summary.boxes)} cartons suivants, ${summary.first} à ${summary.last}, avec leurs étiquettes QR à apposer sur les cartons et sur chaque dossier.`
    : `Nous vous transmettons la liste des ${nf(summary.boxes)} cartons ${summary.first} à ${summary.last} et les étiquettes QR à apposer sur les cartons et sur chaque dossier.`;
  const points = [
    `${nf(summary.boxes)} cartons, contenant au total ${nf(summary.dossiers)} dossiers ;`,
    ...(summary.listBoxes ? [`les ${nf(summary.listBoxes)} premiers cartons suivent l'ordre de la liste d'enlèvement${summary.listAuthor ? ` tirée par ${summary.listAuthor}` : ""} (références provisoires 1 à ${nf(summary.listBoxes)}) ;`] : []),
    "chaque carton porte sa cote du référentiel de classement (exemple\u00a0: 2010\u2011KOU\u20110001 = Dossiers ACD, Koumassi, carton n°\u00a01) ;",
    "chaque dossier porte la cote de son carton suivie de son numéro (exemple\u00a0: 2010\u2011KOU\u20110001\u2011012), sans trou dans la numérotation ;",
    "l'étiquette d'un dossier ne porte aucun nom : on la colle sur la chemise qui porte le même îlot, le même lot et, le cas échéant, le même titre foncier ;",
    "le QR code de chaque étiquette ouvre directement la fiche correspondante dans GeoArchives.",
  ];
  const replaceNote = "Ce message remplace l'envoi précédent : correspondance des cartons de la liste améliorée et étiquettes des dossiers sans le nom des titulaires.";
  const notes = [
    ...(summary.listBoxes ? [`dossiers retrouvés en base pour ${nf(summary.listFound)} des ${nf(summary.listBoxes)} cartons de la liste${summary.listAuthor ? ` tirée par ${summary.listAuthor}` : ""} (${nf(summary.listDossiers ?? summary.dossiers)} dossiers) ;`] : []),
    ...(summary.empty ? [`${nf(summary.empty)} carton${summary.empty > 1 ? "s n'ont" : " n'a"} pas encore de dossier enregistré : ${summary.empty > 1 ? "leurs dossiers seront rattachés" : "ses dossiers seront rattachés"} lors de l'inventaire, en scannant le QR du carton${summary.emptyList?.length ? ` (${summary.emptyList.join(", ")})` : ""}. ${summary.empty > 1 ? "Ils sont signalés" : "Il est signalé"} en couleur dans la liste.`] : []),
  ];
  const procedure = summary.empty ? [
    "coller l'étiquette QR sur le carton, comme pour les autres ;",
    "dans GeoArchives, ouvrir Collecte, répondre « Un carton déjà commencé » puis scanner le QR du carton (ou saisir sa cote) ;",
    "saisir chaque dossier présent dans le carton : il reçoit automatiquement le numéro suivant (…-001, …-002) et reste lié à ce carton ;",
    "imprimer les étiquettes de ces dossiers depuis la fiche du carton (bouton « Étiquettes des dossiers ») et les coller sur les chemises ;",
    "si un dossier figure déjà dans la base sous un autre carton, le signaler à l'équipe GeoArchives qui le rattachera, pour éviter un doublon.",
  ] : [];
  const p = (text) => `<p style="margin:0 0 12px">${text}</p>`;
  const ul = (items, tag = "ul") => `<${tag} style="margin:0 0 14px;padding-left:22px">${items.map((item) => `<li style="margin-bottom:4px">${esc(item)}</li>`).join("")}</${tag}>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55;max-width:680px">
${replaces ? p(`<i>${esc(replaceNote)}</i>`) : ""}${p("Bonjour à tous,")}
${p(esc(intro))}
${p("En synthèse :")}${ul(points)}
${notes.length ? `${p("Points à noter :")}${ul(notes)}` : ""}
${procedure.length ? `${p("Pour les cartons sans dossier enregistré, sur place :")}${ul(procedure, "ol")}` : ""}
${p("Documents joints :")}${ul(documents, "ol")}
${p("Nous restons à votre disposition pour tout complément.")}
<p style="margin:16px 0 0">Cordialement,<br><b>L'équipe GeoArchives</b><br><span style="color:#6b7280">CEIBA Analytics</span></p></div>`;
  const text = [
    ...(replaces ? [replaceNote, ""] : []),
    "Bonjour à tous,", "", intro, "",
    "En synthèse :", ...points.map((x) => `- ${x}`), "",
    ...(notes.length ? ["Points à noter :", ...notes.map((x) => `- ${x}`), ""] : []),
    ...(procedure.length ? ["Pour les cartons sans dossier enregistré, sur place :", ...procedure.map((x, i) => `${i + 1}. ${x}`), ""] : []),
    "Documents joints :", ...documents.map((x, i) => `${i + 1}. ${x}`), "",
    "Nous restons à votre disposition pour tout complément.", "", "Cordialement,", "L'équipe GeoArchives", "CEIBA Analytics",
  ].join("\n");
  return { subject, html, text };
}

/** Guide du circuit de transfert, envoyé pour aider les équipes à maîtriser le flux. */
export function buildGuideMessage(files) {
  const subject = "GeoArchives – guide du circuit de transfert";
  const paragraphs = [
    "Bonjour,",
    "Des actions étaient en attente dans le circuit de transfert : je me suis connecté pour les valider.",
    "Pour aider à bien maîtriser le flux, voici le guide du circuit de transfert. Il présente les 9 étapes, qui agit à chacune, sur quel écran et avec quel bouton, et qui reçoit l'e-mail ensuite. Chaque étape est illustrée par une capture de l'écran.",
  ];
  const html = [
    ...paragraphs.map((p) => `<p>${esc(p)}</p>`),
    `<p>Document joint :</p><ul>${files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`,
    "<p>Nous restons à votre disposition pour toute question.</p>",
    "<p>Cordialement,<br>Idriss Olivier Bado<br>CEIBA Analytics</p>",
  ].join("\n");
  const text = [...paragraphs.flatMap((p) => [p, ""]), "Document joint :", ...files.map((f) => `- ${f}`), "",
    "Nous restons à votre disposition pour toute question.", "", "Cordialement,", "Idriss Olivier Bado", "CEIBA Analytics"].join("\n");
  return { subject, html, text };
}

export function buildMessage(summary, files, { replaces = false } = {}) {
  if (summary.kind === "guide") return buildGuideMessage(files);
  if (summary.kind === "cotes") return buildCotesMessage(summary, files, { replaces });
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
  if (files.length < ({ guide: 1, cotes: 3 }[summary.kind] ?? 4)) throw new Error(`Pièces jointes incomplètes : ${files.join(", ")}`);
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
