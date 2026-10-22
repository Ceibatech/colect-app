from __future__ import annotations

import ipaddress
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from PIL import Image
from paddleocr import PPStructureV3


_structure_pipeline: PPStructureV3 | None = None
_chat_pipeline: Any | None = None


def _private_ai_endpoint(url: str) -> bool:
    if os.getenv("INDEXING_ALLOW_EXTERNAL_AI", "false").lower() == "true":
        return True
    host = (urlparse(url).hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"} or "." not in host:
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return host.endswith(".local") or host.endswith(".internal")


def _prepare_pdf(source: Path, mime_type: str, workspace: Path) -> tuple[Path, Path]:
    source_pdf = source
    if mime_type != "application/pdf":
        source_pdf = workspace / "image-source.pdf"
        with Image.open(source) as image:
            frames = []
            frame_count = getattr(image, "n_frames", 1)
            for index in range(frame_count):
                image.seek(index)
                frames.append(image.convert("RGB"))
            frames[0].save(source_pdf, save_all=True, append_images=frames[1:], resolution=200)

    output = workspace / "normalized-ocr.pdf"
    sidecar = workspace / "ocr-text.txt"
    language = os.getenv("OCR_LANGUAGE", "fra+eng")
    configured_timeout = max(30, int(os.getenv("INDEXING_OCR_TIMEOUT_SECONDS", "900")))
    primary_timeout = min(
        configured_timeout,
        max(30, int(os.getenv("INDEXING_OCR_PRIMARY_TIMEOUT_SECONDS", "180"))),
    )
    fallback_timeout = min(
        configured_timeout,
        max(30, int(os.getenv("INDEXING_OCR_FALLBACK_TIMEOUT_SECONDS", "240"))),
    )

    primary_command = [
        "ocrmypdf",
        "--mode", "skip",
        "--rotate-pages",
        "--deskew",
        "--clean",
        "--output-type", "pdfa-2",
        "--optimize", "1",
        "--jobs", "1",
        "--tesseract-timeout", "75",
        "--language", language,
        "--sidecar", str(sidecar),
        str(source_pdf),
        str(output),
    ]
    fallback_command = [
        "ocrmypdf",
        "--mode", "force",
        "--output-type", "pdfa-2",
        "--optimize", "0",
        "--jobs", "1",
        "--tesseract-timeout", "45",
        "--language", language,
        "--sidecar", str(sidecar),
        str(source_pdf),
        str(output),
    ]

    try:
        subprocess.run(
            primary_command,
            check=True,
            timeout=primary_timeout,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as primary_error:
        primary_details = (
            getattr(primary_error, "stderr", "") or getattr(primary_error, "stdout", "") or ""
        ).strip()
        primary_code = getattr(primary_error, "returncode", "délai dépassé")
        print(
            f"OCRmyPDF complet indisponible (code {primary_code}); "
            "nouvel essai sans rotation, nettoyage ni optimisation. "
            f"{primary_details[-1200:]}",
            flush=True,
        )
        output.unlink(missing_ok=True)
        try:
            subprocess.run(
                fallback_command,
                check=True,
                timeout=fallback_timeout,
                capture_output=True,
                text=True,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as fallback_error:
            fallback_details = (
                getattr(fallback_error, "stderr", "") or getattr(fallback_error, "stdout", "") or ""
            ).strip()
            fallback_code = getattr(fallback_error, "returncode", "délai dépassé")
            raise RuntimeError(
                "OCRmyPDF a échoué dans les deux modes "
                f"(principal={primary_code}, secours={fallback_code}). "
                f"Détail secours : {fallback_details[-3000:]}"
            ) from fallback_error
    return output, sidecar


def _json_value(result: Any) -> Any:
    value = getattr(result, "json", result)
    if callable(value):
        value = value()
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {"text": value}
    return value


def _walk_text(value: Any, lines: list[str], scores: list[float]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = str(key).lower()
            if lowered in {"rec_scores", "scores", "score", "confidence"}:
                _walk_scores(child, scores)
            if lowered in {"rec_texts", "texts", "text", "markdown", "content"}:
                _walk_text_leaf(child, lines)
            elif isinstance(child, (dict, list, tuple)):
                _walk_text(child, lines, scores)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _walk_text(child, lines, scores)


def _walk_text_leaf(value: Any, lines: list[str]) -> None:
    if isinstance(value, str):
        for line in value.splitlines():
            compact = re.sub(r"\s+", " ", line).strip()
            if compact:
                lines.append(compact)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _walk_text_leaf(child, lines)


def _walk_scores(value: Any, scores: list[float]) -> None:
    if isinstance(value, (int, float)):
        score = float(value)
        scores.append(score * 100 if score <= 1 else score)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _walk_scores(child, scores)


def _structure_extract_direct(pdf_path: Path) -> tuple[str, float]:
    global _structure_pipeline
    if _structure_pipeline is None:
        _structure_pipeline = PPStructureV3(
            use_doc_orientation_classify=True,
            use_doc_unwarping=True,
            use_textline_orientation=True,
            device=os.getenv("PADDLE_DEVICE", "cpu"),
        )
    lines: list[str] = []
    scores: list[float] = []
    for result in _structure_pipeline.predict(str(pdf_path)):
        _walk_text(_json_value(result), lines, scores)
    unique_lines = list(dict.fromkeys(lines))
    confidence = sum(scores) / len(scores) if scores else (82.0 if unique_lines else 30.0)
    return "\n".join(unique_lines), round(max(0.0, min(100.0, confidence)), 2)


def _sidecar_extract(sidecar_path: Path) -> tuple[str, float]:
    text = sidecar_path.read_text(encoding="utf-8", errors="replace").strip() if sidecar_path.exists() else ""
    return text, 82.0 if text else 30.0


def _structure_extract(pdf_path: Path, sidecar_path: Path, workspace: Path) -> tuple[str, float, bool]:
    result_path = workspace / "pp-structure-result.json"
    timeout = max(30, int(os.getenv("INDEXING_LAYOUT_TIMEOUT_SECONDS", "180")))
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--structure-extract",
        str(pdf_path),
        str(result_path),
    ]

    try:
        subprocess.run(
            command,
            check=True,
            timeout=timeout,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result_path.read_text(encoding="utf-8"))
        text = str(payload.get("text") or "").strip()
        confidence = float(payload.get("confidence") or 0)
        if text:
            return text, confidence, True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError, ValueError, json.JSONDecodeError) as error:
        print(
            f"PP-StructureV3 indisponible après {timeout}s; poursuite avec le texte OCRmyPDF. {error}",
            flush=True,
        )

    text, confidence = _sidecar_extract(sidecar_path)
    return text, confidence, False


def _match_chat_fields(payload: Any, fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aliases: dict[str, str] = {}
    for field in fields:
        aliases[field["key"].casefold()] = field["key"]
        aliases[field["label"].casefold()] = field["key"]
        for alias in field.get("aliases") or []:
            if isinstance(alias, str):
                aliases[alias.casefold()] = field["key"]

    found: dict[str, dict[str, Any]] = {}

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                canonical = aliases.get(str(key).strip().casefold())
                if canonical and isinstance(child, (str, int, float)) and str(child).strip():
                    found[canonical] = {
                        "key": canonical,
                        "value": str(child).strip(),
                        "rawValue": str(child).strip(),
                        "confidence": 94.0,
                    }
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return list(found.values())


def _chat_extract(pdf_path: Path, fields: list[dict[str, Any]], second_pass: bool) -> list[dict[str, Any]]:
    base_url = os.getenv("INDEXING_LLM_BASE_URL", "").strip()
    model = os.getenv("INDEXING_LLM_MODEL", "").strip()
    embedding_model = os.getenv("INDEXING_EMBEDDING_MODEL", "").strip()
    if not base_url or not model or not embedding_model:
        return []
    if not _private_ai_endpoint(base_url):
        raise RuntimeError("Le modèle IA doit être local ou explicitement autorisé.")

    global _chat_pipeline
    if _chat_pipeline is None:
        from paddleocr import PPChatOCRv4Doc
        _chat_pipeline = PPChatOCRv4Doc()

    api_key = os.getenv("INDEXING_LLM_API_KEY", "local-only")
    chat_config = {
        "module_name": "chat_bot",
        "model_name": model,
        "base_url": base_url,
        "api_type": "openai",
        "api_key": api_key,
    }
    retriever_config = {
        "module_name": "retriever",
        "model_name": embedding_model,
        "base_url": os.getenv("INDEXING_EMBEDDING_BASE_URL", base_url),
        "api_type": "openai",
        "api_key": api_key,
    }
    visual_results = list(_chat_pipeline.visual_predict(
        input=str(pdf_path),
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_common_ocr=True,
        use_seal_recognition=True,
        use_table_recognition=True,
    ))
    visual_info = [_json_value(result).get("visual_info", _json_value(result)) for result in visual_results]
    vector_info = _chat_pipeline.build_vector(
        visual_info,
        flag_save_bytes_vector=True,
        retriever_config=retriever_config,
    )
    labels = [field["label"] for field in fields]
    mllm_info = None
    mllm_url = os.getenv("INDEXING_MLLM_BASE_URL", "").strip()
    if second_pass and mllm_url:
        if not _private_ai_endpoint(mllm_url):
            raise RuntimeError("Le modèle multimodal doit être local ou explicitement autorisé.")
        mllm_result = _chat_pipeline.mllm_pred(
            input=str(pdf_path),
            key_list=labels,
            mllm_chat_bot_config={
                "module_name": "chat_bot",
                "model_name": os.getenv("INDEXING_MLLM_MODEL", model),
                "base_url": mllm_url,
                "api_type": "openai",
                "api_key": api_key,
            },
        )
        mllm_info = mllm_result.get("mllm_res")
    chat_result = _chat_pipeline.chat(
        key_list=labels,
        visual_info=visual_info,
        vector_info=vector_info,
        mllm_predict_info=mllm_info,
        chat_bot_config=chat_config,
        retriever_config=retriever_config,
    )
    return _match_chat_fields(chat_result, fields)


def process_document(
    source: Path,
    mime_type: str,
    workspace: Path,
    fields: list[dict[str, Any]],
    analysis_pass: str,
) -> dict[str, Any]:
    normalized_pdf, sidecar_path = _prepare_pdf(source, mime_type, workspace)
    text, confidence, layout_used = _structure_extract(normalized_pdf, sidecar_path, workspace)
    intelligent_fields: list[dict[str, Any]] = []
    chat_engine = ""
    try:
        intelligent_fields = _chat_extract(normalized_pdf, fields, analysis_pass == "SECONDE_LECTURE")
        if intelligent_fields:
            chat_engine = "+PP-ChatOCRv4"
            confidence = max(confidence, sum(field["confidence"] for field in intelligent_fields) / len(intelligent_fields))
    except Exception as error:
        print(f"PP-ChatOCRv4 indisponible pour ce passage: {error}", flush=True)

    return {
        "normalizedPdf": normalized_pdf,
        "engine": f"OCRmyPDF+{'PP-StructureV3' if layout_used else 'Tesseract'}{chat_engine}",
        "extractedText": text,
        "pageCount": None,
        "confidence": round(confidence, 2),
        "fields": intelligent_fields,
    }


def _run_structure_cli() -> None:
    if len(sys.argv) != 4 or sys.argv[1] != "--structure-extract":
        raise SystemExit("Usage: processor.py --structure-extract <pdf> <result-json>")
    text, confidence = _structure_extract_direct(Path(sys.argv[2]))
    Path(sys.argv[3]).write_text(
        json.dumps({"text": text, "confidence": confidence}, ensure_ascii=False),
        encoding="utf-8",
    )


if __name__ == "__main__":
    _run_structure_cli()
