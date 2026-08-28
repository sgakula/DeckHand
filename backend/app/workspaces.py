"""Live workspaces: one artifact, built by a group talking over it.

A workspace is a single document holding its pages, the session transcript, and
the feed the UI renders. Keeping it in one doc keeps the read path to a single
fetch, which matters when every utterance triggers a round trip.
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .firestore import db, new_id
from .schemas import SourceFact, now

WorkspaceKind = Literal["presentation", "page", "report", "email", "dashboard"]


class Page(BaseModel):
    """One rendered unit — a slide, a section, the whole page for single-page kinds."""
    id: str
    label: str
    body: str = ""
    #: Utterance ids that caused the current content. This is what lets the UI
    #: answer "why does this slide look like this?".
    caused_by: list[str] = Field(default_factory=list)
    #: Claims the composer could not tie to a connected source.
    unsourced: list[str] = Field(default_factory=list)
    #: True until the agent first writes real content here. A placeholder must be
    #: replaced wholesale, never edited around.
    is_placeholder: bool = True
    updated_at: Optional[datetime] = None


class Utterance(BaseModel):
    id: str
    speaker: str
    text: str
    at: datetime = Field(default_factory=now)


class Note(BaseModel):
    """What a good facilitator would have written down."""
    id: str
    kind: Literal["decision", "commitment", "open_question", "preference"]
    text: str
    owner: str = ""
    at: datetime = Field(default_factory=now)
    resolved: bool = False


class FeedEvent(BaseModel):
    """Everything the session rail renders, in order."""
    id: str
    kind: Literal["speech", "acted", "held", "asked", "answered"]
    at: datetime = Field(default_factory=now)
    speaker: str = ""
    text: str = ""
    #: For agent events: the one-line explanation shown to the group.
    reason: str = ""
    page_id: str = ""
    tool: str = ""
    options: list[str] = Field(default_factory=list)
    #: Utterances that drove an "acted" event.
    from_utterances: list[str] = Field(default_factory=list)
    #: Thumbs on an agent action. None = not rated yet.
    rating: Optional[Literal["up", "down"]] = None


class Workspace(BaseModel):
    id: str
    owner_uid: str
    title: str
    kind: WorkspaceKind = "presentation"
    member_uids: list[str] = Field(default_factory=list)
    pages: list[Page] = Field(default_factory=list)
    facts: list[SourceFact] = Field(default_factory=list)
    transcript: list[Utterance] = Field(default_factory=list)
    events: list[FeedEvent] = Field(default_factory=list)
    #: Set while the agent is waiting on a human decision. Blocks further edits.
    pending_question: Optional[FeedEvent] = None
    notes: list[Note] = Field(default_factory=list)
    #: The agent's current suggestion, offered not imposed.
    next_step: str = ""
    #: Suggestions the group turned down, so it stops re-offering them.
    declined_steps: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=now)


# ---------- repository ----------

def create_workspace(w: Workspace) -> None:
    db().document(f"workspaces/{w.id}").set(w.model_dump())


def get_workspace(wid: str) -> Optional[Workspace]:
    snap = db().document(f"workspaces/{wid}").get()
    return Workspace(**(snap.to_dict() or {})) if snap.exists else None


def save_workspace(w: Workspace) -> None:
    db().document(f"workspaces/{w.id}").set(w.model_dump())


def list_workspaces(uid: str) -> list[Workspace]:
    q = db().collection("workspaces").where("member_uids", "array_contains", uid)
    return [Workspace(**(s.to_dict() or {})) for s in q.stream()]


def require_member(wid: str, uid: str) -> Workspace:
    w = get_workspace(wid)
    if w is None:
        raise LookupError("workspace not found")
    if uid not in w.member_uids and uid != w.owner_uid:
        raise PermissionError("not a member of this workspace")
    return w


# ---------- starter content ----------

STARTERS: dict[str, list[tuple[str, str]]] = {
    "presentation": [
        ("Hook", "The one line that makes them lean in"),
        ("Problem", "Why this keeps happening"),
        ("Traction", "Where we are"),
        ("The ask", "What we want from this room"),
    ],
    "page": [("Page", "The whole page")],
    "report": [("Summary", "What happened"), ("Detail", "The numbers behind it")],
    "email": [("Draft", "The message")],
    "dashboard": [("Overview", "The headline numbers")],
}


def starter_pages(kind: WorkspaceKind) -> list[Page]:
    return [
        Page(id=f"p{i + 1}", label=label, body=_placeholder(label, hint), is_placeholder=True)
        for i, (label, hint) in enumerate(STARTERS.get(kind, STARTERS["presentation"]))
    ]


def _placeholder(label: str, hint: str) -> str:
    """An empty page still has to look like something on the shared screen."""
    return (
        '<div class="pad" style="justify-content:center;align-items:center;'
        'text-align:center;gap:18px">'
        f'<span class="eyebrow">{label}</span>'
        '<p style="font-size:30px;line-height:1.35;color:var(--muted);max-width:22ch">'
        f"{hint}</p>"
        '<p style="font-size:19px;color:var(--muted);opacity:.6">Start talking — '
        "this fills itself in.</p></div>"
    )


def new_workspace(uid: str, title: str, kind: WorkspaceKind = "presentation") -> Workspace:
    return Workspace(
        id=new_id(),
        owner_uid=uid,
        title=title,
        kind=kind,
        member_uids=[uid],
        pages=starter_pages(kind),
    )


# ---------- learned preferences (per user, across sessions) ----------

def get_preferences(uid: str) -> list[str]:
    snap = db().document(f"users/{uid}/meta/workspacePrefs").get()
    return list((snap.to_dict() or {}).get("preferences", [])) if snap.exists else []


def add_preference(uid: str, text: str) -> list[str]:
    """Append a durable working preference, de-duplicated, newest last."""
    prefs = get_preferences(uid)
    if text and text not in prefs:
        prefs.append(text)
        prefs = prefs[-40:]
        db().document(f"users/{uid}/meta/workspacePrefs").set({"preferences": prefs})
    return prefs
