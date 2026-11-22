"""Offline document service, reachable only through a shared Unix socket."""
import os
from tempfile import TemporaryDirectory
from fastapi import FastAPI, File, UploadFile
from starlette.concurrency import run_in_threadpool
import settings
from logging_config import configure_logging, RequestLogging
configure_logging()
from job_control import JobAdmission, run_job, save_upload
from upload_validation import UploadBodyLimit

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(UploadBodyLimit, max_bytes=settings.MAX_UPLOAD_BYTES)
app.add_middleware(JobAdmission)
app.add_middleware(RequestLogging)


def process(file):
    with TemporaryDirectory(prefix='document-worker-') as directory:
        source = save_upload(file, directory)
        return run_job('worker', source, file.content_type, settings.WORKER_TIMEOUT_SECONDS)


@app.post('/upload')
async def upload(file: UploadFile = File(...)):
    try:
        return await run_in_threadpool(process, file)
    finally:
        await file.close()


@app.get('/health')
async def health():
    return {'status': 'ready'}


if __name__ == '__main__':
    import uvicorn
    os.umask(0o077)
    uvicorn.run(app, uds=settings.WORKER_SOCKET, access_log=False)
