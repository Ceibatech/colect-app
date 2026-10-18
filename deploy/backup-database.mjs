import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
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

export async function backupDatabase({
  databaseUrl = process.env.DATABASE_URL,
  backupDirectory = "/backups",
  spawnDump = spawn,
} = {}) {
  const { args, password } = dumpConnection(databaseUrl);
  if (!path.isAbsolute(backupDirectory) || !(await lstat(backupDirectory)).isDirectory()) {
    throw new Error("Backup directory must already exist.");
  }
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const filename = `database-${timestamp}-${randomBytes(12).toString("hex")}.sql.gz`;
  const destination = path.join(backupDirectory, filename);
  const partial = `${destination}.partial`;
  let child;
  let output;
  let interrupted = false;
  const cancel = () => {
    interrupted = true;
    child?.kill("SIGKILL");
    output?.destroy(new Error("Backup interrupted."));
  };

  try {
    child = spawnDump("mariadb-dump", args, {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      // The password is never an argument, parent environment mutation or log.
      env: {
        PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        MYSQL_PWD: password,
      },
    });
    const completion = new Promise((resolve) => {
      let spawnFailed = false;
      child.once("error", () => { spawnFailed = true; });
      child.once("close", (code, signal) => resolve({ code, signal, spawnFailed }));
    });
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    output = createWriteStream(partial, { flags: "wx", mode: 0o600 });
    let bytes = 0;
    const countBytes = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(null, chunk);
      },
    });
    const streaming = pipeline(child.stdout, countBytes, createGzip(), output).then(
      () => true,
      () => { child.kill("SIGKILL"); return false; },
    );
    const [result, streamed] = await Promise.all([completion, streaming]);
    if (interrupted || result.spawnFailed || result.code !== 0 || result.signal || !streamed || bytes === 0) {
      throw new Error("Database dump did not complete successfully.");
    }
    // Flush the completed compressed file before its final name becomes visible.
    const completedFile = await open(partial, "r+");
    try { await completedFile.sync(); } finally { await completedFile.close(); }
    if (interrupted) throw new Error("Backup interrupted.");
    await rename(partial, destination);
    return destination;
  } catch {
    child?.kill("SIGKILL");
    output?.destroy();
    await unlink(partial).catch(() => {});
    throw new Error("Backup failed. Check database access, TLS configuration and backup-directory permissions.");
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error("Unexpected arguments.");
    const backup = await backupDatabase();
    console.log(`Database backup completed: ${path.basename(backup)}`);
  } catch {
    // Never expose the connection URL, password, SQL data or dump stderr.
    console.error("Database backup failed. Deployment must stop before migrations.");
    process.exitCode = 1;
  }
}
