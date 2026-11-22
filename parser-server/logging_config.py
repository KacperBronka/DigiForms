"""Structured operational logs. Never log upload contents, client filenames or credentials."""
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
import os
import sys
import time
from uuid import UUID, uuid4

request_id = ContextVar('request_id', default='')
FIELDS = ('request_id', 'service', 'event', 'method', 'status', 'duration_ms',
          'route', 'job_kind', 'exception_type', 'active_limit', 'queue_capacity')


class JsonFormatter(logging.Formatter):
    def format(self, record):
        result = {'timestamp': datetime.now(timezone.utc).isoformat(),
                  'level': record.levelname, 'logger': record.name,
                  'event': record.getMessage(),
                  'service': os.environ.get('SERVICE_NAME', 'api'),
                  'request_id': request_id.get() or os.environ.get('JOB_REQUEST_ID', '')}
        for field in FIELDS:
            if hasattr(record, field):
                result[field] = getattr(record, field)
        return json.dumps(result, ensure_ascii=False)


def configure_logging():
    level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    if level not in ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'):
        raise ValueError('Invalid LOG_LEVEL')
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger('digiforms')
    logger.handlers = [handler]
    logger.setLevel(level)
    logger.propagate = False


class RequestLogging:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        supplied = dict(scope.get('headers', [])).get(b'x-request-id', b'').decode('ascii', errors='ignore')
        try:
            identifier = UUID(supplied).hex
        except ValueError:
            identifier = uuid4().hex
        token = request_id.set(identifier)
        start = time.monotonic()
        status = 500

        async def logged_send(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
                message = dict(message)
                message['headers'] = list(message.get('headers', [])) + [(b'x-request-id', identifier.encode())]
            await send(message)

        logger = logging.getLogger('digiforms.request')
        try:
            await self.app(scope, receive, logged_send)
        except BaseException as exc:
            logger.error('request_failed', extra={'exception_type': type(exc).__name__})
            raise
        finally:
            log = logger.warning if status >= 400 else logger.info
            log('request_completed', extra={'request_id': identifier, 'method': scope.get('method'), 'status': status,
                                            'route': scope.get('path') if scope.get('path') in ('/upload', '/health') else 'other',
                                            'duration_ms': round((time.monotonic() - start) * 1000)})
            request_id.reset(token)


@contextmanager
def suppress_external_output():
    """Silence Python and native library output in a disposable single-threaded job."""
    sys.stdout.flush()
    sys.stderr.flush()
    saved = [os.dup(1), os.dup(2)]
    try:
        with open(os.devnull, 'w') as sink:
            os.dup2(sink.fileno(), 1)
            os.dup2(sink.fileno(), 2)
            yield
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        for target, original in zip((1, 2), saved):
            os.dup2(original, target)
            os.close(original)
