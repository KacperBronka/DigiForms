"""Runtime configuration; invalid security settings fail at startup."""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).with_name(".env"))


def positive_int(name, default):
    value = int(os.environ.get(name, default))
    if value <= 0:
        raise ValueError(f'{name} must be a positive integer')
    return value


MAX_UPLOAD_BYTES = positive_int('MAX_UPLOAD_BYTES', 20 * 1024 * 1024)
JWT_ENABLED = os.environ.get('JWT_ENABLED', 'false').lower()
if JWT_ENABLED not in ('true', 'false'):
    raise ValueError('JWT_ENABLED must be true or false')
JWT_ENABLED = JWT_ENABLED == 'true'
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_KEY = os.environ.get('JWT_KEY', '').replace('\\n', '\n')
JWT_ISSUER = os.environ.get('JWT_ISSUER', '')
JWT_AUDIENCE = os.environ.get('JWT_AUDIENCE', '')
if JWT_ENABLED:
    if JWT_ALGORITHM not in ('HS256', 'RS256'):
        raise ValueError('JWT_ALGORITHM must be HS256 or RS256')
    if not all((JWT_KEY, JWT_ISSUER, JWT_AUDIENCE)):
        raise ValueError('JWT_KEY, JWT_ISSUER and JWT_AUDIENCE are required')
    if JWT_ALGORITHM == 'HS256' and len(JWT_KEY.encode()) < 32:
        raise ValueError('JWT_KEY must contain at least 32 bytes for HS256')

MAX_DOCUMENT_PAGES = positive_int('MAX_DOCUMENT_PAGES', 30)
MAX_IMAGE_PIXELS = positive_int('MAX_IMAGE_PIXELS', 20_000_000)
MAX_TOTAL_PIXELS = positive_int('MAX_TOTAL_PIXELS', 100_000_000)
MAX_ARCHIVE_ENTRIES = positive_int('MAX_ARCHIVE_ENTRIES', 2000)
MAX_ARCHIVE_BYTES = positive_int('MAX_ARCHIVE_BYTES', 100 * 1024 * 1024)
MAX_ARCHIVE_RATIO = positive_int('MAX_ARCHIVE_RATIO', 100)
MAX_SANITIZED_BYTES = positive_int('MAX_SANITIZED_BYTES', 64 * 1024 * 1024)
SANITIZE_DPI = positive_int('SANITIZE_DPI', 150)
MAX_ACTIVE_JOBS = positive_int('MAX_ACTIVE_JOBS', 1)
MAX_QUEUED_JOBS = positive_int('MAX_QUEUED_JOBS', 2)
QUEUE_TIMEOUT_SECONDS = positive_int('QUEUE_TIMEOUT_SECONDS', 15)
JOB_TIMEOUT_SECONDS = positive_int('JOB_TIMEOUT_SECONDS', 240)
WORKER_TIMEOUT_SECONDS = positive_int('WORKER_TIMEOUT_SECONDS', 180)
WORKER_SOCKET = os.environ.get('WORKER_SOCKET', '/run/worker/worker.sock')
