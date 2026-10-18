import { posix as path } from "node:path";

// Run inside the app image before deploying or migrating. Never print values.
const errors = [];
const secret = process.env.AUTH_SECRET || "";
if (
  secret.trim().length < 32 ||
  /changeme|change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(secret|auth)|placeholder|example/i.test(secret) ||
  /^(.)\1+$/.test(secret)
) {
  errors.push("AUTH_SECRET must be a generated secret of at least 32 characters, with no placeholder value.");
}

try {
  const raw = process.env.DATABASE_URL || "";
  const database = new URL(raw);
  if (
    raw !== raw.trim() ||
    database.protocol !== "mysql:" ||
    !database.hostname ||
    !database.username ||
    !database.password ||
    !database.pathname.slice(1) ||
    database.hash
  ) {
    throw new Error("Invalid database URL");
  }
  // Decode only for validation; retain the original value for Prisma.
  if (!decodeURIComponent(database.username).trim() || !decodeURIComponent(database.password).trim()) {
    throw new Error("Empty database credentials");
  }
} catch {
  errors.push("DATABASE_URL must be a valid mysql:// URL with username, password, hostname and database name (encode special characters).");
}

try {
  const appUrl = new URL(process.env.APP_URL || "");
  if (
    appUrl.protocol !== "https:" ||
    !appUrl.hostname ||
    appUrl.username ||
    appUrl.password ||
    appUrl.search ||
    appUrl.hash ||
    appUrl.pathname !== "/"
  ) {
    throw new Error("Invalid public origin");
  }
} catch {
  errors.push("APP_URL must be an HTTPS origin, without credentials, a path, query or fragment.");
}

const documents = process.env.DOCUMENTS_STORAGE_PATH || "";
if (!path.isAbsolute(documents) || documents === "/" || documents.includes("\0")) {
  errors.push("DOCUMENTS_STORAGE_PATH must be an absolute Linux directory path other than /.");
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log("Production environment configuration is valid.");
}
