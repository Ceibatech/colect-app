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

export function buildMessage(summary, files) {
  const date = new Date(summary.exportedAt).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", dateStyle: "long", timeStyle: "short" });
  const subject = `Récupération des archives : ${summary.boxes} premières boîtes à récupérer et étiquettes`;
  const lines = [
    ["Boîtes retenues", `${summary.boxes} (${summary.first} à ${summary.last})`],
    ["Dossiers à étiqueter", `${summary.dossiers}`],
    ["Origine", `${summary.site} · Salle 1 · Mezzanine, Tour D`],
    ["Boîtes à vérifier sur place", `${summary.toCheck}`],
    ["Libellés génériques à découper", `${summary.generic} (${summary.genericDossiers} dossiers)`],
  ];
  const attachments = {
    xlsx: "le tableau des boîtes et de leurs dossiers (tableur)",
    rapport: "le rapport de synthèse (PDF)",
    "etiquettes-boites": "les étiquettes des boîtes, code-barres et QR code (PDF, 8 par page)",
    "etiquettes-dossiers": "les étiquettes des dossiers, code-barres (PDF, 24 par page)",
  };
  const described = files.map((file) => {
    const key = file.endsWith(".xlsx") ? "xlsx" : Object.keys(attachments).find((k) => file.startsWith(k));
    return `${esc(file)} : ${attachments[key] ?? "pièce jointe"}`;
  });
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">
<p>Bonjour,</p>
<p>Veuillez trouver ci-joint la préparation de la récupération des <b>${summary.boxes} premières boîtes</b>, établie à partir de GeoArchives (données du ${esc(date)}).</p>
<table style="border-collapse:collapse;margin:8px 0">${lines.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>
<p><b>Identification</b> : chaque boîte a un nom unique et un code-barres permanent (CTN-00000123). Chaque dossier porte le code de sa boîte suivi de son numéro d'ordre (CTN-00000123-0001, -0002…), à coller sur sa chemise lors de la récupération.</p>
<p><b>Pièces jointes</b> :</p><ul>${described.map((d) => `<li>${d}</li>`).join("")}</ul>
<p>Les ${summary.generic} libellés génériques (plusieurs boîtes physiques sous un même nom, par exemple « Koumassi ») sont listés à part pour être découpés en boîtes sur place.</p>
<p>Cordialement,<br>L'équipe GeoArchives – CEIBA Analytics</p></div>`;
  const text = [`Bonjour,`, ``, `Ci-joint la préparation de la récupération des ${summary.boxes} premières boîtes (données du ${date}).`, ...lines.map(([k, v]) => `- ${k} : ${v}`), ``, `Pièces jointes :`, ...described.map((d) => `- ${d}`), ``, `L'équipe GeoArchives – CEIBA Analytics`].join("\n");
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
