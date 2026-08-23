"""Step e (Phase 3) + branch jobs (Phase 5): suggested edits and agent-driven variants."""
from pydantic import BaseModel

from .llm import generate_json
from .schemas import DeckVersion, Presentation, Slide, Talk


class SuggestedEdit(BaseModel):
    slide_id: str = ""            # empty = deck-level suggestion
    suggestion: str
    reason: str                   # grounded in a note: skipped / pushback / question


class SuggestedEdits(BaseModel):
    edits: list[SuggestedEdit] = []


SUGGEST_INSTRUCTION = """You propose edits for the NEXT version of a presentation deck,
based only on evidence from the talk notes: slides skipped or rushed, claims that drew
objections, recurring or unanswered audience questions, and number mismatches.
3-6 suggestions max, each tied to its evidence in `reason`.
Respond with JSON matching SuggestedEdits."""


def suggest_next_version_edits(deck: DeckVersion, talk: Talk) -> SuggestedEdits:
    prompt = (
        f"DECK:\n{[{'id': s.id, 'title': s.title} for s in deck.slides]}\n\n"
        f"TALK NOTES:\n{[n.model_dump() for n in talk.notes]}"
    )
    return generate_json(SUGGEST_INSTRUCTION, prompt, SuggestedEdits)


class BranchDeck(BaseModel):
    slides: list[Slide] = []
    branch_label: str = ""


BRANCH_INSTRUCTION = """You regenerate a presentation deck as a VARIANT for a different
audience/length/tone, per the instruction. Keep facts and their source_ref values from
the original slides; never invent numbers. Reuse slide ids where a slide carries over,
new ids ('b-1', 'b-2', ...) for new slides. Set a short branch_label.
Respond with JSON matching BranchDeck (Slide schema as in the input)."""


def build_branch(p: Presentation, src: DeckVersion, instruction: str) -> BranchDeck:
    prompt = (
        f"INSTRUCTION:\n{instruction}\n\n"
        f"BRIEF:\n{p.brief.model_dump_json()}\n\n"
        f"ORIGINAL SLIDES:\n{[s.model_dump() for s in src.slides]}"
    )
    result = generate_json(BRANCH_INSTRUCTION, prompt, BranchDeck)
    for i, s in enumerate(result.slides):
        s.order = i
        s.approved = False
        s.image_rev = 0
        s.image_url = ""
    return result
