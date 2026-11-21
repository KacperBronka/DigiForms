
"""FormForge: PaddleOCR + page images -> Eden AI streaming -> COI JSON.

Run: python main.py (serves on port 8000; API docs at /docs).
Upload: POST /upload with a multipart file field named "file".
The local OCR model loads once during startup, before accepting requests.
Set EDENAI_API_KEY in the environment or the .env file next to this script.
"""
from document_converter import SUPPORTED_FORMATS, prepare_pdf
from contextlib import ExitStack, asynccontextmanager
from tempfile import TemporaryDirectory
from threading import Lock
from pathlib import Path
import base64
import hashlib
import io
import json
import logging
import os
import re
import time

import pymupdf
import requests
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool
from PIL import Image
from dotenv import dotenv_values, load_dotenv

# =================== CONFIG ===================
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)
# An empty inherited variable otherwise masks the value in .env.
API_KEY = os.environ.get("EDENAI_API_KEY") or dotenv_values(ENV_PATH).get("EDENAI_API_KEY") or ""
MODEL = "gemma-4-31b-it"

MAX_OCR_CHARS = 160_000
MAX_IMAGE_PAGES = 4          # Only first four pages; set to 0 for OCR-only
IMAGE_DPI = 150             # Raise to 200 if tiny controls are missed
JPEG_QUALITY = 78
USE_CACHED_OCR = True        # Cache is linked to document content hash
READ_TIMEOUT_SECONDS = 180  # Time waiting for the next chunk, not whole response
# ===================================================

BASE_DIR = Path(__file__).resolve().parent
API_URL = "https://api.edenai.run/v3/chat/completions"
logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def load_ocr():
    """Create the local model once per server process."""
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="pl",
        ocr_version="PP-OCRv6",
        device="cpu",
        engine="onnxruntime",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ocr = await run_in_threadpool(load_ocr)
    app.state.ocr_lock = Lock()
    try:
        yield
    finally:
        app.state.ocr = None


app = FastAPI(title="FormForge", lifespan=lifespan)


def document_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pdf_to_images(pdf_path: Path, max_pages: int = MAX_IMAGE_PAGES) -> list:
    if max_pages == 0:
        return []
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("Page images currently require a PDF; set MAX_IMAGE_PAGES=0 for images.")

    images = []
    with pymupdf.open(pdf_path) as doc:
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=IMAGE_DPI, alpha=False)
            with Image.open(io.BytesIO(pix.tobytes("png"))) as image:
                buffer = io.BytesIO()
                image.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
            images.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            })
            print(f"Wizualizacja strony {i + 1}: {len(buffer.getvalue()) // 1024} KB JPEG")
    return images


def extract_ocr(document_path: Path, ocr) -> dict:
    pages = []
    for i, result in enumerate(ocr.predict(str(document_path)), start=1):
        raw = result.json
        data = raw.get("res", raw)
        texts = data.get("rec_texts", [])
        boxes = data.get("rec_boxes", [])
        scores = data.get("rec_scores", [])
        lines = []
        for n, value in enumerate(texts):
            box = boxes[n] if n < len(boxes) else None
            if box is not None:
                box = box.tolist() if hasattr(box, "tolist") else list(box)
                box = [int(x) for x in box]
            lines.append({
                "text": str(value),
                "bbox": box,
                "score": round(float(scores[n]), 3) if n < len(scores) else None,
            })
        pages.append({"page": i, "lines": lines})
    return {"pages": pages}


