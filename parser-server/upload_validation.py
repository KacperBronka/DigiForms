"""Validate upload metadata and actual content before invoking converters."""
from pathlib import Path
import re
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree

import olefile
import pymupdf
from PIL import Image
from fastapi import HTTPException

MIME_TYPES = {
    '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
}


def validate_metadata(filename: str, content_type: str | None) -> str:
    if not filename or len(filename) > 250 or re.search(r"[;:></\\|'*%$]", filename):
        raise HTTPException(400, "Nazwa pliku musi mieć od 1 do 250 znaków i nie może zawierać znaków ; : > < / \\ | ' * % $.")
    suffix = Path(filename).suffix.lower()
    if suffix not in MIME_TYPES:
        raise HTTPException(415, 'Nieobsługiwany format pliku.')
    # Browsers may omit MIME or use the generic binary type. Content is always verified.
    mime = (content_type or '').split(';', 1)[0].strip().lower()
    if mime not in ('', 'application/octet-stream', MIME_TYPES[suffix]):
        raise HTTPException(415, 'Typ MIME nie odpowiada rozszerzeniu pliku.')
    return suffix


def validate_content(path: Path, suffix: str) -> None:
    try:
        if suffix == '.pdf':
            with path.open('rb') as source:
                if not source.read(8).startswith(b'%PDF-'):
                    raise ValueError('PDF header')
            with pymupdf.open(path) as doc:
                if not doc.is_pdf or doc.page_count == 0:
                    raise ValueError('PDF content')
        elif suffix in ('.png', '.jpg', '.jpeg'):
            with Image.open(path) as image:
                if image.format != ('PNG' if suffix == '.png' else 'JPEG'):
                    raise ValueError('Image format')
                image.verify()
        elif suffix == '.doc':
            with olefile.OleFileIO(path) as doc:
                if not doc.exists('WordDocument') or not (doc.exists('0Table') or doc.exists('1Table')):
                    raise ValueError('Word streams')
        else:
            with ZipFile(path) as archive:
                def read_small(name):
                    if archive.getinfo(name).file_size > 1024 * 1024:
                        raise ValueError('Oversized metadata')
                    return archive.read(name)
                if suffix == '.ods':
                    if read_small('mimetype').decode('ascii') != MIME_TYPES[suffix]:
                        raise ValueError('ODS MIME')
                    archive.getinfo('content.xml')
                else:
                    root = ElementTree.fromstring(read_small('[Content_Types].xml'))
                    part, mime = {
                        '.docx': ('/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'),
                        '.xlsx': ('/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'),
                    }[suffix]
                    if not any(node.get('PartName') == part and node.get('ContentType') == mime for node in root):
                        raise ValueError('Office MIME')
                    archive.getinfo(part.lstrip('/'))
    except (ValueError, OSError, KeyError, BadZipFile, ElementTree.ParseError, RuntimeError) as exc:
        raise HTTPException(415, 'Zawartość pliku jest niepoprawna lub nie odpowiada jego rozszerzeniu i typowi MIME.') from exc
