"""Server-side speech-to-text on the main model.

Used two ways: the Live broker's safety net when Gemini Live withholds caption
events, and the workspace's mic path on browsers whose SpeechRecognition is
present but non-functional (Brave strips the backend, so it yields nothing).
"""
import io
import logging
import wave

from google.genai import types as gt

from .agents.images import client as genai_client
from .config import settings

log = logging.getLogger(__name__)


async def transcribe_pcm(pcm: bytes) -> str:
    """Transcribe raw 16 kHz mono PCM16. Returns "" for silence or failure."""
    if len(pcm) < 16000:   # under half a second - nothing to hear
        return ""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm)
    try:
        resp = await genai_client().aio.models.generate_content(
            model=settings().gemini_model,
            contents=[
                gt.Part.from_bytes(data=buf.getvalue(), mime_type="audio/wav"),
                gt.Part(text="Transcribe this audio verbatim. Reply with ONLY the words spoken."),
            ],
            config=gt.GenerateContentConfig(
                thinking_config=gt.ThinkingConfig(thinking_budget=0)),
        )
        text = (resp.text or "").strip()
        # The model answers about pure silence; treat boilerplate as empty.
        if text.lower() in {"", "silence", "(silence)", "[silence]", "no speech detected."}:
            return ""
        return text
    except Exception:  # noqa: BLE001
        log.exception("transcription failed")
        return ""
