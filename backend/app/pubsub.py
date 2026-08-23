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


def enqueue(job: Job) -> str:
    """Persist the job doc (idempotency anchor) then publish. Returns job id."""
    save_job(job)
    s = settings()
    client = _publisher()
    topic = client.topic_path(s.google_cloud_project, s.pubsub_topic)
    future = client.publish(topic, json.dumps({"job_id": job.id}).encode())
    future.result(timeout=30)
    return job.id
