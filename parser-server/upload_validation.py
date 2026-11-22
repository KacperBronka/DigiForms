"""Validate client metadata and independently identify the uploaded content."""
from pathlib import Path
from zipfile import ZipFile, BadZipFile
import xml.etree.ElementTree as ET
import settings

import magic
import olefile
from fastapi import HTTPException

MIME_TYPES = {
    '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
}
FORBIDDEN = set(";:></\\|'*%$")


def validate_filename(name: str) -> str:
    if not name or len(name) > 250 or any(c in FORBIDDEN or ord(c) < 32 or ord(c) == 127 for c in name):
        raise HTTPException(400, 'Invalid filename: maximum 250 characters; forbidden characters: ; : > < / \\ | \' * % $ and control characters.')
    suffix = Path(name).suffix.lower()
    if suffix not in MIME_TYPES:
        raise HTTPException(415, 'Supported formats: ' + ', '.join(MIME_TYPES))
    return suffix


def validate_content(path: Path, suffix: str, declared: str | None):
    expected = MIME_TYPES[suffix]
    # Missing/generic client MIME is allowed; content detection is always required.
    supplied = (declared or '').split(';', 1)[0].strip().lower()
    if supplied not in ('', 'application/octet-stream', expected):
        raise HTTPException(415, 'Declared MIME type does not match the extension.')
    detected = magic.from_file(str(path), mime=True)
    try:
        if suffix in ('.docx', '.xlsx', '.ods'):
            if detected not in (expected, 'application/zip'):
                raise ValueError('Not an Office archive')
            with ZipFile(path) as archive:
                entries = archive.infolist()
                if len(entries) > settings.MAX_ARCHIVE_ENTRIES or len({i.filename for i in entries}) != len(entries):
                    raise HTTPException(413, 'Archive has too many or duplicate entries.')
                expanded = 0
                for entry in entries:
                    if entry.flag_bits & 1:
                        raise ValueError('Encrypted archive')
                    if entry.file_size > settings.MAX_ARCHIVE_BYTES or entry.file_size > max(1, entry.compress_size) * settings.MAX_ARCHIVE_RATIO:
                        raise HTTPException(413, 'Archive expansion limit exceeded.')
                    expanded += entry.file_size
                    if expanded > settings.MAX_ARCHIVE_BYTES:
                        raise HTTPException(413, 'Archive expansion limit exceeded.')
                    name = entry.filename.lower()
                    if 'vbaproject' in name or name.startswith(('basic/', 'scripts/')):
                        raise ValueError('Macros are not accepted')
                # Verify actual decompression/CRC with bounded reads, not just ZIP metadata.
                actual = 0
                for entry in entries:
                    with archive.open(entry) as member:
                        while chunk := member.read(65536):
                            actual += len(chunk)
                            if actual > settings.MAX_ARCHIVE_BYTES:
                                raise HTTPException(413, 'Archive expansion limit exceeded.')
                def small_read(name):
                    if archive.getinfo(name).file_size > 1024 * 1024:
                        raise ValueError('Oversized metadata')
                    return archive.read(name)
                if suffix == '.ods':
                    if small_read('mimetype') != expected.encode() or 'content.xml' not in archive.namelist():
                        raise ValueError('Not an ODS document')
                else:
                    part, kind = (('/word/document.xml', 'wordprocessingml.document') if suffix == '.docx'
                                  else ('/xl/workbook.xml', 'spreadsheetml.sheet'))
                    root = ET.fromstring(small_read('[Content_Types].xml'))
                    content_type = 'application/vnd.openxmlformats-officedocument.' + kind + '.main+xml'
                    if part[1:] not in archive.namelist() or not any(
                        node.get('PartName') == part and node.get('ContentType') == content_type for node in root
                    ):
                        raise ValueError('Wrong Office document type')
        elif suffix == '.doc':
            if detected not in (expected, 'application/x-ole-storage', 'application/CDFV2'):
                raise ValueError('Not a Word document')
            with olefile.OleFileIO(path) as document:
                if not document.exists('WordDocument') or not (document.exists('0Table') or document.exists('1Table')):
                    raise ValueError('Not a Word document')
        elif detected != expected:
            raise ValueError('MIME mismatch')
    except (ValueError, KeyError, BadZipFile, ET.ParseError, OSError, RuntimeError) as exc:
        raise HTTPException(415, 'File content does not match its extension or is malformed.') from exc


class UploadBodyLimit:
    """Bound multipart traffic before Starlette spools uploaded files to disk."""
    def __init__(self, app, max_bytes):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        total = 0

        async def limited_receive():
            nonlocal total
            message = await receive()
            if message['type'] == 'http.request':
                total += len(message.get('body', b''))
                if total > self.max_bytes + 1024 * 1024:
                    raise HTTPException(413, 'Maximum multipart request size exceeded.')
            return message

        await self.app(scope, limited_receive if scope['type'] == 'http' else receive, send)
