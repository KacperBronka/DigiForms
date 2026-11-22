"""API regression tests; no OCR downloads or Eden AI requests are made."""
import asyncio
from contextlib import contextmanager
from threading import Event
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from httpx import ASGITransport, AsyncClient

import main
import jwt
import time
from upload_validation import validate_filename, validate_content
from tempfile import TemporaryDirectory
from pathlib import Path
import io
from zipfile import ZipFile
from PIL import Image


class UploadTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.paths = []

        def job(kind, source, content_type, timeout):
            self.paths.append(source)
            return {"title": "Wniosek"}

        for name, value in [("API_KEY", "test-key"), ("run_job", job)]:
            patcher = patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        await self.enterAsyncContext(main.lifespan(main.app))
        self.client = await self.enterAsyncContext(AsyncClient(
            transport=ASGITransport(app=main.app), base_url="http://test",
        ))

    async def upload(self, content=b"%PDF-1.4\n document", filename="form.pdf"):
        return await self.client.post("/upload", files={"file": (filename, content)})

    async def test_randomized_names_and_cleanup(self):
        for _ in range(2):
            response = await self.upload(filename="form.PDF")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"title": "Wniosek"})
        self.assertNotEqual(self.paths[0].name, self.paths[1].name)
        for path in self.paths:
            self.assertRegex(path.name, r'^[0-9a-f]{32}\.pdf$')
            self.assertFalse(path.parent.exists())

    async def test_bad_uploads_rejected(self):
        self.assertEqual((await self.client.post("/upload")).status_code, 422)
        self.assertEqual((await self.upload(filename="form.exe")).status_code, 415)
        self.assertEqual((await self.upload(content=b"")).status_code, 400)
        with patch.object(main.settings, "MAX_UPLOAD_BYTES", 3):
            self.assertEqual((await self.upload(content=b"1234")).status_code, 413)
        self.assertEqual(self.paths, [])

    async def test_filename_validation(self):
        for character in ";:></\\|'*%$":
            with self.subTest(character=character):
                with self.assertRaises(main.HTTPException):
                    validate_filename('a' + character + '.pdf')
        self.assertEqual(validate_filename('ą' * 246 + '.pdf'), '.pdf')
        self.assertEqual((await self.upload(filename='a' * 247 + '.pdf')).status_code, 400)
        self.assertEqual((await self.upload(filename='../file.pdf')).status_code, 400)

    async def test_multipart_limit_without_content_length(self):
        async def body():
            yield b'x' * (main.MAX_UPLOAD_BYTES + 1024 * 1024 + 1)
        response = await self.client.post('/upload', content=body(), headers={
            'Content-Type': 'multipart/form-data; boundary=test',
        })
        self.assertEqual(response.status_code, 413)

    async def test_jwt(self):
        key = 'a' * 32
        claims = {'sub': 'user', 'iss': 'issuer', 'aud': 'forms', 'exp': int(time.time()) + 60}
        with patch.multiple(main.settings, JWT_ENABLED=True, JWT_KEY=key,
                            JWT_ALGORITHM='HS256', JWT_ISSUER='issuer', JWT_AUDIENCE='forms'):
            self.assertEqual((await self.upload()).status_code, 401)
            for override in ({'exp': 1}, {'iss': 'other'}, {'aud': 'other'}, {'sub': None}):
                token = jwt.encode(claims | override, key, algorithm='HS256')
                response = await self.client.post('/upload', files={'file': ('a.pdf', b'%PDF-1.4')},
                                                  headers={'Authorization': 'Bearer ' + token})
                self.assertEqual(response.status_code, 401)
            token = jwt.encode(claims, key, algorithm='HS256')
            response = await self.client.post('/upload', files={'file': ('a.pdf', b'%PDF-1.4')},
                                              headers={'Authorization': 'Bearer ' + token})
            self.assertEqual(response.status_code, 200)

    async def test_missing_key(self):
        with patch.object(main, "API_KEY", ""):
            self.assertEqual((await self.upload()).status_code, 503)
        self.assertEqual(self.paths, [])

    async def test_job_timeout_cleans_files(self):
        def timeout(kind, source, *args):
            self.paths.append(source)
            raise main.HTTPException(504, 'Timeout')
        with patch.object(main, 'run_job', side_effect=timeout):
            self.assertEqual((await self.upload()).status_code, 504)
        self.assertFalse(self.paths[0].parent.exists())

    async def test_health_responds_while_processing(self):
        started, release = Event(), Event()

        def wait_for_release(*args):
            started.set()
            if not release.wait(5):
                raise RuntimeError('Test timed out')
            return {'title': 'Wniosek'}

        with patch.object(main, 'run_job', side_effect=wait_for_release):
            pending = asyncio.create_task(self.upload())
            try:
                for _ in range(500):
                    if started.is_set():
                        break
                    await asyncio.sleep(0.01)
                self.assertTrue(started.is_set())
                self.assertEqual((await self.client.get('/health')).status_code, 200)
            finally:
                release.set()
            self.assertEqual((await pending).status_code, 200)


class ContentValidationTests(unittest.TestCase):
    def check(self, content, suffix, declared=None):
        with TemporaryDirectory() as directory:
            path = Path(directory) / ('test' + suffix)
            path.write_bytes(content)
            validate_content(path, suffix, declared)

    def test_real_image_types(self):
        for fmt, suffix, mime in [('PNG', '.png', 'image/png'), ('JPEG', '.jpg', 'image/jpeg')]:
            buffer = io.BytesIO()
            Image.new('RGB', (2, 2)).save(buffer, format=fmt)
            self.check(buffer.getvalue(), suffix, mime)
            with self.assertRaises(main.HTTPException):
                self.check(buffer.getvalue(), '.pdf')

    def test_office_archives(self):
        for suffix, part, kind in [('.docx', 'word/document.xml', 'wordprocessingml.document'),
                                   ('.xlsx', 'xl/workbook.xml', 'spreadsheetml.sheet')]:
            buffer = io.BytesIO()
            with ZipFile(buffer, 'w') as archive:
                archive.writestr('[Content_Types].xml',
                    f'<Types><Override PartName="/{part}" ContentType="application/vnd.openxmlformats-officedocument.{kind}.main+xml"/></Types>')
                archive.writestr(part, '<document/>')
            self.check(buffer.getvalue(), suffix)
            with self.assertRaises(main.HTTPException):
                self.check(buffer.getvalue(), '.xlsx' if suffix == '.docx' else '.docx')
        buffer = io.BytesIO()
        with ZipFile(buffer, 'w') as archive:
            archive.writestr('mimetype', 'application/vnd.oasis.opendocument.spreadsheet')
            archive.writestr('content.xml', '<document/>')
        self.check(buffer.getvalue(), '.ods')

    def test_arbitrary_zip_and_fake_doc_rejected(self):
        buffer = io.BytesIO()
        with ZipFile(buffer, 'w') as archive:
            archive.writestr('random.txt', 'not a document')
        for suffix in ('.docx', '.xlsx', '.ods', '.doc'):
            with self.subTest(suffix=suffix), self.assertRaises(main.HTTPException):
                self.check(buffer.getvalue(), suffix)


if __name__ == "__main__":
    unittest.main()
