"""Builder agent (Phase 1b): generate slides per section; apply conversational edits.

Every numeric block must carry source_ref provenance; blocks without it are flagged
by the dry-run check. Edits bump image_rev so stale Nano Banana responses are dropped.
"""
from pydantic import BaseModel

from ..schemas import (
    Outline, OutlineSection, PresentationBrief, PreferenceProfile, Slide,
)
from .runtime import make_agent, run_agent_json


class SlideList(BaseModel):
    slides: list[Slide] = []


class EditResult(BaseModel):
    slide: Slide
    clarifying_question: str = ""   # non-empty when the agent needs a human decision
    change_summary: str = ""        # recorded as build-time feedback


GENERATE_INSTRUCTION = """You build presentation slides as structured JSON.
For the given outline section, produce 1-3 slides. Choose the best template per slide:
hero, bullets, two_column, metrics, quote, diagram, timeline, image_full, closing.
Rules:
- Use ONLY numbers present in supporting_facts; copy source_ref into the block.
  If you state something with no source, leave source_ref empty (it will be flagged).
- Keep text tight: titles <= 8 words, bullets <= 12 words.
- Write speaker_notes: 2-4 sentences of what the presenter should SAY, not what the slide shows.
- Write image_prompt: a short scene description for a background image matching the
  tone (or empty string for data-heavy slides).
- Apply the style/density preferences given.
Respond ONLY with JSON: {"slides": [Slide, ...]} using the Slide schema provided in context.
"""

EDIT_INSTRUCTION = """You apply one edit request to one slide (JSON in, JSON out).
The request may be voice/text ("make this a two-column comparison", "use the Q2 number
from the revenue sheet") or a teammate comment ("legal will not like this claim").
Rules:
- Change only what the request implies; keep everything else identical, including ids.
- If the request needs a number, take it from the provided FACTS and set source_ref.
- If the request is ambiguous or two inputs conflict, do NOT guess: return the slide
  unchanged and put ONE short question in clarifying_question.
- Summarize what changed in change_summary ("template bullets->two_column; replaced
  revenue figure with Q2 value from revenue sheet").
Respond ONLY with JSON matching EditResult.
"""


async def generate_section_slides(
    uid: str,
    brief: PresentationBrief,
    section: OutlineSection,
    profile: PreferenceProfile,
    start_order: int,
) -> list[Slide]:
    agent = make_agent("builder_generate", GENERATE_INSTRUCTION, output_schema=SlideList)
    prompt = (
        f"BRIEF:\n{brief.model_dump_json()}\n\n"
        f"SECTION:\n{section.model_dump_json()}\n\n"
        f"PREFERENCES:\n{profile.model_dump_json()}\n\n"
        f"Set section_id='{section.id}' on every slide. Slide ids: '{section.id}-1', '{section.id}-2', ..."
    )
    result = await run_agent_json(agent, uid, prompt, SlideList)
    for i, slide in enumerate(result.slides):
        slide.section_id = section.id
        slide.order = start_order + i
        slide.approved = False
        slide.image_rev = 0
    return result.slides


async def apply_edit(
    uid: str,
    slide: Slide,
    request_text: str,
    outline: Outline,
    profile: PreferenceProfile,
) -> EditResult:
    facts = [f.model_dump() for s in outline.sections for f in s.supporting_facts]
    agent = make_agent("builder_edit", EDIT_INSTRUCTION, output_schema=EditResult)
    prompt = (
        f"SLIDE:\n{slide.model_dump_json()}\n\n"
        f"FACTS:\n{facts}\n\n"
        f"PREFERENCES:\n{profile.model_dump_json()}\n\n"
        f"EDIT REQUEST:\n{request_text}"
    )
    result = await run_agent_json(agent, uid, prompt, EditResult)
    if not result.clarifying_question:
        result.slide.image_rev = slide.image_rev + 1   # invalidate in-flight images
        result.slide.approved = False                  # edits require re-approval
    return result


# ---------- dry-run check (Phase 1b step 12) ----------

def dry_run_check(brief: PresentationBrief, outline: Outline, slides: list[Slide]) -> dict:
    """Deterministic pre-lock checks: timing, unsourced numbers, empty sections."""
    problems: list[dict] = []

    covered = {s.section_id for s in slides}
    for sec in outline.sections:
        if sec.id not in covered:
            problems.append({"kind": "missing_section", "ref": sec.id,
                             "detail": f"No slides for section '{sec.title}'"})

    for slide in slides:
        for b in slide.blocks:
            if b.kind == "metric" and not b.source_ref:
                problems.append({"kind": "unsourced_claim", "ref": slide.id,
                                 "detail": f"Metric '{b.text}: {b.value}' has no source"})

    est_minutes = sum(sec.est_minutes for sec in outline.sections)
    if est_minutes > brief.duration_minutes * 1.15:
        problems.append({"kind": "overtime", "ref": "",
                         "detail": f"Planned {est_minutes:.0f} min vs budget {brief.duration_minutes} min"})

    unapproved = [s.id for s in slides if not s.approved]
    return {"problems": problems, "unapproved_slides": unapproved,
            "ready": not problems and not unapproved}
