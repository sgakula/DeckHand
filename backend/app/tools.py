"""Tools the agent can reach for mid-session.

Each tool has its real call shape and argument validation here. The Google ones
run against a stub until OAuth credentials are present, because a hackathon demo
must not die on an expired token — but the swap is one function per tool, and the
signature it must satisfy is already fixed by the stub.

`execute()` is the single entry point the agent uses, so adding a tool never
touches the session loop.
"""
import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .config import settings
from .schemas import SourceFact

log = logging.getLogger(__name__)


@dataclass
class ToolResult:
    ok: bool
    #: One line for the session feed — this is what the group actually reads.
    summary: str
    #: Facts the tool discovered, which become citable on the artifact.
    facts: list[SourceFact]
    #: Anything the caller needs structurally (draft ids, urls).
    data: dict[str, Any]
    #: True when a stub answered instead of the real service.
    simulated: bool = False


def _stub(summary: str, facts: list[SourceFact] | None = None, **data: Any) -> ToolResult:
    return ToolResult(True, summary, facts or [], data, simulated=True)


# --------------------------------------------------------------------- tools

def web_search(query: str, uid: str = "") -> ToolResult:
    """Look something up the group could not answer from memory."""
    if not settings().google_search_api_key:
        return _stub(
            f"Looked up “{query}” — found 3 sources",
            [
                SourceFact(
                    fact=f"Benchmark for {query}",
                    value="31%",
                    source_doc="industry-benchmarks-2026",
                    source_ref="web · industry-benchmarks-2026",
                )
            ],
            query=query,
        )
    raise NotImplementedError("wire Programmable Search here once the key is set")


def drive_read(file_hint: str, uid: str = "") -> ToolResult:
    """Pull figures out of a connected Drive file.

    Real path: google_apis.drive/sheets with the user's OAuth token, then the
    existing context agent extracts facts. Stub returns the shape that produces.
    """
    return _stub(
        f"Read {file_hint} — pulled 3 figures",
        [
            SourceFact(fact="Net revenue retention", value="142%",
                       source_doc="revenue.xlsx", source_ref="revenue.xlsx · Summary!B12"),
            SourceFact(fact="Gross margin", value="81%",
                       source_doc="revenue.xlsx", source_ref="revenue.xlsx · P&L!D7"),
            SourceFact(fact="Enterprise logos", value="38",
                       source_doc="revenue.xlsx", source_ref="revenue.xlsx · Accounts"),
        ],
        file=file_hint,
    )


def gmail_draft(to: list[str], subject: str, body: str, uid: str = "") -> ToolResult:
    """Create a Gmail draft. Never sends — a human presses send."""
    return _stub(
        f"Drafted “{subject}” to {', '.join(to) or 'the room'} — waiting for you to send",
        to=to, subject=subject, body=body, draft_id="stub-draft",
    )


def calendar_hold(title: str, attendees: list[str], when: str, uid: str = "") -> ToolResult:
    """Put a hold on the calendar for an agreed follow-up."""
    return _stub(
        f"Held “{title}” {when} with {len(attendees)} people",
        title=title, attendees=attendees, when=when, event_id="stub-event",
    )


def slides_export(title: str, page_count: int, uid: str = "") -> ToolResult:
    """Export the artifact to Google Slides."""
    return _stub(
        f"Exported {page_count} slides to “{title}” in Drive",
        title=title, file_id="stub-slides", url="https://docs.google.com/presentation/d/stub",
    )


# ------------------------------------------------------------------ registry

ToolFn = Callable[..., ToolResult]

REGISTRY: dict[str, ToolFn] = {
    "web_search": web_search,
    "drive_read": drive_read,
    "gmail_draft": gmail_draft,
    "calendar_hold": calendar_hold,
    "slides_export": slides_export,
}

#: Given to the conductor so it knows what it is allowed to reach for.
CATALOGUE = """- web_search(query): look up a number or claim nobody in the room knows.
- drive_read(file_hint): pull figures out of a connected Drive file or sheet.
- gmail_draft(to, subject, body): draft a follow-up email. Never sends.
- calendar_hold(title, attendees, when): hold time for an agreed follow-up.
- slides_export(title, page_count): export the deck to Google Slides."""


def execute(name: str, args: dict[str, Any], uid: str = "") -> Optional[ToolResult]:
    """Run a tool by name. Unknown tools and bad arguments fail soft.

    A model naming a tool that does not exist, or omitting an argument, must not
    take the session down — the group keeps talking either way.
    """
    fn = REGISTRY.get(name)
    if fn is None:
        log.warning("agent asked for unknown tool %r", name)
        return None
    try:
        return fn(uid=uid, **args)
    except TypeError as exc:
        log.warning("bad arguments for tool %s: %s", name, exc)
        return None
    except Exception:  # noqa: BLE001
        log.exception("tool %s failed", name)
        return ToolResult(False, f"{name} failed", [], {})


#: Which flat ToolCall fields each tool actually consumes.
ARG_FIELDS: dict[str, tuple[str, ...]] = {
    "web_search": ("query",),
    "drive_read": ("file_hint",),
    "gmail_draft": ("to", "subject", "body"),
    "calendar_hold": ("title", "attendees", "when"),
    "slides_export": ("title", "page_count"),
}


def args_for(call: Any) -> dict[str, Any]:
    """Pick just the fields the named tool takes off a flat ToolCall."""
    return {field: getattr(call, field) for field in ARG_FIELDS.get(call.name, ())}
