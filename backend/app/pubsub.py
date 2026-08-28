"""Publish job envelopes to Pub/Sub; the worker service receives them via push subscription."""
import json

from google.cloud import pubsub_v1  # type: ignore[attr-defined]

from .config import settings
from .firestore import save_job
from .schemas import Job


def _publisher() -> "pubsub_v1.PublisherClient":
    # Cached on the function object to keep one client per process.
    client = getattr(_publisher, "_client", None)
    if client is None:
        client = pubsub_v1.PublisherClient()
        _publisher._client = client  # type: ignore[attr-defined]
    return client


def _deliver_locally(job_id: str, worker_url: str) -> None:
    """Local Pub/Sub stand-in: POST the push envelope straight at the worker.

    Fire-and-forget on a daemon thread so a slow or absent worker never blocks the
    request. Delivery failures are recorded on the job doc, same as a dead letter.
    """
    import base64
    import threading
    import urllib.error
    import urllib.request

    envelope = {"message": {"data": base64.b64encode(
        json.dumps({"job_id": job_id}).encode()).decode()}}

    def _post() -> None:
        req = urllib.request.Request(
            worker_url.rstrip("/") + "/pubsub",
            data=json.dumps(envelope).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=300).read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            from .firestore import get_job
            existing = get_job(job_id)
            if existing is not None:
                existing.status = "error"
                existing.error = f"local delivery failed: {exc}"
                save_job(existing)

    threading.Thread(target=_post, daemon=True).start()


def enqueue(job: Job) -> str:
    """Persist the job doc (idempotency anchor) then publish. Returns job id."""
    save_job(job)
    s = settings()
    if s.local_store:
        if s.worker_url:
            _deliver_locally(job.id, s.worker_url)
        return job.id
    client = _publisher()
    topic = client.topic_path(s.google_cloud_project, s.pubsub_topic)
    future = client.publish(topic, json.dumps({"job_id": job.id}).encode())
    future.result(timeout=30)
    return job.id
