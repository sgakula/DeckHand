"""Step d (Phase 3): Calendar events / Google Tasks for every commitment captured."""
from datetime import datetime, timedelta, timezone

from googleapiclient.discovery import build

from .google_apis import user_credentials
from .schemas import Talk


def _tasks(uid: str):
    return build("tasks", "v1", credentials=user_credentials(uid), cache_discovery=False)


def _calendar(uid: str):
    return build("calendar", "v3", credentials=user_credentials(uid), cache_discovery=False)


def create_followups(uid: str, talk: Talk, presentation_title: str, slides_link: str) -> list[str]:
    """One Google Task per commitment; one calendar reminder for unanswered questions."""
    created: list[str] = []
    svc = _tasks(uid)
    tasklist = svc.tasklists().list(maxResults=1).execute()["items"][0]["id"]
    due = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()

    for note in talk.notes:
        if note.kind == "commitment":
            t = svc.tasks().insert(tasklist=tasklist, body={
                "title": f"[{presentation_title}] {note.text[:120]}",
                "notes": f"Promised during the talk (slide {note.slide_id or '?'}).\n"
                         f"Deck: {slides_link}",
                "due": due,
            }).execute()
            created.append(f"task:{t['id']}")

    unanswered = [n for n in talk.notes if n.kind == "audience_question" and n.answered is False]
    if unanswered:
        start = datetime.now(timezone.utc) + timedelta(days=1)
        ev = _calendar(uid).events().insert(calendarId="primary", body={
            "summary": f"Answer open questions from '{presentation_title}'",
            "description": "\n".join(f"- {n.text}" for n in unanswered) + f"\nDeck: {slides_link}",
            "start": {"dateTime": start.isoformat()},
            "end": {"dateTime": (start + timedelta(minutes=30)).isoformat()},
        }).execute()
        created.append(f"event:{ev['id']}")
    return created
