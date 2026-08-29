"""Image generation for the live artifact.

The conductor can reach for a visual; this turns that into a file on disk and a
URL the composer can embed. Free-tier image quota is tiny and pooled across
image models, so the chain tries each model and — when every one is exhausted —
falls back to a generated brand-styled SVG. The page gets a real visual either
way, and the tool summary says honestly which one it got.
"""
import base64
import hashlib
import logging
import math
import random
import uuid
from pathlib import Path

from google import genai

from .config import settings

log = logging.getLogger(__name__)

MEDIA_DIR = Path(__file__).resolve().parent.parent / ".media"
MEDIA_DIR.mkdir(exist_ok=True)

#: Quota is per model, so siblings of the configured model are worth trying.
_SIBLINGS = ["gemini-3.1-flash-lite-image", "gemini-2.5-flash-image"]

#: Keeps generated art on the artifact's palette instead of stock-photo land.
_ART_DIRECTION = (
    "Refined editorial illustration for a premium presentation slide. "
    "Deep near-black background (#0b0d12), indigo accent light (#7c86ff), "
    "subtle film grain, generous negative space. Absolutely no text, no words, "
    "no letters, no logos."
)


def _chain() -> list[str]:
    chain = [settings().image_model, *_SIBLINGS]
    seen: set[str] = set()
    return [m for m in chain if m and not (m in seen or seen.add(m))]


def generate(prompt: str) -> tuple[str, bool]:
    """Return (public_url, simulated). Never raises — a dead image API must not
    stall a live session, so exhaustion degrades to the SVG stand-in."""
    for model in _chain():
        try:
            s = settings()
            if s.google_genai_use_vertexai:
                client = genai.Client(vertexai=True, project=s.google_cloud_project,
                                      location=s.google_cloud_location)
            else:
                client = genai.Client(api_key=s.google_api_key)
            resp = client.models.generate_content(
                model=model, contents=f"{prompt}. {_ART_DIRECTION}"
            )
            for part in resp.candidates[0].content.parts or []:
                blob = getattr(part, "inline_data", None)
                if blob is not None and blob.data:
                    data = blob.data if isinstance(blob.data, bytes) else base64.b64decode(blob.data)
                    mime = (getattr(blob, "mime_type", "") or "image/png").lower()
                    ext = {"image/jpeg": "jpg", "image/webp": "webp"}.get(mime, "png")
                    name = f"{uuid.uuid4().hex[:12]}.{ext}"
                    (MEDIA_DIR / name).write_bytes(data)
                    log.info("image via %s (%d KB %s)", model, len(data) // 1024, mime)
                    return _url(name), False
        except Exception as exc:  # noqa: BLE001 - any failure means try the next model
            log.warning("image model %s unavailable: %s", model, str(exc)[:160])
    return _fallback_svg(prompt), True


def _url(name: str) -> str:
    return f"{settings().public_base_url}/media/{name}"


def _fallback_svg(prompt: str) -> str:
    """Deterministic abstract art in the product palette, seeded by the prompt.

    This is a stand-in, not a fake: it is labelled simulated by the caller and
    exists so the demo never shows a broken image beat when quota is gone.
    """
    rng = random.Random(hashlib.md5(prompt.encode()).hexdigest())
    w, h = 1600, 900
    strokes = []
    for i in range(4):
        y0 = rng.randint(int(h * 0.25), int(h * 0.85))
        amp = rng.randint(60, 200)
        x1, x2 = rng.randint(-200, 100), rng.randint(w - 100, w + 200)
        mid = rng.randint(int(w * 0.3), int(w * 0.7))
        op = 0.9 - i * 0.16
        sw = 4 + i * 3
        if i == 0:
            strokes.append(
                f'<path d="M {x1} {y0} Q {mid} {y0 - amp}, {x2} {y0 - 40}" '
                f'stroke="url(#g)" stroke-width="26" fill="none" opacity="0.35" filter="url(#blur1)"/>'
            )
        strokes.append(
            f'<path d="M {x1} {y0} Q {mid} {y0 - amp}, {x2} {y0 - rng.randint(-80, 120)}" '
            f'stroke="url(#g)" stroke-width="{sw}" fill="none" opacity="{op:.2f}" filter="url(#blur{i % 2})"/>'
        )
    dots = "".join(
        f'<circle cx="{rng.randint(100, w - 100)}" cy="{rng.randint(80, h - 80)}" '
        f'r="{rng.choice([2, 2, 3, 5])}" fill="#7c86ff" opacity="{rng.uniform(0.25, 0.8):.2f}"/>'
        for _ in range(14)
    )
    glow_x, glow_y = rng.randint(300, w - 300), rng.randint(200, h - 200)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">
<defs>
  <radialGradient id="bg" cx="{glow_x / w:.2f}" cy="{glow_y / h:.2f}" r="1.1">
    <stop offset="0" stop-color="#171b2b"/><stop offset="0.55" stop-color="#0d0f16"/><stop offset="1" stop-color="#090a0f"/>
  </radialGradient>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7c86ff" stop-opacity="0.14"/><stop offset="0.35" stop-color="#7c86ff" stop-opacity="0.85"/>
    <stop offset="0.85" stop-color="#a5adff"/><stop offset="1" stop-color="#dfe2ff"/>
  </linearGradient>
  <filter id="blur0"><feGaussianBlur stdDeviation="1.2"/></filter>
  <filter id="blur1"><feGaussianBlur stdDeviation="11"/></filter>
</defs>
<rect width="{w}" height="{h}" fill="url(#bg)"/>
{"".join(strokes)}
{dots}
</svg>'''
    name = f"{uuid.uuid4().hex[:12]}.svg"
    (MEDIA_DIR / name).write_text(svg)
    return _url(name)
