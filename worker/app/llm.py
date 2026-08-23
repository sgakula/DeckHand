"""Worker-side Gemini helper: structured JSON calls via the GenAI SDK.

(The API service uses ADK agents; the worker's steps are single-shot generations,
so the plain SDK with response_schema is the simpler, more robust fit here.)
"""
from typing import Type, TypeVar

from google import genai
from google.genai import types as gt
from pydantic import BaseModel

from .config import settings

T = TypeVar("T", bound=BaseModel)

_client: genai.Client | None = None


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


def generate_json(instruction: str, prompt: str, schema: Type[T]) -> T:
    resp = client().models.generate_content(
        model=settings().gemini_model,
        contents=prompt,
        config=gt.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=schema,
        ),
    )
    parsed = resp.parsed
    if isinstance(parsed, schema):
        return parsed
    return schema.model_validate_json(resp.text or "{}")


def generate_text(instruction: str, prompt: str) -> str:
    resp = client().models.generate_content(
        model=settings().gemini_model,
        contents=prompt,
        config=gt.GenerateContentConfig(system_instruction=instruction),
    )
    return resp.text or ""
