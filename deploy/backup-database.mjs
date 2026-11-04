import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";

// Options follow the MariaDB mariadb-dump documentation. Prisma sslcert paths
// are relative to /app/prisma; mount private certificates at runtime as needed.
export function dumpConnection(databaseUrl) {
  const invalid = () => { throw new Error("Invalid or unsupported database configuration."); };
  if (!databaseUrl || databaseUrl !== databaseUrl.trim()) invalid();
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:" || url.hash) invalid();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.slice(1));
  const port = url.port || "3306";
  if (
    !/^[A-Za-z0-9_.:-]+$/.test(hostname) ||
    !username.trim() || !password ||
    /[\u0000-\u001f\u007f]/.test(username) || password.includes("\0") ||
    !/^[A-Za-z0-9_][A-Za-z0-9_$-]{0,63}$/.test(database) ||
    !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535
  ) invalid();

  // Do not silently ignore connection methods this backup tool cannot mirror.
  for (const key of url.searchParams.keys()) {
    if (
      key === "socket" ||
      (key.startsWith("ssl") && !["sslaccept", "sslcert"].includes(key)) ||
      url.searchParams.getAll(key).length > 1
    ) invalid();
  }
  const sslAccept = url.searchParams.get("sslaccept");
  const sslCert = url.searchParams.get("sslcert");
  if (sslAccept !== null && !["strict", "accept_invalid_certs"].includes(sslAccept)) invalid();
  if (sslCert !== null && (!sslCert || /[\u0000-\u001f\u007f]/.test(sslCert))) invalid();

  const args = [
    "--no-defaults",
    "--protocol=tcp",
    `--host=${hostname}`,
    `--port=${port}`,
    `--user=${username}`,
    "--single-transaction",
    "--quick",
    "--skip-lock-tables",
    "--default-character-set=utf8mb4",
    "--no-tablespaces",
    "--hex-blob",
  ];
  if (sslAccept !== null || sslCert !== null) {
    args.push("--ssl");
    // Match Prisma's explicit strict setting and its documented default when
    // TLS is configured. No URL TLS options leaves client defaults unchanged.
    args.push(sslAccept === "strict" ? "--ssl-verify-server-cert" : "--skip-ssl-verify-server-cert");
    if (sslCert) {
      args.push(`--ssl-ca=${path.posix.resolve("/app/prisma", sslCert)}`);
    } else if (sslAccept === "strict") {
      args.push("--ssl-ca=/etc/ssl/certs/ca-certificates.crt");
    }
  }
  args.push("--", database);
  return { args, password };
}

class DumpError extends Error {}

/** Message d'erreur sur une ligne, sans le mot de passe. */
export function redact(text, password) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return password ? clean.split(password).join("***") : clean;
}

// Options de mariadb-dump sans effet pour le client mariadb (liste des tables).
const DUMP_ONLY = new Set(["--single-transaction", "--quick", "--skip-lock-tables", "--no-tablespaces", "--hex-blob"]);
const ATTEMPTS = 3;

/** Lance un programme du client MariaDB ; stdout vers `stdout` (flux) ou capturé. */
function run(spawnDump, command, args, password, stdout) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnDump(command, args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        // The password is never an argument, parent environment mutation or log.
        env: { PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", MYSQL_PWD: password },
      });
    } catch {
      reject(new DumpError(`${command} introuvable`));
      return;
    }
    let stderr = "";
    let captured = "";
    let bytes = 0;
    child.stderr?.on("data", (chunk) => { if (stderr.length < 4000) stderr += chunk.toString("utf8"); });
    const written = stdout
      ? pipeline(child.stdout, new Transform({ transform(chunk, _e, cb) { bytes += chunk.length; cb(null, chunk); } }), stdout).then(() => true, () => false)
      : new Promise((done) => { child.stdout.on("data", (c) => { captured += c.toString("utf8"); bytes += c.length; }); child.stdout.on("end", () => done(true)); });
    let spawnFailed = false;
    child.once("error", () => { spawnFailed = true; });
    child.once("close", async (code, signal) => {
      const ok = await written;
      if (spawnFailed || code !== 0 || signal || !ok) {
        reject(new DumpError([spawnFailed ? `${command} introuvable` : null, code ? `code ${code}` : null, signal ? `signal ${signal}` : null, !ok ? "écriture interrompue" : null, redact(stderr, password)].filter(Boolean).join(" ; ")));
      } else resolve({ bytes, captured });
    });
  });
}

