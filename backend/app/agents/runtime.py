"""Small wrapper around Google ADK: run an LlmAgent for one request/response.

We keep conversation history in Firestore (build session events), not in ADK's
session service, so every call reconstructs the context it needs. That keeps the
Cloud Run services stateless and horizontally scalable.
"""
import asyncio
import json
import re
from typing import Type, TypeVar

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types as gt
from pydantic import BaseModel

from ..config import settings

T = TypeVar("T", bound=BaseModel)


def make_agent(name: str, instruction: str, output_schema: Type[BaseModel] | None = None,
               thinking: str = "low") -> LlmAgent:
    """Build a one-shot agent.

    `thinking` is the knob that decides whether a turn feels live. "low" buys
    judgement — the conductor needs it to weigh a conflict. "off" is for agents
    that render rather than reason: the composer's job is to write HTML it has
    already been told the shape of, and letting it deliberate doubled the time a
    page took to appear for no gain in the page.
    """
    kwargs: dict = dict(
        name=name,
        model=settings().gemini_model,
        instruction=instruction,
    )
    if output_schema is not None:
        kwargs["output_schema"] = output_schema
        kwargs["disallow_transfer_to_parent"] = True
        kwargs["disallow_transfer_to_peers"] = True
    agent = LlmAgent(**kwargs)
    _THINKING[agent.name] = thinking
    return agent


#: Per-agent thinking preference, keyed by agent name (LlmAgent has no slot for
#: it and the value has to survive into the per-model retry loop).
_THINKING: dict[str, str] = {}


async def run_agent_text(agent: LlmAgent, uid: str, prompt: str, attempts: int = 3) -> str:
    """One-shot run; returns the final text response.

    Retries transient upstream failures. Gemini returns 503 under load often
    enough that a live session would visibly break without this.
    """
    models = _model_chain()
    last: Exception | None = None

    for index, model in enumerate(models):
        agent.model = model
        agent.generate_content_config = _gen_config_for(
            model, _THINKING.get(agent.name, settings().gemini_thinking_level)
        )
        has_fallback = index < len(models) - 1

        for attempt in range(attempts):
            try:
                return await _run_once(agent, uid, prompt)
            except Exception as exc:  # noqa: BLE001 - retry policy is by status
                last = exc
                # A per-day quota does not recover by waiting, so move to the next
                # model immediately rather than burning the retry budget.
                if _is_quota(exc) and has_fallback:
                    break
                if not _is_transient(exc):
                    raise
                if attempt == attempts - 1:
                    if has_fallback:
                        break
                    raise
                await asyncio.sleep(_retry_after(exc, attempt))

    assert last is not None
    raise last


def _gen_config_for(model: str, mode: str) -> gt.GenerateContentConfig | None:
    """Turn a thinking preference into a config this model will accept.

    Measured on the composer's real prompt: unbounded thinking 23s, "low" 14s,
    off 7.4s — for output that was, if anything, better. Reasoning is worth
    paying for in the conductor and worth nothing in the renderer.
    """
    if mode == "off":
        return gt.GenerateContentConfig(
            thinking_config=gt.ThinkingConfig(thinking_budget=0)
        )
    if mode and model.startswith("gemini-3"):
        return gt.GenerateContentConfig(
            thinking_config=gt.ThinkingConfig(thinking_level=mode)
        )
    return None


def _model_chain() -> list[str]:
    """Primary model first, then any configured fallbacks, de-duplicated."""
    s = settings()
    chain = [s.gemini_model, *[m.strip() for m in s.gemini_fallback_models.split(",")]]
    seen: set[str] = set()
    return [m for m in chain if m and not (m in seen or seen.add(m))]


def _is_quota(exc: Exception) -> bool:
    text = str(exc)
    return "RESOURCE_EXHAUSTED" in text or "429" in text


def _is_transient(exc: Exception) -> bool:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code in (429, 500, 502, 503, 504):
        return True
    text = str(exc)
    return "503" in text or "UNAVAILABLE" in text or "RESOURCE_EXHAUSTED" in text


def _retry_after(exc: Exception, attempt: int) -> float:
    """Honour the server's own backoff hint when it gives one.

    A 429 from the free tier says "Please retry in 8.6s"; exponential backoff
    from a sub-second base just burns the remaining quota. Capped so a wedged
    request cannot stall a live session indefinitely.
    """
    match = re.search(r"retry in ([\d.]+)s", str(exc)) or re.search(
        r"'retryDelay':\s*'(\d+)s'", str(exc)
    )
    if match:
        return min(float(match.group(1)) + 0.5, 30.0)
    return min(1.5 * (2**attempt), 30.0)


async def _run_once(agent: LlmAgent, uid: str, prompt: str) -> str:
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
