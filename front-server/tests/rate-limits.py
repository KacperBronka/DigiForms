"""Integration checks against nginx. Run: NGINX_BINARY=/path/to/nginx python tests/rate-limits.py"""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{}')

    do_POST = do_GET

    def log_message(self, *_):
        pass


class RateLimits(unittest.TestCase):
    def start_proxy(self, general_rate='100', general_burst='100'):
        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        self.addCleanup(upstream.server_close)
        self.addCleanup(upstream.shutdown)
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            self.port = reservation.getsockname()[1]
        directory = self.enterContext(tempfile.TemporaryDirectory(prefix='digiforms-nginx-'))
        template = (Path(__file__).resolve().parents[1] / 'nginx.conf').read_text()
        values = {'RATE_LIMIT_RPS': general_rate, 'RATE_LIMIT_BURST': general_burst,
                  'UPLOAD_RATE_LIMIT_RPM': '60', 'UPLOAD_RATE_LIMIT_BURST': '1'}
        for key, value in values.items():
            template = template.replace('${' + key + '}', value)
        template = template.replace('listen 3000;', f'listen 127.0.0.1:{self.port};')
        for host in ('app', 'front-server'):
            template = template.replace(f'http://{host}:3000', f'http://127.0.0.1:{upstream.server_port}')
        config = Path(directory) / 'nginx.conf'
        config.write_text(f'''daemon off;
error_log {directory}/error.log;
pid {directory}/nginx.pid;
events {{ worker_connections 64; }}
http {{
    access_log off;
    client_body_temp_path {directory}/body;
    proxy_temp_path {directory}/proxy;
    fastcgi_temp_path {directory}/fastcgi;
    uwsgi_temp_path {directory}/uwsgi;
    scgi_temp_path {directory}/scgi;
{template}
}}
''')
        binary = os.environ.get('NGINX_BINARY', 'nginx')
        subprocess.run([binary, '-t', '-p', directory, '-c', str(config)], check=True, capture_output=True)
        process = subprocess.Popen([binary, '-p', directory, '-c', str(config)], stderr=subprocess.PIPE)

        def stop():
            process.terminate()
            process.communicate(timeout=5)
        self.addCleanup(stop)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if process.poll() is not None:
                self.fail(process.stderr.read().decode())
            try:
                with socket.create_connection(('127.0.0.1', self.port), timeout=0.1):
                    return
            except OSError:
                time.sleep(0.02)
        self.fail('nginx did not start')

    def request(self, path, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            connection.request('POST' if 'upload' in path or 'process-document' in path else 'GET', path, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.getheader('Content-Type'), response.read()
        finally:
            connection.close()

    def test_shared_upload_budget_and_recovery(self):
        self.start_proxy()
        self.assertEqual(self.request('/api/upload')[0], 200)
        self.assertEqual(self.request('/api/process-document')[0], 200)
        status, mime, body = self.request('/api//upload/', {'X-Forwarded-For': '203.0.113.9'})
        self.assertEqual(status, 429)
        self.assertEqual(mime, 'application/json')
        self.assertIn('error', json.loads(body))
        self.assertEqual(self.request('/api/health')[0], 200)
        time.sleep(1.1)
        self.assertEqual(self.request('/api/upload')[0], 200)

    def test_general_budget(self):
        self.start_proxy(general_rate='1', general_burst='1')
        self.assertEqual(self.request('/')[0], 200)
        self.assertEqual(self.request('/kontakt')[0], 200)
        self.assertEqual(self.request('/api/health')[0], 429)


if __name__ == '__main__':
    unittest.main(verbosity=2)
