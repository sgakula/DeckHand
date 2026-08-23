"""Deckhand worker service (Cloud Run): Pub/Sub push endpoint for background jobs."""
import base64
import json

from fastapi import FastAPI, HTTPException, Request

from .firestore import get_job
from .pipeline import run_job

app = FastAPI(title="Deckhand Worker", version="0.1.0")


@app.post("/pubsub")
async def pubsub_push(request: Request):
    """Pub/Sub push delivery. Non-2xx -> redelivery; idempotent steps make that safe."""
    envelope = await request.json()
    msg = envelope.get("message", {})
    try:
        data = json.loads(base64.b64decode(msg.get("data", "")).decode())
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "bad message")  # drop malformed messages (no retry loop)

    job = get_job(data.get("job_id", ""))
    if job is None:
        raise HTTPException(400, "unknown job")   # 400 = no point redelivering
    if job.status == "done":
        return {"ok": True, "skipped": "already done"}

    run_job(job)   # raises on failure -> 500 -> Pub/Sub redelivers, steps_done skips work
    return {"ok": True}


@app.get("/healthz")
async def healthz():
    return {"ok": True}
