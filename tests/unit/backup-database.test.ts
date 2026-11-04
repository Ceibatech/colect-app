import { EventEmitter } from "node:events";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { backupDatabase, redact } from "../../deploy/backup-database.mjs";

type Call = { command: string; args: string[] };

/** Faux client MariaDB : liste deux tables et une vue ; `fail` coupe certains dumps. */
function fakeSpawn(calls: Call[], fail: (table: string, attempt: number) => boolean) {
  const attempts = new Map<string, number>();
  return (command: string, args: string[]) => {
    calls.push({ command, args });
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => {} });
    setTimeout(() => {
      if (command === "mariadb") {
        child.stdout.end("dossiers\tBASE TABLE\nvw_stats\tVIEW\ncartons\tBASE TABLE\n");
        child.stderr.end();
        child.emit("close", 0, null);
        return;
      }
      const table = args[args.length - 1];
      const attempt = (attempts.get(table) ?? 0) + 1;
      attempts.set(table, attempt);
      if (fail(table, attempt)) {
        child.stdout.end("-- partiel");
        child.stderr.end(`mariadb-dump: Error 2013: Lost connection to server during query when dumping table \`${table}\` at row: 12`);
        child.emit("close", 3, null);
        return;
      }
      child.stdout.end(`-- table ${table}\n`);
      child.stderr.end();
      child.emit("close", 0, null);
    }, 1);
    return child;
  };
}

const URL = "mysql://colect:s3cr3t@db.example:3306/colect";

describe("sauvegarde de la base table par table", () => {
  it("sauvegarde chaque table sur sa connexion, les vues en dernier, et reprend une table coupée", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "backup-"));
    const calls: Call[] = [];
    const file = await backupDatabase({ databaseUrl: URL, backupDirectory: dir, spawnDump: fakeSpawn(calls, (t, n) => t === "cartons" && n === 1) as never, pause: async () => {} });
    const sql = gunzipSync(readFileSync(file)).toString("utf8");
    expect(sql).toBe("-- table dossiers\n-- table cartons\n-- table vw_stats\n");
    expect(sql).not.toContain("partiel");
    const dumps = calls.filter((c) => c.command === "mariadb-dump").map((c) => c.args.at(-1));
    expect(dumps).toEqual(["dossiers", "cartons", "cartons", "vw_stats"]);
    expect(calls.every((c) => !c.args.join(" ").includes("s3cr3t"))).toBe(true);
    expect(readdirSync(dir)).toEqual([path.basename(file)]);
  });

  it("abandonne après trois essais en donnant la cause, sans laisser de fichier", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "backup-"));
    await expect(backupDatabase({ databaseUrl: URL, backupDirectory: dir, spawnDump: fakeSpawn([], (t) => t === "dossiers") as never, pause: async () => {} }))
      .rejects.toThrow(/Cause : table dossiers : code 3 ; mariadb-dump: Error 2013: Lost connection/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("masque le mot de passe dans les messages", () => {
    expect(redact("Access denied (using password: s3cr3t)", "s3cr3t")).toBe("Access denied (using password: ***)");
  });
});
