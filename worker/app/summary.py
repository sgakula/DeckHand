"""Step b (Phase 3): one-page recap from the talk transcript + notes."""
from pydantic import BaseModel

from .llm import generate_json
from .schemas import DeckVersion, Presentation, Talk


class Recap(BaseModel):
    headline: str = ""
    what_was_presented: list[str] = []
    key_numbers: list[str] = []          # each with its source in brackets
    questions_and_answers: list[str] = []
    open_questions: list[str] = []
    commitments: list[str] = []
    divergence_from_deck: list[str] = []


INSTRUCTION = """You write a crisp one-page recap of a presentation for the attendees.
Use ONLY the transcript, structured notes, and deck provided. Keep every bullet under
20 words. key_numbers must cite their source in brackets, e.g. "ARR $1.2M [revenue
sheet B14]". divergence_from_deck lists where the spoken talk differed from slides
(skipped, rushed, changed numbers). Respond with JSON matching the Recap schema."""


def build_recap(p: Presentation, deck: DeckVersion, talk: Talk) -> Recap:
    prompt = (
        f"BRIEF:\n{p.brief.model_dump_json()}\n\n"
        f"DECK SLIDES:\n{[{'id': s.id, 'title': s.title} for s in deck.slides]}\n\n"
        f"STRUCTURED NOTES:\n{[n.model_dump() for n in talk.notes]}\n\n"
        f"TRANSCRIPT:\n{' '.join(talk.transcript)[:40000]}"
    )
    return generate_json(INSTRUCTION, prompt, Recap)


def recap_as_text(r: Recap) -> str:
    def sec(title: str, items: list[str]) -> str:
        return f"\n{title}\n" + "\n".join(f"  - {i}" for i in items) if items else ""
    return (
        f"{r.headline}\n"
        + sec("What was presented", r.what_was_presented)
        + sec("Key numbers", r.key_numbers)
        + sec("Questions and answers", r.questions_and_answers)
        + sec("Open questions", r.open_questions)
        + sec("Commitments", r.commitments)
        + sec("Where the talk diverged from the deck", r.divergence_from_deck)
    )
