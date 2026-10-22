FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    HOME=/home/worker

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      ghostscript \
      libgl1 \
      libglib2.0-0 \
      pngquant \
      qpdf \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-fra \
      unpaper \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /worker
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir paddlepaddle==3.2.0 \
      --index-url https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY processor.py worker.py ./
RUN useradd --uid 1000 --create-home --home-dir /home/worker worker \
    && mkdir -p /home/worker/.paddlex \
    && chown -R worker:worker /worker /home/worker

USER worker
CMD ["python", "worker.py"]
