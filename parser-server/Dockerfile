FROM python:3.14.0-slim-trixie AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/home/app \
    XDG_CACHE_HOME=/tmp/cache \
    PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /run/worker && chown app:app /run/worker && chmod 700 /run/worker
WORKDIR /app
COPY requirements-api.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements-api.txt
COPY logging_config.py settings.py upload_validation.py job_control.py job_runner.py ./

FROM base AS worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libgomp1 libreoffice-writer libreoffice-calc fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
RUN python -c "import cv2; import onnxruntime as ort; assert 'CPUExecutionProvider' in ort.get_available_providers()"
COPY worker.py document_converter.py ocr_engine.py ./
USER app
# Populate model files at build time: runtime has no network and no credentials.
RUN python -c "from ocr_engine import load_ocr; load_ocr()"
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
CMD ["python", "worker.py"]

FROM base AS api
COPY main.py AGENTS.md GuideLines.md guidelines.json ./
USER app
EXPOSE 3000
CMD ["python", "main.py"]
