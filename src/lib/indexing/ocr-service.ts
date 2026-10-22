import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MIN_EMBEDDED_TEXT_LENGTH = 120;

export interface OcrExtractionResult {
  text: string;
  pageCount: number | null;
  engine: "pdftotext" | "tesseract" | "pdftotext+tesseract";
  baseConfidence: number;
}

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8", windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return reject(new OcrUnavailableError(`Le moteur ${file} n'est pas installé sur ce serveur.`));
        }
        const detail = stderr?.trim().slice(0, 500) || error.message;
        reject(new Error(`${file} a échoué : ${detail}`));
      },
    );
  });
}

function configuredMaxPages(): number {
  const parsed = Number.parseInt(process.env.AUTO_INDEX_MAX_PAGES ?? "20", 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 20;
}

function extensionForMime(typeMime: string): string {
  if (typeMime === "image/jpeg") return ".jpg";
  if (typeMime === "image/png") return ".png";
  if (typeMime === "image/tiff") return ".tiff";
  return ".bin";
}

async function tesseract(filePath: string): Promise<string> {
  const language = process.env.OCR_LANGUAGE?.trim() || "fra+eng";
  return run("tesseract", [filePath, "stdout", "-l", language, "--psm", "6"]);
}

async function extractPdf(buffer: Buffer, workspace: string): Promise<OcrExtractionResult> {
  const pdfPath = path.join(workspace, "source.pdf");
  await writeFile(pdfPath, buffer);

  let pageCount: number | null = null;
  try {
    const info = await run("pdfinfo", [pdfPath]);
    const match = info.match(/^Pages:\s+(\d+)$/m);
    if (match) pageCount = Number(match[1]);
  } catch (error) {
    if (error instanceof OcrUnavailableError) throw error;
  }

  const embeddedText = (await run("pdftotext", ["-layout", pdfPath, "-"])).trim();
  if (embeddedText.replace(/\s/g, "").length >= MIN_EMBEDDED_TEXT_LENGTH) {
    return { text: embeddedText, pageCount, engine: "pdftotext", baseConfidence: 96 };
  }

  const pageLimit = Math.min(pageCount ?? configuredMaxPages(), configuredMaxPages());
  const pagePrefix = path.join(workspace, "page");
  await run("pdftoppm", ["-f", "1", "-l", String(pageLimit), "-r", "200", "-png", pdfPath, pagePrefix]);
  const pages = (await readdir(workspace))
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const ocrParts: string[] = [];
  for (const page of pages) ocrParts.push(await tesseract(path.join(workspace, page)));
  const ocrText = ocrParts.join("\n\n").trim();
  return {
    text: [embeddedText, ocrText].filter(Boolean).join("\n\n"),
    pageCount,
    engine: embeddedText ? "pdftotext+tesseract" : "tesseract",
    baseConfidence: ocrText ? 78 : 45,
  };
}

/**
 * Extraction locale, sans transfert vers un fournisseur tiers. Les commandes
 * sont appelées sans shell avec une liste d'arguments fixe afin d'éviter toute
 * injection à partir du nom du fichier fourni par l'utilisateur.
 */
export async function extractDocumentText(buffer: Buffer, typeMime: string): Promise<OcrExtractionResult> {
  const workspace = await mkdtemp(path.join(tmpdir(), "geoarchives-index-"));
  try {
    if (typeMime === "application/pdf") return await extractPdf(buffer, workspace);

    const sourcePath = path.join(workspace, `source${extensionForMime(typeMime)}`);
    await writeFile(sourcePath, buffer);
    const text = (await tesseract(sourcePath)).trim();
    return { text, pageCount: typeMime === "image/tiff" ? null : 1, engine: "tesseract", baseConfidence: 78 };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
