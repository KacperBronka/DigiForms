"""One disposable process per document. No uploaded code is executed deliberately."""
import json
import os
from pathlib import Path
from contextlib import ExitStack
import sys
import logging
from logging_config import configure_logging, suppress_external_output
configure_logging()
logger = logging.getLogger("digiforms.pipeline")
from fastapi import HTTPException


def main():
    kind, filename, content_type, result = sys.argv[1:]
    source = Path(filename)
    try:
        if kind == 'worker':
            # Model weights stay read-only in the image; mutable locks/caches are per job.
            cache = source.parent / 'paddlex-cache'
            cache.mkdir()
            (cache / 'official_models').symlink_to(Path.home() / '.paddlex' / 'official_models', target_is_directory=True)
            os.environ['PADDLE_PDX_CACHE_HOME'] = str(cache)
            from document_converter import prepare_pdf
            from upload_validation import validate_content
            from ocr_engine import load_ocr, extract_ocr, pdf_to_images
            logger.info('document_validation_started')
            with suppress_external_output():
                validate_content(source, source.suffix, content_type)
            with ExitStack() as stack:
                with suppress_external_output():
                    sanitized = stack.enter_context(prepare_pdf(source))
                logger.info('sanitization_completed')
                # Third-party OCR output can contain document text; suppress it.
                with suppress_external_output():
                    ocr = extract_ocr(sanitized, load_ocr())
                    images = pdf_to_images(sanitized)
                logger.info('ocr_completed')
                data = {'ocr': ocr, 'images': images}
        elif kind == 'api':
            from main import generate_form
            data = generate_form(source, content_type)
        else:
            raise ValueError('Unknown job type')
        response = {'data': data}
    except HTTPException as exc:
        logger.warning("job_rejected", extra={"status": exc.status_code})
        response = {'status': exc.status_code, 'error': exc.detail}
    except (ValueError, OSError) as exc:
        logger.warning("document_invalid", extra={"exception_type": type(exc).__name__})
        response = {'status': 400, 'error': 'Invalid document or document resource limit exceeded.'}
    except Exception as exc:
        logger.error("job_failed", extra={"exception_type": type(exc).__name__})
        response = {'status': 502, 'error': 'Document processing failed.'}
    Path(result).write_text(json.dumps(response), encoding='utf-8')


if __name__ == '__main__':
    main()
