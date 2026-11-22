"""Offline conversion and raster reconstruction. Originals never reach OCR or Eden AI."""
from pathlib import Path
from contextlib import contextmanager
import math
import subprocess
import tempfile
import warnings
import io
from uuid import uuid4

import pymupdf
from PIL import Image, ImageOps
from fastapi import HTTPException
import settings

OFFICE_FORMATS = {'.doc', '.docx', '.ods', '.xlsx'}
IMAGE_FORMATS = {'.jpg', '.jpeg', '.png'}
SUPPORTED_FORMATS = OFFICE_FORMATS | IMAGE_FORMATS | {'.pdf'}


def check_pixels(width, height):
    if width <= 0 or height <= 0 or width * height > settings.MAX_IMAGE_PIXELS:
        raise HTTPException(413, 'Document image or page exceeds pixel limit.')


def reconstruct_pdf(source, output):
    with pymupdf.open(source) as original, pymupdf.open() as clean:
        if not original.is_pdf or original.needs_pass or not 0 < original.page_count <= settings.MAX_DOCUMENT_PAGES:
            raise HTTPException(413, 'Encrypted, empty or over-limit PDF.')
        total_pixels = 0
        total_bytes = 0
        for page in original:
            width = math.ceil(page.rect.width * settings.SANITIZE_DPI / 72)
            height = math.ceil(page.rect.height * settings.SANITIZE_DPI / 72)
            check_pixels(width, height)
            total_pixels += width * height
            if total_pixels > settings.MAX_TOTAL_PIXELS:
                raise HTTPException(413, 'Document exceeds total rendered pixel limit.')
            # Check embedded image headers before rendering/decompression.
            for item in page.get_images(full=True):
                check_pixels(item[2], item[3])
            pix = page.get_pixmap(dpi=settings.SANITIZE_DPI, colorspace=pymupdf.csRGB, alpha=False)
            image = pix.tobytes('jpeg', jpg_quality=90)
            total_bytes += len(image)
            if total_bytes > settings.MAX_SANITIZED_BYTES:
                raise HTTPException(413, 'Sanitized document exceeds size limit.')
            target = clean.new_page(width=page.rect.width, height=page.rect.height)
            target.insert_image(target.rect, stream=image)
        # Never copy PDF objects, metadata, actions, attachments or annotations.
        clean.save(output, garbage=4, deflate=True)
    if output.stat().st_size > settings.MAX_SANITIZED_BYTES:
        raise HTTPException(413, 'Sanitized document exceeds size limit.')


@contextmanager
def prepare_pdf(source: Path):
    source = Path(source).resolve()
    if source.suffix not in SUPPORTED_FORMATS or not source.is_file():
        raise ValueError('Unsupported document')
    with tempfile.TemporaryDirectory(prefix='sanitize-', dir=source.parent) as tmp:
        workdir = Path(tmp)
        converted = source
        if source.suffix in IMAGE_FORMATS:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(source) as image:
                    check_pixels(*image.size)
                    image.verify()
                with Image.open(source) as image:
                    flattened = ImageOps.exif_transpose(image).convert('RGB')
                    buffer = io.BytesIO()
                    flattened.save(buffer, format='PNG')
            converted = workdir / f'{uuid4().hex}.pdf'
            with pymupdf.open(stream=buffer.getvalue(), filetype='png') as image:
                converted.write_bytes(image.convert_to_pdf())
        elif source.suffix in OFFICE_FORMATS:
            profile = workdir / 'profile'
            (profile / 'user').mkdir(parents=True)
            # Disable all macros and automatic external-link updates in a fresh profile.
            (profile / 'user' / 'registrymodifications.xcu').write_text('''<?xml version="1.0"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
</oor:items>''')
            try:
                subprocess.run(['soffice', f'-env:UserInstallation={profile.as_uri()}',
                                '--headless', '--norestore', '--convert-to', 'pdf',
                                '--outdir', str(workdir), str(source)],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               timeout=min(90, settings.WORKER_TIMEOUT_SECONDS))
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                raise HTTPException(400, 'Office conversion failed or timed out.') from exc
            converted = workdir / (source.stem + '.pdf')
            if not converted.is_file():
                raise ValueError('PDF conversion failed')
            if converted.stat().st_size > settings.MAX_SANITIZED_BYTES:
                raise HTTPException(413, 'Converted document exceeds size limit.')
        output = workdir / f'{uuid4().hex}.pdf'
        reconstruct_pdf(converted, output)
        yield output
