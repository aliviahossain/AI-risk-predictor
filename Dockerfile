FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UPLOAD_DIR=/data/uploads \
    PORT=8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gfortran \
        libcurl4-openssl-dev \
        libfontconfig1-dev \
        libfreetype6-dev \
        libharfbuzz-dev \
        libpng-dev \
        libssl-dev \
        libxml2-dev \
        r-base \
        r-base-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && Rscript -e "install.packages('BiocManager', repos='https://cloud.r-project.org'); \
        BiocManager::install(c('GEOquery', 'limma', 'edgeR', 'pheatmap', 'Biobase'), \
        ask=FALSE, update=FALSE, Ncpus=2)"

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/backend /data/uploads \
    && chown -R app:app /app /data

WORKDIR /app/backend
COPY --chown=app:app backend/main.py ./main.py
COPY --chown=app:app backend/routes ./routes
COPY --chown=app:app backend/analysis ./analysis

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
