"""Note-taker agent (Phase 2): turns transcript windows into structured TalkNotes.

Called incrementally by the live broker (every ~30s of transcript) and once more
at Stop for a final pass. Listen-only by design: it never modifies the deck.
"""
from pydantic import BaseModel

from ..schemas import DeckVersion, Outline, TalkNote
from .runtime import make_agent, run_agent_json


class NoteBatch(BaseModel):
    notes: list[TalkNote] = []


INSTRUCTION = """You are a silent note-taker in a live presentation.
You receive: the locked deck (slides with ids and metrics with sources), the approved
outline, notes already captured, and a new transcript window with the current slide id.
Emit ONLY NEW notes (do not repeat already-captured ones) of these kinds:
- skipped_section / rushed_section: outline points clearly passed over.
- unsourced_claim: a factual claim spoken aloud with no source in the deck's facts.
- number_mismatch: a spoken number that differs from the number on the slide.
- audience_question: a question from someone other than the presenter; set answered
  true/false if determinable.
- commitment: "I'll send / follow up / check / get back to you" style promises.
- objection: pushback from the audience and (in text) how the presenter responded.
Set slide_id to the current slide where sensible and at_seconds from the window offset.
Respond ONLY with JSON: {"notes": [TalkNote, ...]}. Empty list is a valid answer.
"""


async def take_notes(
    uid: str,
    deck: DeckVersion,
    outline: Outline,
    existing_notes: list[TalkNote],
    transcript_window: str,
    current_slide_id: str,
    window_offset_seconds: float,
) -> list[TalkNote]:
    agent = make_agent("note_taker", INSTRUCTION, output_schema=NoteBatch)
    slides_ctx = [
        {"id": s.id, "title": s.title,
         "metrics": [{"text": b.text, "value": b.value, "source_ref": b.source_ref}
                     for b in s.blocks if b.kind == "metric"]}
        for s in deck.slides
    ]
    prompt = (
        f"DECK SLIDES:\n{slides_ctx}\n\n"
        f"OUTLINE:\n{outline.model_dump_json()}\n\n"
        f"NOTES ALREADY CAPTURED:\n{[n.model_dump() for n in existing_notes]}\n\n"
        f"CURRENT SLIDE: {current_slide_id}\n"
        f"WINDOW OFFSET SECONDS: {window_offset_seconds}\n\n"
        f"NEW TRANSCRIPT WINDOW:\n{transcript_window}"
    )
    batch = await run_agent_json(agent, uid, prompt, NoteBatch)
    return batch.notes
