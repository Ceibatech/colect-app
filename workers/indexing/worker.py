from __future__ import annotations

import json
import mimetypes
import os
import socket
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from processor import process_document


BASE_URL = os.getenv("GEOARCHIVES_INTERNAL_URL", "http://app:3000").rstrip("/")
TOKEN = os.getenv("INDEXING_WORKER_TOKEN", "").strip()
WORKER_ID = os.getenv("INDEXING_WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")
POLL_SECONDS = max(1.0, float(os.getenv("INDEXING_WORKER_POLL_SECONDS", "4")))


def request(path: str, method: str = "GET", payload: Any = None, content_type: str = "application/json") -> bytes:
    if not TOKEN:
        raise RuntimeError("INDEXING_WORKER_TOKEN doit être configuré.")
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8") if content_type == "application/json" else payload
    req = Request(
        f"{BASE_URL}{path}",
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "X-Worker-Id": WORKER_ID,
            "Content-Type": content_type,
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=900) as response:
            return response.read()
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"GeoArchives a répondu {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"GeoArchives est indisponible: {error.reason}") from error


def json_request(path: str, method: str = "POST", payload: Any = None) -> Any:
    raw = request(path, method=method, payload=payload)
    return json.loads(raw.decode("utf-8")) if raw else None


def process_job(job: dict[str, Any]) -> None:
    job_id = int(job["id"])
    document = job["document"]
    extension = mimetypes.guess_extension(document["mimeType"]) or Path(document["originalName"]).suffix or ".bin"
    with tempfile.TemporaryDirectory(prefix="geoarchives-index-") as directory:
        workspace = Path(directory)
        source = workspace / f"source{extension}"
        source.write_bytes(request(document["downloadPath"]))
        result = process_document(
            source,
            document["mimeType"],
            workspace,
            job.get("fields") or [],
            job["analysisPass"],
        )
        normalized = Path(result.pop("normalizedPdf"))
        try:
            request(
                f"/api/internal/indexing/jobs/{job_id}/pdfa",
                method="PUT",
                payload=normalized.read_bytes(),
                content_type="application/pdf",
            )
        except Exception as error:
            # The searchable metadata remains useful even when derivative
            # storage is temporarily unavailable. A later retry can recreate it.
            print(f"Dérivé PDF/A différé pour le travail {job_id}: {error}", flush=True)
        result["workerId"] = WORKER_ID
        try:
            json_request(f"/api/internal/indexing/jobs/{job_id}/complete", payload=result)
        except Exception as error:
            raise RuntimeError(f"Finalisation des métadonnées impossible: {error}") from error


def main() -> None:
    if len(TOKEN) < 32:
        raise RuntimeError("INDEXING_WORKER_TOKEN doit contenir au moins 32 caractères.")
    print(f"Worker GeoArchives {WORKER_ID} prêt.", flush=True)
    while True:
        try:
            response = json_request("/api/internal/indexing/jobs/claim", payload={"workerId": WORKER_ID})
            job = response.get("job") if response else None
            if not job:
                time.sleep(POLL_SECONDS)
                continue
            try:
                process_job(job)
                print(f"Travail {job['id']} terminé.", flush=True)
            except Exception as error:
                message = str(error)[:2000]
                print(f"Travail {job['id']} en erreur: {message}", flush=True)
                try:
                    json_request(
                        f"/api/internal/indexing/jobs/{job['id']}/fail",
                        payload={"workerId": WORKER_ID, "error": message},
                    )
                except Exception as report_error:
                    print(f"Impossible de signaler l'erreur: {report_error}", flush=True)
        except Exception as error:
            print(f"Boucle worker interrompue temporairement: {error}", flush=True)
            time.sleep(max(POLL_SECONDS, 10.0))


if __name__ == "__main__":
    main()
