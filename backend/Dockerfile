# Production image of the backend API (FastAPI + WeasyPrint for the proposal PDF).

# --- build: install the runtime packages into a virtualenv ---
FROM python:3.12-slim AS build
WORKDIR /build
COPY requirements.txt ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# --- runtime: only the virtualenv, the app and the system libraries it needs ---
FROM python:3.12-slim
# WeasyPrint (proposal PDF) needs Pango and HarfBuzz; fonts-noto-core has the Arabic fonts for Arabic proposals.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home app

COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY --chown=app:app app ./app
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic

ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://localhost:8000/api/v1/health/ready').status != 200)"
# Bring the database up to date, then serve.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