/**
 * Sauvegarde table par table : chaque table est lue sur sa propre connexion,
 * jusqu'à trois essais. Un hébergement mutualisé (CloudLinux) coupe une
 * lecture trop longue (« Lost connection… », erreur 2013) : un seul dump de
 * toute la base échouait. L'application est arrêtée pendant la sauvegarde du
 * déploiement : les tables restent cohérentes entre elles. Les tables, puis
 * les vues, sont réunies dans une seule archive .sql.gz, restaurable telle quelle.
 */
export async function backupDatabase({
  databaseUrl = process.env.DATABASE_URL,
  backupDirectory = "/backups",
  spawnDump = spawn,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const { args, password } = dumpConnection(databaseUrl);
  if (!path.isAbsolute(backupDirectory) || !(await lstat(backupDirectory)).isDirectory()) {
    throw new Error("Backup directory must already exist.");
  }
  const separator = args.indexOf("--");
  const connection = args.slice(0, separator);
  const database = args[separator + 1];
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const filename = `database-${timestamp}-${randomBytes(12).toString("hex")}.sql.gz`;
  const destination = path.join(backupDirectory, filename);
  const partial = `${destination}.partial`;
  const tableFile = `${destination}.table`;
  let interrupted = false;
  const cancel = () => { interrupted = true; };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);

  try {
    const listing = await run(spawnDump, "mariadb", [
      ...connection.filter((arg) => !DUMP_ONLY.has(arg)),
      "--batch", "--skip-column-names", `--database=${database}`,
      "--execute=SHOW FULL TABLES",
    ], password);
    const entries = listing.captured.split("\n").map((line) => line.split("\t")).filter(([name]) => name);
    // Tables d'abord, vues ensuite : une vue se restaure après les tables qu'elle lit.
    const tables = [...entries.filter(([, type]) => type !== "VIEW"), ...entries.filter(([, type]) => type === "VIEW")].map(([name]) => name);
    if (!tables.length) throw new DumpError("aucune table à sauvegarder");

    const gzip = createGzip();
    const output = createWriteStream(partial, { flags: "wx", mode: 0o600 });
    const archive = pipeline(gzip, output);
    let total = 0;
    for (const table of tables) {
      let lastError = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        if (interrupted) throw new DumpError("sauvegarde interrompue");
        try {
          const file = createWriteStream(tableFile, { flags: "w", mode: 0o600 });
          const { bytes } = await run(spawnDump, "mariadb-dump", [...connection, "--", database, table], password, file);
          total += bytes;
          for await (const chunk of createReadStream(tableFile)) {
            if (!gzip.write(chunk)) await once(gzip, "drain");
          }
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < ATTEMPTS) await pause(2000 * attempt);
        }
      }
      if (lastError) throw new DumpError(`table ${table} : ${lastError.message}`);
    }
    gzip.end();
    await archive;
    if (total === 0) throw new DumpError("dump vide");
    // Flush the completed compressed file before its final name becomes visible.
    const completedFile = await open(partial, "r+");
    try { await completedFile.sync(); } finally { await completedFile.close(); }
    if (interrupted) throw new DumpError("sauvegarde interrompue");
    await rename(partial, destination);
    return destination;
  } catch (error) {
    await unlink(partial).catch(() => {});
    const detail = error instanceof DumpError ? ` Cause : ${error.message}` : error instanceof Error ? ` Cause : ${redact(error.message, password)}` : "";
    throw new Error(`Backup failed. Check database access, TLS configuration and backup-directory permissions.${detail}`);
  } finally {
    await unlink(tableFile).catch(() => {});
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error("Unexpected arguments.");
    const backup = await backupDatabase();
    console.log(`Database backup completed: ${path.basename(backup)}`);
  } catch (error) {
    // Jamais l'URL de connexion ni le mot de passe (masqué) : seulement la cause
    // donnée par mariadb-dump (une ligne), pour pouvoir corriger.
    const cause = error instanceof Error ? (/Cause : (.*)$/.exec(error.message)?.[1] ?? "") : "";
    console.error(`Database backup failed. Deployment must stop before migrations.${cause ? ` Cause : ${cause}` : ""}`);
    process.exitCode = 1;
  }
}
