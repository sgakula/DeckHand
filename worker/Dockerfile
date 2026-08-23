# Build from the REPO ROOT so shared modules can be copied from backend/:
#   docker build -f worker/Dockerfile -t pitchpilot-worker .
FROM python:3.12-slim

WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker/app ./app
# Shared single-source-of-truth modules from the API service:
COPY backend/app/schemas.py    ./app/schemas.py
COPY backend/app/config.py     ./app/config.py
COPY backend/app/firestore.py  ./app/firestore.py
COPY backend/app/google_apis.py ./app/google_apis.py

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
