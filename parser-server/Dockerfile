FROM python:3.13-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgl1 \
        libreoffice-writer \
        libreoffice-calc \
        fonts-dejavu-core \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
RUN python -c "import cv2; import onnxruntime as ort; assert 'CPUExecutionProvider' in ort.get_available_providers()"

COPY . .

CMD ["python", "main.py"]
