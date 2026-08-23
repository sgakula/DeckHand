"""Planner agent (Phase 1, step 6): propose an outline from brief + facts + preferences."""
from ..schemas import Outline, PresentationBrief, PreferenceProfile, SourceFact
from .runtime import make_agent, run_agent_json

INSTRUCTION = """You design presentation outlines.
Given the brief, extracted facts (with sources), and the presenter's learned preferences,
propose 4-8 ordered sections. Each section needs: id (short slug), title, key_claim
(one sentence the section must land), supporting_facts chosen ONLY from the provided
facts (copy them verbatim including source fields), est_minutes, and order.
The est_minutes must sum to roughly the brief's duration_minutes.
Apply structure preferences (e.g. "open with a story") and pre-empt recurring audience
questions with a dedicated section when relevant.
Respond ONLY with JSON matching the Outline schema (approved must be false).
"""


async def propose_outline(
    uid: str,
    brief: PresentationBrief,
    facts: list[SourceFact],
    profile: PreferenceProfile,
) -> Outline:
    agent = make_agent("planner", INSTRUCTION, output_schema=Outline)
    prompt = (
        f"BRIEF:\n{brief.model_dump_json()}\n\n"
        f"FACTS:\n{[f.model_dump() for f in facts]}\n\n"
        f"PREFERENCES:\n{profile.model_dump_json()}"
    )
    outline = await run_agent_json(agent, uid, prompt, Outline)
    outline.approved = False
    for i, s in enumerate(outline.sections):
        s.order = i
    return outline
