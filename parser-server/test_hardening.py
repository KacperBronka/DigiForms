import asyncio
import io
import json
import logging
from pathlib import Path
import subprocess
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZIP_DEFLATED

import pymupdf
from PIL import Image
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport
from starlette.responses import JSONResponse

import settings
from document_converter import prepare_pdf
from job_control import JobAdmission, run_job
from logging_config import RequestLogging, JsonFormatter
from upload_validation import validate_content


class DocumentTests(unittest.TestCase):
    def test_reconstruction_removes_active_content_and_metadata(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / 'original.pdf'
            with pymupdf.open() as doc:
                page = doc.new_page(width=200, height=200)
                page.insert_text((20, 30), 'Document')
                page.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(10, 10, 100, 50), 'uri': 'https://example.com'})
                doc.embfile_add('payload.txt', b'embedded content')
                doc.set_metadata({'author': 'Private author'})
                doc.save(source)
            with prepare_pdf(source) as output:
                self.assertNotEqual(source.name, output.name)
                with pymupdf.open(output) as clean:
                    self.assertEqual(clean.embfile_count(), 0)
                    self.assertEqual(clean[0].get_links(), [])
                    self.assertEqual(clean[0].get_text(), '')
                    self.assertEqual(clean.metadata['author'], '')
                    self.assertTrue(clean[0].get_images())
                    self.assertEqual(clean.page_count, 1)
            self.assertFalse(output.exists())

    @unittest.skipUnless(shutil.which('soffice'), 'LibreOffice is not installed')
    def test_real_office_conversion(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / 'document.docx'
            with ZipFile(source, 'w') as archive:
                archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
                archive.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
                archive.writestr('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Test document</w:t></w:r></w:p></w:body></w:document>')
            validate_content(source, '.docx', None)
            with prepare_pdf(source) as output, pymupdf.open(output) as doc:
                self.assertEqual(doc.page_count, 1)
                self.assertTrue(doc[0].get_images())
                self.assertEqual(doc[0].get_text(), '')

    def test_page_and_render_limits(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / 'test.pdf'
            with pymupdf.open() as doc:
                doc.new_page()
                doc.new_page()
                doc.save(source)
            for name, limit in [('MAX_DOCUMENT_PAGES', 1), ('MAX_IMAGE_PIXELS', 100), ('MAX_TOTAL_PIXELS', 100)]:
                with self.subTest(name=name), patch.object(settings, name, limit):
                    with self.assertRaises(HTTPException) as error:
                        with prepare_pdf(source):
                            pass
                    self.assertEqual(error.exception.status_code, 413)

    def test_image_limit_before_decode(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / 'image.png'
            Image.new('RGB', (20, 20)).save(source)
            with patch.object(settings, 'MAX_IMAGE_PIXELS', 100), self.assertRaises(HTTPException):
                with prepare_pdf(source):
                    pass

    def test_archive_bombs(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / 'test.docx'
            with ZipFile(source, 'w', ZIP_DEFLATED) as archive:
                archive.writestr('word/document.xml', b'A' * 200000)
            with self.assertRaises(HTTPException) as error:
                validate_content(source, '.docx', None)
            self.assertEqual(error.exception.status_code, 413)
            with ZipFile(source, 'w') as archive:
                for i in range(3):
                    archive.writestr(f'{i}.txt', 'test')
            with patch.object(settings, 'MAX_ARCHIVE_ENTRIES', 2), self.assertRaises(HTTPException) as error:
                validate_content(source, '.docx', None)
            self.assertEqual(error.exception.status_code, 413)

    def test_deadline_kills_process(self):
        original_popen = subprocess.Popen
        processes = []

        def sleeper(*args, **kwargs):
            process = original_popen([sys.executable, '-c', 'import time; time.sleep(60)'], **kwargs)
            processes.append(process)
            return process

        with TemporaryDirectory() as tmp, patch('job_control.subprocess.Popen', side_effect=sleeper):
            source = Path(tmp) / 'test.pdf'
            source.write_bytes(b'test')
            with self.assertRaises(HTTPException) as error:
                run_job('worker', source, 'application/pdf', 0.05)
            self.assertEqual(error.exception.status_code, 504)
            self.assertIsNotNone(processes[0].poll())


class AdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_queue_capacity_recovery_and_health(self):
        started, release = asyncio.Event(), asyncio.Event()

        async def service(scope, receive, send):
            if scope['path'] == '/upload':
                started.set()
                await release.wait()
            await JSONResponse({'ok': True})(scope, receive, send)

        gate = JobAdmission(service, active=1, queued=1, wait_seconds=1)
        async with AsyncClient(transport=ASGITransport(app=gate), base_url='http://test') as client:
            first = asyncio.create_task(client.post('/upload'))
            await started.wait()
            second = asyncio.create_task(client.post('/upload'))
            while gate.admitted != 2:
                await asyncio.sleep(0)
            self.assertEqual((await client.post('/upload')).status_code, 503)
            self.assertEqual((await client.get('/health')).status_code, 200)
            release.set()
            self.assertEqual((await first).status_code, 200)
            self.assertEqual((await second).status_code, 200)
            self.assertEqual(gate.admitted, 0)
            self.assertEqual((await client.post('/upload')).status_code, 200)

    async def test_queue_wait_timeout(self):
        release = asyncio.Event()

        async def service(scope, receive, send):
            await release.wait()
            await JSONResponse({})(scope, receive, send)

        gate = JobAdmission(service, active=1, queued=1, wait_seconds=0.02)
        async with AsyncClient(transport=ASGITransport(app=gate), base_url='http://test') as client:
            first = asyncio.create_task(client.post('/upload'))
            while gate.admitted != 1:
                await asyncio.sleep(0)
            self.assertEqual((await client.post('/upload')).status_code, 503)
            release.set()
            await first
            self.assertEqual(gate.admitted, 0)


class LoggingTests(unittest.IsolatedAsyncioTestCase):
    async def test_correlation_and_sensitive_fields_excluded(self):
        async def service(scope, receive, send):
            await JSONResponse({})(scope, receive, send)
        identifier = 'a' * 32
        with self.assertLogs('digiforms.request', level='INFO') as logs:
            async with AsyncClient(transport=ASGITransport(app=RequestLogging(service)), base_url='http://test') as client:
                response = await client.post('/upload?token=secret-query', content=b'secret-document',
                                            headers={'Authorization': 'Bearer secret-token', 'X-Request-ID': identifier})
        self.assertEqual(response.headers['X-Request-ID'], identifier)
        formatted = JsonFormatter().format(logs.records[0])
        self.assertEqual(json.loads(formatted)["request_id"], identifier)
        self.assertEqual(logs.records[0].status, 200)
        for secret in ('secret-query', 'secret-token', 'secret-document'):
            self.assertNotIn(secret, formatted)
        self.assertEqual(json.loads(formatted)['event'], 'request_completed')

    async def test_untrusted_request_id_replaced(self):
        async def service(scope, receive, send):
            await JSONResponse({})(scope, receive, send)
        async with AsyncClient(transport=ASGITransport(app=RequestLogging(service)), base_url='http://test') as client:
            response = await client.get('/health', headers={'X-Request-ID': 'untrusted text'})
        self.assertRegex(response.headers['X-Request-ID'], r'^[0-9a-f]{32}$')


if __name__ == '__main__':
    unittest.main()
