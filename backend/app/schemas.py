"""Pydantic models shared across routers and agents.

Firestore layout (see PROJECT_FLOW.txt):
  users/{uid}/profile                          -> PreferenceProfile
  users/{uid}/private/googleTokens             -> OAuth refresh token (server-only)
  presentations/{pid}                          -> Presentation
  presentations/{pid}/versions/{vid}           -> DeckVersion (slides embedded)
  presentations/{pid}/buildSessions/{bsid}     -> BuildSession (messages, edits, comments subfields)
  presentations/{pid}/talks/{tkid}             -> Talk (transcript, notes)
  jobs/{jobId}                                 -> Job envelope mirrored from Pub/Sub
"""
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Interview / brief ----------

class InterviewTurn(BaseModel):
    role: Literal["user", "agent"]
    text: str
    at: datetime = Field(default_factory=now)


class PresentationBrief(BaseModel):
    audience: str = ""
    duration_minutes: int = 10
    desired_outcome: str = ""
    must_include: list[str] = []
    must_avoid: list[str] = []
    tone: str = "conversational"
    attendee_emails: list[str] = []
    complete: bool = False  # set true by the intake agent when it has enough


# ---------- Context extraction ----------

class SourceFact(BaseModel):
    fact: str
    value: str = ""
    source_doc: str = ""        # Drive file id or name
    source_ref: str = ""        # sheet range / doc heading


# ---------- Outline ----------

class OutlineSection(BaseModel):
    id: str
    title: str
    key_claim: str
    supporting_facts: list[SourceFact] = []
    est_minutes: float = 2.0
    order: int = 0


class Outline(BaseModel):
    sections: list[OutlineSection] = []
    approved: bool = False
    approved_at: Optional[datetime] = None


# ---------- Slides ----------

SlideTemplate = Literal[
    "hero", "bullets", "two_column", "metrics", "quote", "diagram", "timeline", "image_full", "closing"
]


class SlideBlock(BaseModel):
    kind: Literal["heading", "text", "bullet", "metric", "quote", "image", "diagram_node"]
    text: str = ""
    value: str = ""            # metric value / image url
    source_ref: str = ""       # provenance for numbers; empty means UNSOURCED


class Slide(BaseModel):
    id: str
    section_id: str
    template: SlideTemplate = "bullets"
    title: str = ""
    blocks: list[SlideBlock] = []
    speaker_notes: str = ""
    image_prompt: str = ""     # for Nano Banana
    image_url: str = ""        # filled async; guarded by image_rev
    image_rev: int = 0         # stale-response guard: bump on every edit
    approved: bool = False
    order: int = 0


class DeckVersion(BaseModel):
    version: int
    slides: list[Slide] = []
    locked: bool = False
    locked_at: Optional[datetime] = None
    parent_version: Optional[int] = None
    branch_label: str = ""      # e.g. "5-min customer variant"
    created_at: datetime = Field(default_factory=now)
    slides_file_id: str = ""    # Google Slides file id after export
    pdf_url: str = ""
    pptx_url: str = ""


# ---------- Presentation root ----------

class Presentation(BaseModel):
    id: str
    owner_uid: str
    title: str = "Untitled presentation"
    member_uids: list[str] = []
    brief: PresentationBrief = PresentationBrief()
    outline: Outline = Outline()
    source_file_ids: list[str] = []     # Drive files connected in Phase 0
    facts: list[SourceFact] = []
    current_version: int = 0
    created_at: datetime = Field(default_factory=now)


# ---------- Talk / notes ----------

class TalkNote(BaseModel):
    kind: Literal[
        "skipped_section", "rushed_section", "unsourced_claim", "number_mismatch",
        "audience_question", "commitment", "objection"
    ]
    text: str
    slide_id: str = ""
    answered: Optional[bool] = None     # for audience_question
    at_seconds: float = 0.0


class Talk(BaseModel):
    id: str
    presentation_id: str
    version: int
    status: Literal["live", "stopped", "processed"] = "live"
    started_at: datetime = Field(default_factory=now)
    stopped_at: Optional[datetime] = None
    transcript: list[str] = []          # rolling transcript chunks
    notes: list[TalkNote] = []


# ---------- Feedback / preferences ----------

class SlideFeedback(BaseModel):
    slide_id: str = ""                  # empty = overall
    rating: Literal["up", "down"]
    note: str = ""


class PreferenceProfile(BaseModel):
    known_answers: dict[str, str] = {}          # interview question -> remembered answer
    structure_prefs: list[str] = []             # "open with a story"
    style_prefs: list[str] = []                 # "no stock-style imagery"
    density_prefs: list[str] = []               # "fewer metric slides"
    recurring_questions: list[str] = []         # pre-empt next time
    updated_at: datetime = Field(default_factory=now)


# ---------- Jobs ----------

JobType = Literal["post_talk", "export_deck", "branch_deck", "feedback_update"]


class Job(BaseModel):
    id: str
    type: JobType
    uid: str
    presentation_id: str
    version: int = 0
    talk_id: str = ""
    payload: dict = {}
    status: Literal["queued", "running", "done", "error"] = "queued"
    steps_done: list[str] = []          # idempotency: worker skips completed steps
    error: str = ""
    created_at: datetime = Field(default_factory=now)
