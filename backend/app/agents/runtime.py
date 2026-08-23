"""Small wrapper around Google ADK: run an LlmAgent for one request/response.

We keep conversation history in Firestore (build session events), not in ADK's
session service, so every call reconstructs the context it needs. That keeps the
Cloud Run services stateless and horizontally scalable.
"""
import json
from typing import Type, TypeVar

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types as gt
from pydantic import BaseModel

from ..config import settings

T = TypeVar("T", bound=BaseModel)


def make_agent(name: str, instruction: str, output_schema: Type[BaseModel] | None = None) -> LlmAgent:
    kwargs: dict = dict(
        name=name,
        model=settings().gemini_model,
        instruction=instruction,
    )
    if output_schema is not None:
        kwargs["output_schema"] = output_schema
        kwargs["disallow_transfer_to_parent"] = True
        kwargs["disallow_transfer_to_peers"] = True
    return LlmAgent(**kwargs)


async def run_agent_text(agent: LlmAgent, uid: str, prompt: str) -> str:
    """One-shot run; returns the final text response."""
    runner = InMemoryRunner(agent=agent)
    session = await runner.session_service.create_session(
        app_name=runner.app_name, user_id=uid
    )
    final = ""
    async for event in runner.run_async(
        user_id=uid,
        session_id=session.id,
        new_message=gt.Content(role="user", parts=[gt.Part(text=prompt)]),
    ):
        if event.content and event.content.parts:
            texts = [p.text for p in event.content.parts if p.text]
            if texts and event.is_final_response():
                final = "\n".join(texts)
    return final


async def run_agent_json(agent: LlmAgent, uid: str, prompt: str, schema: Type[T]) -> T:
    """One-shot run for agents built with output_schema; parses into the pydantic model."""
    raw = await run_agent_text(agent, uid, prompt)
    # ADK emits the schema-validated JSON as text; be forgiving about fences.
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
    return schema(**json.loads(raw))
