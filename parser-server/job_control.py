"""Bound admission before multipart parsing; enforce deadlines by killing process groups."""
import asyncio
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import logging
from logging_config import request_id
logger = logging.getLogger("digiforms.jobs")
from uuid import uuid4

from fastapi import HTTPException
from starlette.responses import JSONResponse
import settings


class JobAdmission:
    def __init__(self, app, active=None, queued=None, wait_seconds=None):
        self.app = app
        self.active = active or settings.MAX_ACTIVE_JOBS
        self.capacity = self.active + (settings.MAX_QUEUED_JOBS if queued is None else queued)
        self.wait_seconds = wait_seconds or settings.QUEUE_TIMEOUT_SECONDS
        self.semaphore = asyncio.Semaphore(self.active)
        self.admitted = 0

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path', '').rstrip('/') != '/upload':
            return await self.app(scope, receive, send)
        if self.admitted >= self.capacity:
            logger.warning("queue_full", extra={"active_limit": self.active, "queue_capacity": self.capacity})
            return await JSONResponse({'detail': 'Processing queue is full.'}, 503,
                                      headers={'Retry-After': '5'})(scope, receive, send)
        self.admitted += 1
        acquired = False
        try:
            try:
                await asyncio.wait_for(self.semaphore.acquire(), self.wait_seconds)
                acquired = True
            except TimeoutError:
                logger.warning("queue_wait_timeout")
                return await JSONResponse({'detail': 'Processing queue wait timed out.'}, 503,
                                          headers={'Retry-After': '5'})(scope, receive, send)
            await self.app(scope, receive, send)
        finally:
            if acquired:
                self.semaphore.release()
            self.admitted -= 1


def run_job(kind: str, source: Path, content_type: str | None, timeout: int):
    result = source.parent / f'{uuid4().hex}.json'
    start = time.monotonic()
    logger.info("job_started", extra={"job_kind": kind})
    process = subprocess.Popen(
        [sys.executable, str(Path(__file__).with_name('job_runner.py')),
         kind, str(source), content_type or '', str(result)],
        start_new_session=True, env={**os.environ, "JOB_REQUEST_ID": request_id.get() or os.environ.get("JOB_REQUEST_ID", "")},
    )
    try:
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            logger.warning("job_timeout", extra={"job_kind": kind})
            raise HTTPException(504, 'Document processing deadline exceeded.') from exc
    finally:
        # Kill the whole group, including LibreOffice descendants, on every exit.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        logger.info("job_process_stopped", extra={"job_kind": kind, "duration_ms": round((time.monotonic() - start) * 1000)})
    if code != 0 or not result.exists() or result.stat().st_size > settings.MAX_SANITIZED_BYTES:
        raise HTTPException(502, 'Document worker failed.')
    data = json.loads(result.read_text())
    if 'error' in data:
        raise HTTPException(data['status'], data['error'])
    return data['data']


def save_upload(file, directory):
    from upload_validation import validate_filename
    path = Path(directory) / (uuid4().hex + validate_filename(file.filename or ''))
    size = 0
    with path.open('wb') as output:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.MAX_UPLOAD_BYTES:
                raise HTTPException(413, 'Maximum upload size exceeded.')
            output.write(chunk)
    if not size:
        raise HTTPException(400, 'The uploaded file is empty.')
    return path
