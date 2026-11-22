FROM python:3.14.10-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/home/app \
    XDG_CACHE_HOME=/home/app/.cache \
    PORT=3000

# Debian Slim provides LibreOffice and the local Polish/English OCR models.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-pol \
        tesseract-ocr-eng \
        libreoffice-writer \
        libreoffice-calc \
        fonts-dejavu-core \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
RUN python -c "import onnxruntime; assert (1, 21) <= tuple(map(int, onnxruntime.__version__.split('.')[:2])) < (1, 27); print('ONNX Runtime', onnxruntime.__version__)" \
    && tesseract --list-langs

# Explicit allowlist: no .env, uploads, tests or developer credentials in the image.
COPY main.py settings.py auth.py pdf_tools.py ocr_engine.py document_converter.py upload_validation.py guidelines.json GuideLines.md AGENTS.md ./

USER app:app
EXPOSE 3000
CMD ["python", "main.py"]
