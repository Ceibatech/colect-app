const baseUrl = (process.env.GEOARCHIVES_INTERNAL_URL || "http://app:3000").replace(/\/$/, "");
const token = (process.env.REPORTS_CRON_SECRET || "").trim();
const pollSeconds = Math.max(30, Number.parseInt(process.env.REPORTS_POLL_SECONDS || "60", 10) || 60);

if (token.length < 32) {
  console.error("REPORTS_CRON_SECRET is missing or too short.");
  process.exit(1);
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runOnce() {
  const response = await fetch(`${baseUrl}/api/internal/email-reports/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Email report scheduler returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.due > 0 || result.failed > 0 || result.transferAlerts?.due > 0) {
    console.log(JSON.stringify({
      event: "email_deliveries_processed",
      reports: { due: result.due, sent: result.sent, failed: result.failed, skipped: result.skipped },
      transferAlerts: result.transferAlerts,
    }));
  }
}

// Caisses reçues chez CEIBA à envoyer à MULCV (sans effet tant que MULCV n'est pas configuré).
async function syncMulcv() {
  const response = await fetch(`${baseUrl}/api/internal/mulcv/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`MULCV sync returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.due > 0) console.log(JSON.stringify({ event: "mulcv_deliveries_processed", due: result.due, sent: result.sent, failed: result.failed }));
}

while (!stopping) {
  try {
    await runOnce();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Email report scheduler failed.");
  }
  try {
    await syncMulcv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "MULCV sync failed.");
  }
  if (!stopping) await sleep(pollSeconds * 1000);
}
