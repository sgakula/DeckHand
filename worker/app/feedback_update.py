"""Phase 4: merge the three feedback streams into the preference profile."""
from pydantic import BaseModel

from .llm import generate_json
from .schemas import PreferenceProfile, Talk


class ProfileDelta(BaseModel):
    profile: PreferenceProfile


INSTRUCTION = """You maintain a presenter's preference profile for a slide-building agent.
Merge the CURRENT PROFILE with the new evidence:
- explicit feedback items (rating + note per slide),
- talk-time evidence (notes: skipped/rushed slides, recurring questions),
- build-time edit history (what the user changed by hand).
Update structure_prefs / style_prefs / density_prefs / recurring_questions /
known_answers. Keep entries short and imperative ("open with a story"). Merge
duplicates; drop contradictions in favor of the NEWEST evidence. Keep at most 10
entries per list. Respond with JSON: {"profile": PreferenceProfile}."""


def merge_feedback(
    current: PreferenceProfile,
    feedback_items: list[dict],
    talk: Talk | None,
    build_edits: list[dict],
) -> PreferenceProfile:
    prompt = (
        f"CURRENT PROFILE:\n{current.model_dump_json()}\n\n"
        f"EXPLICIT FEEDBACK:\n{feedback_items}\n\n"
        f"TALK NOTES:\n{[n.model_dump() for n in talk.notes] if talk else []}\n\n"
        f"BUILD-TIME EDITS:\n{build_edits[:50]}"
    )
    return generate_json(INSTRUCTION, prompt, ProfileDelta).profile
