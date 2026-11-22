
"""FormForge: PaddleOCR + page images -> Eden AI streaming -> COI JSON.

Run: python main.py (serves on port 3001; API docs at /docs).
Upload: POST /upload with a multipart file field named "file".
Document sanitization and OCR run in an offline worker with per-job deadlines.
Set EDENAI_API_KEY in the environment or the .env file next to this script.
"""
from contextlib import asynccontextmanager
from tempfile import TemporaryDirectory
from pathlib import Path
import json
import os
import re
import time
from uuid import uuid4

import requests
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from upload_validation import validate_filename, UploadBodyLimit
from job_control import JobAdmission, run_job, save_upload
import httpx
import logging
from logging_config import configure_logging, RequestLogging
configure_logging()
logger = logging.getLogger("digiforms.api")
from starlette.concurrency import run_in_threadpool
from dotenv import dotenv_values, load_dotenv

# =================== CONFIG ===================
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)
import settings
# An empty inherited variable otherwise masks the value in .env.
API_KEY = os.environ.get("EDENAI_API_KEY") or dotenv_values(ENV_PATH).get("EDENAI_API_KEY") or ""
MODEL = os.environ.get("EDENAI_MODEL", "gemma-4-31b-it")

MAX_OCR_CHARS = 160_000
READ_TIMEOUT_SECONDS = settings.positive_int("EDENAI_READ_TIMEOUT_SECONDS", 180)  # Time waiting for the next chunk, not whole response
# ===================================================

BASE_DIR = Path(__file__).resolve().parent
API_URL = "https://api.edenai.run/v3/chat/completions"
MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_BYTES


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("service_started")
    try:
        yield
    finally:
        logger.info("service_stopped")


app = FastAPI(title="FormForge", lifespan=lifespan)
app.add_middleware(UploadBodyLimit, max_bytes=MAX_UPLOAD_BYTES)
app.add_middleware(JobAdmission)
app.add_middleware(RequestLogging)


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


def stream_eden_ai(ocr_data: dict, page_images: list, workdir: Path):
    artifact_id = uuid4().hex
    raw_file = workdir / f"{artifact_id}-raw.txt"
    partial_file = workdir / f"{artifact_id}-partial.txt"
    usage_file = workdir / f"{artifact_id}-usage.json"
    if not API_KEY:
        raise ValueError("Set EDENAI_API_KEY in .env before running.")

    agents, guidelines_md, guidelines_json = read_guidelines()
    compact_ocr = json.dumps(ocr_data, ensure_ascii=False, separators=(",", ":"))
    if len(compact_ocr) > MAX_OCR_CHARS:
        raise ValueError(f"OCR ma {len(compact_ocr)} znaków, limit to {MAX_OCR_CHARS}.")

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
    logger.info("eden_request_started")

    chunks = []
    last_usage = None
    saw_done = False
    start = time.monotonic()
    # Write all arrived chunks immediately; never overwrite an earlier result silently.
    if partial_file.exists():
        backup = partial_file.with_name(partial_file.stem + "_previous.txt")
        partial_file.replace(backup)
        logger.info("partial_result_preserved")

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
    logger.info("eden_request_completed", extra={"duration_ms": round((time.monotonic() - start) * 1000)})
    if last_usage is not None:
        usage_file.write_text(json.dumps(last_usage, indent=2), encoding="utf-8")
    if not saw_done:
        logger.warning("eden_stream_missing_completion_marker")
    return parse_model_json(content)


def generate_form(source: Path, content_type: str):
    # Only JSON and newly encoded page images return from the offline worker.
    transport = httpx.HTTPTransport(uds=settings.WORKER_SOCKET)
    try:
        with httpx.Client(transport=transport, timeout=settings.WORKER_TIMEOUT_SECONDS + 20) as client:
            with source.open('rb') as document:
                with client.stream('POST', 'http://worker/upload',
                                   files={'file': (source.name, document, content_type)},
                                   headers={'X-Request-ID': os.environ.get('JOB_REQUEST_ID', '')}) as response:
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body.extend(chunk)
                        if len(body) > settings.MAX_SANITIZED_BYTES:
                            raise HTTPException(413, 'Processed document exceeds output limit.')
                    payload = json.loads(body)
                    if response.status_code != 200:
                        raise HTTPException(response.status_code, payload.get('detail', 'Document worker failed.'))
        return stream_eden_ai(payload['ocr'], payload['images'], source.parent)
    except httpx.RequestError as exc:
        raise HTTPException(503, 'Document worker is unavailable.') from exc
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        raise HTTPException(502, 'Form generation failed.') from exc


def process_upload(file: UploadFile):
    with TemporaryDirectory(prefix='formforge-') as directory:
        source = save_upload(file, directory)
        return run_job('api', source, file.content_type, settings.JOB_TIMEOUT_SECONDS)


bearer = HTTPBearer(auto_error=False)


def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not settings.JWT_ENABLED:
        return
    try:
        if credentials is None:
            raise jwt.InvalidTokenError('Missing bearer token')
        jwt.decode(credentials.credentials, settings.JWT_KEY,
                   algorithms=[settings.JWT_ALGORITHM], issuer=settings.JWT_ISSUER,
                   audience=settings.JWT_AUDIENCE,
                   options={"require": ["exp", "iss", "aud", "sub"]})
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, 'Invalid or missing bearer token.',
                            headers={"WWW-Authenticate": "Bearer"}) from exc


@app.post("/upload", dependencies=[Depends(authorize)])
async def upload_document(request: Request, file: UploadFile = File(...)):
    """Upload a supported document and wait for the generated form JSON."""
    try:
        validate_filename(file.filename or "")
        if not API_KEY:
            raise HTTPException(status_code=503, detail="EDENAI_API_KEY is not configured.")
        return await run_in_threadpool(process_upload, file)
    finally:
        await file.close()


@app.get("/health")
async def health():
    return {"status": "ready"}


def main():
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "3001")), access_log=False)


if __name__ == "__main__":
    main()
