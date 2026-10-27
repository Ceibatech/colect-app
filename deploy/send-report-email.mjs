// Envoie par e-mail (service d'envoi de GeoArchives, Resend) les fichiers de la
// récupération des boîtes : tableur, rapport et planches d'étiquettes.
//
//   node deploy/send-report-email.mjs --dir=/outbox --to=a@x --cc=b@x,c@x
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

export function buildMessage(summary, files) {
  const date = new Date(summary.exportedAt).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", dateStyle: "long", timeStyle: "short" });
  const subject = `Récupération des archives MULCV – ${summary.boxes} premières boîtes : tableau, rapport et étiquettes`;
  const lines = [
    ["Boîtes retenues", `${nf(summary.boxes)} (${summary.first} à ${summary.last})`],
    ["Dossiers concernés", nf(summary.dossiers)],
    ["Lieu de récupération", `${summary.site}, Salle 1 – Mezzanine, Tour D`],
    ["Boîtes à vérifier avant étiquetage", nf(summary.toCheck)],
    ["Libellés à découper en plusieurs boîtes", `${nf(summary.generic)} (${nf(summary.genericDossiers)} dossiers)`],
  ];
  const attachments = {
    xlsx: "Tableau détaillé des boîtes et de leurs dossiers (Excel)",
    rapport: "Rapport de synthèse (PDF)",
    "etiquettes-boites": "Étiquettes des boîtes : code-barres et QR code, 8 par page A4 (PDF)",
    "etiquettes-dossiers": "Étiquettes des dossiers : code-barres, 24 par page A4 (PDF)",
  };
  const described = files.map((file) => {
    const key = file.endsWith(".xlsx") ? "xlsx" : Object.keys(attachments).find((k) => file.startsWith(k));
    return { file, label: attachments[key] ?? "pièce jointe" };
  });
  const p = (text) => `<p style="margin:0 0 12px">${text}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55;max-width:680px">
${p("Bonjour à tous,")}
${p(`Comme demandé, vous trouverez ci-joint le découpage des <b>${nf(summary.boxes)} premières boîtes à récupérer</b>, établi à partir de GeoArchives sur la base des données arrêtées au ${esc(date)}.`)}
<table style="border-collapse:collapse;margin:4px 0 16px;font-size:14px">${lines.map(([k, v]) => `<tr><td style="padding:5px 18px 5px 0;color:#4b5563;border-bottom:1px solid #e5e7eb">${esc(k)}</td><td style="padding:5px 0;border-bottom:1px solid #e5e7eb"><b>${esc(v)}</b></td></tr>`).join("")}</table>
${p("<b>Identification retenue.</b> Chaque boîte dispose d'un nom unique et d'un code-barres permanent (ex. <span style=\"white-space:nowrap\">CTN-00000123</span>). Chaque dossier reçoit le code de sa boîte complété de son numéro d'ordre (ex. <span style=\"white-space:nowrap\">CTN-00000123-0001</span>). Lors de la récupération, l'étiquette de la boîte est apposée sur le carton et celle de chaque dossier sur sa chemise ; un scan suffit ensuite pour retrouver la boîte dans GeoArchives.")}
${p("<b>Points d'attention.</b> Les boîtes à vérifier sont signalées dans le tableau. Les libellés génériques, qui désignent plusieurs boîtes physiques sous un même nom (par exemple « Koumassi »), sont listés à part et seront découpés en boîtes sur place avant étiquetage.")}
${p("<b>Pièces jointes :</b>")}
<ol style="margin:0 0 12px;padding-left:20px">${described.map((d) => `<li>${esc(d.label)} – <span style="color:#6b7280">${esc(d.file)}</span></li>`).join("")}</ol>
${p("Nous restons à votre disposition pour toute précision.")}
<p style="margin:16px 0 0">Cordialement,<br><b>L'équipe GeoArchives</b><br><span style="color:#6b7280">CEIBA Analytics</span></p></div>`;
  const text = [
    "Bonjour à tous,", "",
    `Comme demandé, vous trouverez ci-joint le découpage des ${nf(summary.boxes)} premières boîtes à récupérer, établi à partir de GeoArchives sur la base des données arrêtées au ${date}.`, "",
    ...lines.map(([k, v]) => `- ${k} : ${v}`), "",
    "Identification retenue : chaque boîte dispose d'un nom unique et d'un code-barres permanent (ex. CTN-00000123). Chaque dossier reçoit le code de sa boîte complété de son numéro d'ordre (ex. CTN-00000123-0001).", "",
    "Points d'attention : les boîtes à vérifier sont signalées dans le tableau ; les libellés génériques (plusieurs boîtes sous un même nom) sont listés à part pour être découpés sur place.", "",
    "Pièces jointes :", ...described.map((d, i) => `${i + 1}. ${d.label} – ${d.file}`), "",
    "Nous restons à votre disposition pour toute précision.", "", "Cordialement,", "L'équipe GeoArchives", "CEIBA Analytics",
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
  const order = ["boites-a-recuperer", "rapport", "etiquettes-boites", "etiquettes-dossiers"];
  const files = readdirSync(dir).filter((file) => /\.(xlsx|pdf)$/.test(file))
    .sort((a, b) => order.findIndex((k) => a.startsWith(k)) - order.findIndex((k) => b.startsWith(k)));
  if (files.length < 4) throw new Error(`Pièces jointes incomplètes : ${files.join(", ")}`);
  const total = files.reduce((sum, file) => sum + statSync(path.join(dir, file)).size, 0);
  if (total > 30 * 1024 * 1024) throw new Error("Pièces jointes trop volumineuses (plus de 30 Mo).");
  const { subject, html, text } = buildMessage(summary, files);
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
