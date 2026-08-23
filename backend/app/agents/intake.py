"""Intake agent (Phase 1a): guided interview, one question at a time.

Skips anything already known from the user's preference profile, and marks the
brief complete once it has audience, duration, outcome, and tone.
"""
from pydantic import BaseModel

from ..schemas import PresentationBrief, PreferenceProfile
from .runtime import make_agent, run_agent_json


class IntakeResult(BaseModel):
    reply: str                      # what the agent says next (question or confirmation)
    brief: PresentationBrief        # best-effort brief so far; complete=true when done


INSTRUCTION = """You are the intake agent for a presentation-preparation assistant.
Your job is a short, warm interview. Ask exactly ONE question per turn.
Fields to fill: audience, duration_minutes, desired_outcome (the one decision the
presenter wants from the audience), must_include, must_avoid, tone, attendee_emails.

Rules:
- If the KNOWN PREFERENCES section already answers a question, do not ask it; adopt the answer.
- must_include / must_avoid / attendee_emails are optional; ask once, accept "none".
- When audience, duration_minutes, desired_outcome, and tone are all filled, set
  brief.complete = true and make `reply` a one-sentence summary of the brief plus
  "I'll pull numbers from your connected files and propose an outline."
- Never invent values the user did not give.

Respond ONLY with JSON matching the IntakeResult schema:
{"reply": "...", "brief": {"audience": "...", "duration_minutes": 10, "desired_outcome": "...",
 "must_include": [], "must_avoid": [], "tone": "...", "attendee_emails": [], "complete": false}}
"""


async def intake_turn(
    uid: str,
    history: list[dict],
    user_message: str,
    current_brief: PresentationBrief,
    profile: PreferenceProfile,
) -> IntakeResult:
    agent = make_agent("intake", INSTRUCTION, output_schema=IntakeResult)
    convo = "\n".join(f"{e.get('role', '?')}: {e.get('text', '')}" for e in history[-20:])
    prompt = (
        f"KNOWN PREFERENCES (from past sessions):\n{profile.model_dump_json()}\n\n"
        f"BRIEF SO FAR:\n{current_brief.model_dump_json()}\n\n"
        f"CONVERSATION SO FAR:\n{convo}\n\n"
        f"USER JUST SAID:\n{user_message}"
    )
    return await run_agent_json(agent, uid, prompt, IntakeResult)
