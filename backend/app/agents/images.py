"""Nano Banana slide imagery (build-time only) with the stale-response guard.

Flow: caller requests an image for (slide, image_rev). We generate, upload to GCS,
then write image_url back to the slide ONLY if its image_rev is unchanged - an edit
made while the image was generating bumps image_rev and the response is dropped.
"""
import uuid

from google import genai
from google.cloud import storage
from google.genai import types as gt

from ..config import settings
from ..firestore import get_version, save_version

_client: genai.Client | None = None



def _signed_or_direct_url(blob) -> str:
    """Signed URL in prod (service account can sign); authenticated URL fallback locally."""
    try:
        return blob.generate_signed_url(version="v4", expiration=7 * 24 * 3600)
    except Exception:
        return f"https://storage.cloud.google.com/{blob.bucket.name}/{blob.name}"

def client() -> genai.Client:
    global _client
    if _client is None:
        s = settings()
        if s.google_genai_use_vertexai:
            _client = genai.Client(vertexai=True, project=s.google_cloud_project,
                                   location=s.google_cloud_location)
        else:
            _client = genai.Client(api_key=s.google_api_key)
    return _client


def _upload_png(data: bytes) -> str:
    s = settings()
    bucket = storage.Client(project=s.google_cloud_project or None).bucket(s.gcs_bucket)
    blob = bucket.blob(f"slide-images/{uuid.uuid4().hex}.png")
    blob.upload_from_string(data, content_type="image/png")
    # Bucket should have uniform access with allUsers viewer OFF; we use signed URLs.
    return _signed_or_direct_url(blob)


async def generate_slide_image(pid: str, version: int, slide_id: str, image_rev: int) -> str | None:
    """Generate + attach an image; returns the URL or None if skipped/stale."""
    deck = get_version(pid, version)
    if deck is None or deck.locked:
        return None
    slide = next((sl for sl in deck.slides if sl.id == slide_id), None)
    if slide is None or not slide.image_prompt or slide.image_rev != image_rev:
        return None

    resp = client().models.generate_content(
        model=settings().image_model,
        contents=f"Presentation background, subtle, no text overlays: {slide.image_prompt}",
        config=gt.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    png: bytes | None = None
    candidates = resp.candidates or []
    parts = (candidates[0].content.parts or []) if candidates and candidates[0].content else []
    for part in parts:
        if part.inline_data and part.inline_data.data:
            png = part.inline_data.data
            break
    if png is None:
        return None

    url = _upload_png(png)

    # Re-read and re-check the guard before committing (edit may have landed meanwhile).
    deck = get_version(pid, version)
    if deck is None or deck.locked:
        return None
    slide = next((sl for sl in deck.slides if sl.id == slide_id), None)
    if slide is None or slide.image_rev != image_rev:
        return None          # stale: discard silently
    slide.image_url = url
    save_version(pid, deck)
    return url
