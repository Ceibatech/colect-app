// Liveness keeps the login page reachable during a database outage.
// Use --readiness after deployment to additionally require a working database.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--readiness")) {
  console.error("Usage: node deploy/healthcheck.mjs [--readiness]");
  process.exit(1);
}

const readiness = args.includes("--readiness");
const port = process.env.PORT || "3000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("Health check failed: PORT is invalid.");
  process.exit(1);
}

try {
  const endpoint = readiness ? "/api/health" : "/login";
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(readiness ? 30_000 : 5_000),
    headers: { Accept: readiness ? "application/json" : "text/html" },
  });
  if (response.status !== 200) {
    throw new Error("Unexpected HTTP status");
  }
  if (readiness) {
    const body = await response.json();
    if (body?.status !== "ok" || body?.database !== "up") {
      throw new Error("Database unavailable");
    }
  } else {
    await response.body?.cancel();
  }
  console.log(readiness ? "Application and database are ready." : "Application is live.");
} catch {
  // Do not print response bodies or connection errors: they may contain secrets.
  console.error(readiness ? "Readiness check failed." : "Liveness check failed.");
  process.exitCode = 1;
}