def get_ocr(document_path: Path, ocr, ocr_file: Path) -> dict:
    document_hash = document_sha256(document_path)
    if USE_CACHED_OCR and ocr_file.is_file():
        cached = json.loads(ocr_file.read_text(encoding="utf-8"))
        if cached.get("source_sha256") == document_hash:
            print("OCR z cache:", ocr_file.name)
            return {"pages": cached["pages"]}

    print("PaddleOCR analizuje dokument...")
    ocr_data = extract_ocr(document_path, ocr)
    ocr_file.write_text(
        json.dumps({"source_sha256": document_hash, **ocr_data}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Zapisano OCR:", ocr_file.name)
    return ocr_data


def parse_model_json(content: str):
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.IGNORECASE)
    content = re.sub(r"\s*```$", "", content)
    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Niepoprawny JSON zwrócony przez model ({exc}).") from exc
    if not isinstance(result, (dict, list)):
        raise ValueError("Wynik musi być obiektem lub listą JSON.")
    return result


def read_guidelines() -> tuple[str, str, object]:
    agents = (BASE_DIR / "AGENTS.md").read_text(encoding="utf-8")
    guidelines_md = (BASE_DIR / "GuideLines.md").read_text(encoding="utf-8")
    guidelines_json = json.loads((BASE_DIR / "guidelines.json").read_text(encoding="utf-8"))
    return agents, guidelines_md, guidelines_json


def stream_eden_ai(ocr_data: dict, pdf_path: Path, workdir: Path):
    raw_file = workdir / "model_raw.txt"
    partial_file = workdir / "model_stream_partial.txt"
    usage_file = workdir / "stream_usage.json"
    if not API_KEY:
        raise ValueError("Set EDENAI_API_KEY in .env before running.")

    agents, guidelines_md, guidelines_json = read_guidelines()
    compact_ocr = json.dumps(ocr_data, ensure_ascii=False, separators=(",", ":"))
    if len(compact_ocr) > MAX_OCR_CHARS:
        raise ValueError(f"OCR ma {len(compact_ocr)} znaków, limit to {MAX_OCR_CHARS}.")

    page_images = pdf_to_images(
        pdf_path,
        max_pages=MAX_IMAGE_PAGES
    )
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "AGENT INSTRUCTIONS:\n" + agents
                    + "\n\nFORM DESIGN GUIDELINES:\n" + guidelines_md
                    + "\n\nJSON GUIDELINES:\n"
                    + json.dumps(guidelines_json, ensure_ascii=False)
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Analyze this ONE administrative form using OCR and page images. "
                            "Use images for table boundaries, checkboxes, radio controls, "
                            "blank fields, dotted lines, and visual grouping. "
                            "Do not invent fields or treat informational text as input fields. "
                            "Return ONLY valid JSON following the system guidelines.\n\n"
                            "OCR RESULT:\n" + compact_ocr
                        ),
                    },
                    *page_images,
                ],
            },
        ],
        "temperature": 0,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    print(f"Wysyłam JEDNO żądanie: {MODEL}; obrazy: {len(page_images)}")

    chunks = []
    last_usage = None
    saw_done = False
    start = time.monotonic()
    # Write all arrived chunks immediately; never overwrite an earlier result silently.
    if partial_file.exists():
        backup = partial_file.with_name(partial_file.stem + "_previous.txt")
        partial_file.replace(backup)
        print("Poprzedni wynik częściowy zachowany:", backup.name)

    try:
        with requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            json=payload,
            stream=True,
            timeout=(15, READ_TIMEOUT_SECONDS),
        ) as response:
            if not response.ok:
                raise RuntimeError(
                    f"Eden AI HTTP {response.status_code}: {response.text[:700]}"
                )

            with partial_file.open("w", encoding="utf-8") as output:
                for line in response.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    if isinstance(line, bytes):
                        line = line.decode("utf-8", errors="replace")
                    if not line.startswith("data:"):
                        continue
                    item = line[5:].strip()
                    if item == "[DONE]":
                        saw_done = True
                        break
                    try:
                        event = json.loads(item)
                    except json.JSONDecodeError:
                        continue
                    if "error" in event:
                        raise RuntimeError(f"Eden AI streaming error: {event['error']}")
                    if event.get("usage") is not None:
                        last_usage = event["usage"]
                    for choice in event.get("choices", []):
                        fragment = choice.get("delta", {}).get("content")
                        if isinstance(fragment, str):
                            chunks.append(fragment)
                            output.write(fragment)
                            output.flush()
                            print(fragment, end="", flush=True)

    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
        raise RuntimeError(
            f"Stream przerwany ({type(exc).__name__}). "
            f"Zachowano otrzymane dane: {partial_file.name}. "
            "Nie ponawiam automatycznie: żądanie mogło zostać rozliczone."
        ) from exc

    content = "".join(chunks)
    if not content:
        raise ValueError(f"Nie otrzymano treści modelu. Sprawdź {partial_file.name}.")
    raw_file.write_text(content, encoding="utf-8")
    print(f"\nCzas: {time.monotonic() - start:.1f} s; zapisano: {raw_file.name}")
    if last_usage is not None:
        usage_file.write_text(json.dumps(last_usage, indent=2), encoding="utf-8")
        print("Usage:", last_usage)
    if not saw_done:
        print("Uwaga: stream zakończył się bez znacznika [DONE]; sprawdź kompletność JSON.")
    return parse_model_json(content)


def process_upload(file: UploadFile, suffix: str, ocr, ocr_lock):
    """Run blocking conversion, OCR and Eden AI in a worker thread."""
    with TemporaryDirectory(prefix="formforge-") as tmp:
        workdir = Path(tmp)
        # Never use the client-supplied filename as a filesystem path.
        document_path = workdir / f"upload{suffix}"
        size = 0
        with document_path.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Maximum upload size is 50 MiB.")
                output.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        # Catch input errors only while entering the converter; errors from OCR
        # or the upstream model must not be reported as malformed uploads.
        with ExitStack() as stack:
            try:
                pdf_path = stack.enter_context(prepare_pdf(document_path))
            except (ValueError, pymupdf.FileDataError) as exc:
                raise HTTPException(status_code=400, detail="Invalid document.") from exc

            # PaddleOCR's shared predictor must not run simultaneous inferences.
            with ocr_lock:
                ocr_data = get_ocr(pdf_path, ocr, workdir / "ocr_result.json")
            try:
                return stream_eden_ai(ocr_data, pdf_path, workdir)
            except (requests.RequestException, RuntimeError, ValueError) as exc:
                logger.exception("Form generation failed")
                raise HTTPException(status_code=502, detail="Form generation failed.") from exc


@app.post("/upload")
async def upload_document(request: Request, file: UploadFile = File(...)):
    """Upload a supported document and wait for the generated form JSON."""
    try:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in SUPPORTED_FORMATS:
            raise HTTPException(
                status_code=415,
                detail=f"Supported formats: {', '.join(sorted(SUPPORTED_FORMATS))}",
            )
        if not API_KEY:
            raise HTTPException(status_code=503, detail="EDENAI_API_KEY is not configured.")
        return await run_in_threadpool(
            process_upload, file, suffix, request.app.state.ocr, request.app.state.ocr_lock
        )
    finally:
        await file.close()


@app.get("/health")
async def health():
    return {"status": "ready"}


def main():
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "3001")))


if __name__ == "__main__":
    main()
