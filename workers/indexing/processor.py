from __future__ import annotations

import ipaddress
import json
import os
import re
import subprocess
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


def _prepare_pdf(source: Path, mime_type: str, workspace: Path) -> Path:
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
    language = os.getenv("OCR_LANGUAGE", "fra+eng")
    timeout = int(os.getenv("INDEXING_OCR_TIMEOUT_SECONDS", "900"))
    subprocess.run(
        [
            "ocrmypdf",
            "--mode", "skip",
            "--rotate-pages",
            "--deskew",
            "--clean",
            "--output-type", "pdfa-2",
            "--optimize", "1",
            "--language", language,
            str(source_pdf),
            str(output),
        ],
        check=True,
        timeout=timeout,
        capture_output=True,
        text=True,
    )
    return output


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


def _structure_extract(pdf_path: Path) -> tuple[str, float]:
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
    normalized_pdf = _prepare_pdf(source, mime_type, workspace)
    text, confidence = _structure_extract(normalized_pdf)
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
        "engine": f"OCRmyPDF+PP-StructureV3{chat_engine}",
        "extractedText": text,
        "pageCount": None,
        "confidence": round(confidence, 2),
        "fields": intelligent_fields,
    }
