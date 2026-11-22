
"""FormForge: Tesseract + page images -> Eden AI streaming -> COI JSON.

Run: python main.py (serves on port 8000; API docs at /docs).
Upload: POST /upload with a multipart file field named "file".
The local OCR model loads once during startup, before accepting requests.
Set EDENAI_API_KEY in the environment or the .env file next to this script.
"""
from document_converter import prepare_pdf
from upload_validation import validate_metadata, validate_content
from contextlib import ExitStack, asynccontextmanager
from tempfile import TemporaryDirectory
from threading import Lock
from pathlib import Path
import base64
import hashlib
import io
import json
import logging
import re
import time

from pdf_tools import render_pdf_pages
from ocr_engine import create_ocr
from contextlib import closing
import requests
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool
from PIL import Image
from settings import settings
from auth import authenticate
from fastapi.responses import JSONResponse

API_KEY = settings.api_key
MODEL = settings.model
MAX_OCR_CHARS = settings.max_ocr_chars
MAX_IMAGE_PAGES = settings.max_image_pages
IMAGE_DPI = settings.image_dpi
JPEG_QUALITY = settings.jpeg_quality
USE_CACHED_OCR = True
BASE_DIR = Path(__file__).resolve().parent
API_URL = settings.api_url
logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = settings.max_upload_bytes


def load_ocr():
    """Check local OCR language data once per process."""
    return create_ocr(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ocr = await run_in_threadpool(load_ocr)
    app.state.ocr_lock = Lock()
    try:
        yield
    finally:
        app.state.ocr = None


app = FastAPI(title="FormForge", lifespan=lifespan)


@app.middleware("http")
async def verify_upload_token(request: Request, call_next):
    # Authenticate before parsing or buffering the multipart body.
    if request.url.path.rstrip("/") in ("/upload", "/api/process-document") and request.method == "POST":
        try:
            request.state.identity = authenticate(request.headers.get("Authorization"), settings)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail, "error": exc.detail}, status_code=exc.status_code, headers=exc.headers)
    return await call_next(request)


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
    with closing(render_pdf_pages(pdf_path, IMAGE_DPI, max_pages)) as pages:
        for i, image in enumerate(pages):
            with image:
                buffer = io.BytesIO()
                image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
            images.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            })
    return images


def extract_ocr(document_path: Path, ocr) -> dict:
    pages = []
    with closing(render_pdf_pages(document_path, settings.ocr_dpi)) as images:
        for page_number, image in enumerate(images, start=1):
            with image:
                result = ocr(image)
            texts = result.txts if result.txts is not None else []
            boxes = result.boxes if result.boxes is not None else []
            scores = result.scores if result.scores is not None else []
            lines = []
            for index, text in enumerate(texts):
                polygon = boxes[index] if index < len(boxes) else None
                box = None
                if polygon is not None:
                    points = polygon.tolist() if hasattr(polygon, "tolist") else polygon
                    box = [int(min(p[0] for p in points)), int(min(p[1] for p in points)),
                           int(max(p[0] for p in points)), int(max(p[1] for p in points))]
                lines.append({"text": str(text), "bbox": box,
                              "score": round(float(scores[index]), 3) if index < len(scores) else None})
            pages.append({"page": page_number, "lines": lines})
    return {"pages": pages}


def get_ocr(document_path: Path, ocr, ocr_file: Path) -> dict:
    document_hash = document_sha256(document_path)
    if USE_CACHED_OCR and ocr_file.is_file():
        cached = json.loads(ocr_file.read_text(encoding="utf-8"))
        if cached.get("source_sha256") == document_hash:
            print("OCR z cache:", ocr_file.name)
            return {"pages": cached["pages"]}

    print("Tesseract analizuje dokument...")
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
        "max_tokens": 65536,
    }
    print(f"Wysyłam JEDNO żądanie: {MODEL}; obrazy: {len(page_images)}")

    chunks = []
    last_usage = None
    saw_done = False
    finish_reasons = []
    event_count = 0
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
            timeout=(settings.connect_timeout, settings.read_timeout),
        ) as response:
            if not response.ok:
                raise RuntimeError(
                    f"Eden AI HTTP {response.status_code}: {response.text[:700]}"
                )

            content_type = response.headers.get("Content-Type", "").lower()
            if content_type and "text/event-stream" not in content_type:
                raise RuntimeError(
                    f"Eden AI zwrócił nieoczekiwany Content-Type: {content_type}; "
                    f"odpowiedź: {response.text[:700]}"
                )

            with partial_file.open("w", encoding="utf-8") as output:
                event_type = None
                for line in response.iter_lines(decode_unicode=True):
                    if not line:
                        event_type = None
                        continue
                    if isinstance(line, bytes):
                        line = line.decode("utf-8", errors="replace")
                    if line.startswith("event:"):
                        event_type = line[6:].strip()
                        continue
                    if not line.startswith("data:"):
                        continue
                    item = line[5:].strip()
                    if item == "[DONE]":
                        saw_done = True
                        break
                    try:
                        event = json.loads(item)
                    except json.JSONDecodeError as exc:
                        raise RuntimeError("Eden AI zwrócił niepoprawne zdarzenie SSE (JSON).") from exc
                    if not isinstance(event, dict):
                        raise RuntimeError("Eden AI zwrócił nieoczekiwany format zdarzenia SSE.")
                    event_count += 1
                    if "error" in event or event_type == "error":
                        raise RuntimeError(f"Eden AI streaming error: {event.get('error', event)}")
                    if event.get("usage") is not None:
                        last_usage = event["usage"]
                    for choice in event.get("choices", []):
                        if choice.get("finish_reason") is not None:
                            finish_reasons.append(choice["finish_reason"])
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
        raise ValueError(
            "Nie otrzymano treści modelu od Eden AI "
            f"(zdarzenia: {event_count}, [DONE]: {saw_done}, "
            f"finish_reason: {finish_reasons or 'brak'})."
        )
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
                    raise HTTPException(status_code=413, detail=f"Maksymalny rozmiar pliku to {MAX_UPLOAD_BYTES} bajtów.")
                output.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        validate_content(document_path, suffix)

        # Catch input errors only while entering the converter; errors from OCR
        # or the upstream model must not be reported as malformed uploads.
        with ExitStack() as stack:
            try:
                pdf_path = stack.enter_context(prepare_pdf(document_path))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid document.") from exc

            # Tesseract's shared predictor must not run simultaneous inferences.
            with ocr_lock:
                ocr_data = get_ocr(pdf_path, ocr, workdir / "ocr_result.json")
            try:
                return stream_eden_ai(ocr_data, pdf_path, workdir)
            except (requests.RequestException, RuntimeError, ValueError) as exc:
                logger.exception("Form generation failed")
                raise HTTPException(status_code=502, detail="Form generation failed.") from exc


@app.get("/api/process-document")
async def upload_settings():
    return {"maxUploadBytes": MAX_UPLOAD_BYTES}


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail, "error": exc.detail}, status_code=exc.status_code, headers=exc.headers)


@app.post("/api/process-document")
@app.post("/upload")
async def upload_document(request: Request, file: UploadFile = File(...)):
    """Upload a supported document and wait for the generated form JSON."""
    try:
        suffix = validate_metadata(file.filename or "", file.content_type)
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

    uvicorn.run(app, host="0.0.0.0", port=settings.port)


if __name__ == "__main__":
    main()
