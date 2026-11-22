"""API regression tests; no OCR downloads or Eden AI requests are made."""
import asyncio
from contextlib import contextmanager
from threading import Event
from types import SimpleNamespace
import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from httpx import ASGITransport, AsyncClient

import main


class UploadTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.paths = []
        self.ocr = Mock()
        self.ocr.predict.return_value = [SimpleNamespace(json={"res": {
            "rec_texts": ["Wniosek"], "rec_boxes": [[0, 0, 10, 10]], "rec_scores": [0.99],
        }})]

        @contextmanager
        def prepare(path):
            self.paths.append(path)
            if path.read_bytes() == b"invalid":
                raise ValueError("Invalid PDF")
            yield path

        for name, value in [("API_KEY", "test-key"), ("prepare_pdf", prepare)]:
            patcher = patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        loader = patch.object(main, "load_ocr", return_value=self.ocr)
        self.loader = loader.start()
        self.addCleanup(loader.stop)
        stream = patch.object(main, "stream_eden_ai", return_value={"title": "Wniosek"})
        self.stream = stream.start()
        self.addCleanup(stream.stop)
        await self.enterAsyncContext(main.lifespan(main.app))
        self.client = await self.enterAsyncContext(AsyncClient(
            transport=ASGITransport(app=main.app), base_url="http://test",
        ))

    async def upload(self, content=b"document", filename="form.pdf"):
        return await self.client.post("/upload", files={"file": (filename, content)})

    async def test_startup_model_reused_and_request_files_cleaned(self):
        self.loader.assert_called_once_with()
        for _ in range(2):
            response = await self.upload(filename="../../form.PDF")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"title": "Wniosek"})
        self.loader.assert_called_once_with()
        self.assertEqual(self.ocr.predict.call_count, 2)
        self.assertNotEqual(self.paths[0].parent, self.paths[1].parent)
        for path in self.paths:
            self.assertEqual(path.name, "upload.pdf")
            self.assertFalse(path.parent.exists())
        ocr_data = self.stream.call_args.args[0]
        self.assertEqual(ocr_data["pages"][0]["lines"][0]["text"], "Wniosek")

    async def test_bad_uploads_rejected_before_ocr(self):
        self.assertEqual((await self.client.post("/upload")).status_code, 422)
        self.assertEqual((await self.upload(filename="form.exe")).status_code, 415)
        self.assertEqual((await self.upload(content=b"")).status_code, 400)
        self.assertEqual((await self.upload(content=b"invalid")).status_code, 400)
        with patch.object(main, "MAX_UPLOAD_BYTES", 3):
            self.assertEqual((await self.upload(content=b"1234")).status_code, 413)
        self.ocr.predict.assert_not_called()
        self.stream.assert_not_called()

    async def test_missing_key(self):
        with patch.object(main, "API_KEY", ""):
            self.assertEqual((await self.upload()).status_code, 503)
        self.ocr.predict.assert_not_called()

    async def test_upstream_failure_is_502_and_cleans_files(self):
        self.stream.side_effect = RuntimeError("upstream failure")
        with self.assertLogs(main.logger, level="ERROR"):
            self.assertEqual((await self.upload()).status_code, 502)
        self.assertFalse(self.paths[0].parent.exists())

    async def test_health_responds_while_processing(self):
        started, release = Event(), Event()

        def wait_for_release(*args):
            started.set()
            if not release.wait(5):
                raise RuntimeError("Test timed out")
            return {"title": "Wniosek"}

        self.stream.side_effect = wait_for_release
        pending = asyncio.create_task(self.upload())
        try:
            for _ in range(500):
                if started.is_set():
                    break
                await asyncio.sleep(0.01)
            self.assertTrue(started.is_set())
            response = await self.client.get("/health")
            self.assertEqual(response.json(), {"status": "ready"})
        finally:
            release.set()
        self.assertEqual((await asyncio.wait_for(pending, timeout=5)).status_code, 200)



class EdenStreamTests(unittest.TestCase):
    def run_stream(self, lines, content_type="text/event-stream", body=""):
        response = Mock(ok=True, headers={"Content-Type": content_type}, text=body)
        response.iter_lines.return_value = iter(lines)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with TemporaryDirectory() as tmp, patch.object(main, "API_KEY", "test"), \
             patch.object(main, "read_guidelines", return_value=("", "", {})), \
             patch.object(main, "pdf_to_images", return_value=[]), \
             patch.object(main.requests, "post", return_value=response):
            return main.stream_eden_ai({}, Path("form.pdf"), Path(tmp))

    def test_stream_content(self):
        event = {"choices": [{"delta": {"content": '{"title":"Wniosek"}'}}]}
        self.assertEqual(self.run_stream(["data: " + json.dumps(event), "", "data: [DONE]"]),
                         {"title": "Wniosek"})

    def test_empty_stream_reports_finish_reason(self):
        with self.assertRaisesRegex(ValueError, "content_filter"):
            self.run_stream(['data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}',
                             '', 'data: [DONE]'])

    def test_stream_error_event(self):
        with self.assertRaisesRegex(RuntimeError, "provider unavailable"):
            self.run_stream(['event: error', 'data: {"message":"provider unavailable"}'])

    def test_non_stream_response_reports_body(self):
        with self.assertRaisesRegex(RuntimeError, "invalid model"):
            self.run_stream([], "application/json", '{"error":"invalid model"}')

    def test_malformed_event_is_not_silently_discarded(self):
        with self.assertRaisesRegex(RuntimeError, "JSON"):
            self.run_stream(['data: not-json'])


if __name__ == "__main__":
    unittest.main()
