FROM python:3.13.18-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/home/app \
    XDG_CACHE_HOME=/home/app/.cache \
    PORT=3000

# OCR wheels require glibc; Debian Slim is intentional instead of Alpine/musl.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgl1 \
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
RUN python -c "import cv2; import onnxruntime as ort; assert 'CPUExecutionProvider' in ort.get_available_providers()"

# Explicit allowlist: no .env, uploads, tests or developer credentials in the image.
COPY main.py settings.py auth.py document_converter.py upload_validation.py guidelines.json GuideLines.md AGENTS.md ./

USER app:app
EXPOSE 3000
CMD ["python", "main.py"]
