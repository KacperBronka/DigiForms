"""Local Tesseract OCR. Images travel over stdin; language data ships in Docker."""
import csv
import io
import os
import re
import subprocess
from types import SimpleNamespace


class TesseractOCR:
    def __init__(self, config):
        self.config = config
        self.language = {'pl': 'pol', 'en': 'eng'}.get(config.ocr_lang, config.ocr_lang)
        if not re.fullmatch(r'[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*', self.language):
            raise ValueError('Invalid OCR_LANG')
        result = subprocess.run(self.command('--list-langs'), capture_output=True, text=True, check=True, timeout=15)
        available = set(result.stdout.splitlines()[1:])
        if not set(self.language.split('+')) <= available:
            raise ValueError('OCR language data is missing. Install the language package or set OCR_MODELS_DIR.')

    def command(self, *args):
        cmd = ['tesseract', *args]
        if self.config.ocr_models_dir:
            cmd.extend(['--tessdata-dir', self.config.ocr_models_dir])
        return cmd

    def __call__(self, image):
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        command = self.command('stdin', 'stdout', '-l', self.language, '--dpi', str(self.config.ocr_dpi), '--psm', '3', 'tsv')
        result = subprocess.run(command, input=buffer.getvalue(), capture_output=True, check=True,
                                timeout=self.config.ocr_timeout_seconds,
                                env={**os.environ, 'OMP_THREAD_LIMIT': str(self.config.ocr_threads)})
        # Keep the previous OCR JSON contract: text lines, bounding boxes, scores.
        groups = {}
        for word in csv.DictReader(io.StringIO(result.stdout.decode('utf-8')), delimiter='\t', quoting=csv.QUOTE_NONE):
            text = word.get('text', '').strip()
            if word.get('level') != '5' or not text:
                continue
            key = tuple(word[k] for k in ('page_num', 'block_num', 'par_num', 'line_num'))
            x, y, width, height = (int(word[k]) for k in ('left', 'top', 'width', 'height'))
            entry = groups.setdefault(key, {'texts': [], 'boxes': [], 'scores': []})
            entry['texts'].append(text)
            entry['boxes'].append((x, y, x + width, y + height))
            entry['scores'].append(max(0, min(100, float(word['conf']))) / 100)
        texts, boxes, scores = [], [], []
        for entry in groups.values():
            x1 = min(b[0] for b in entry['boxes']); y1 = min(b[1] for b in entry['boxes'])
            x2 = max(b[2] for b in entry['boxes']); y2 = max(b[3] for b in entry['boxes'])
            texts.append(' '.join(entry['texts']))
            boxes.append([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
            scores.append(sum(entry['scores']) / len(entry['scores']))
        return SimpleNamespace(txts=texts, boxes=boxes, scores=scores)


def create_ocr(config):
    return TesseractOCR(config)
