"""Job dispatcher: idempotent step execution for every job type.

Each step name is recorded in job.steps_done after success; redelivered Pub/Sub
messages skip completed steps, so a crash mid-pipeline never double-sends email.
"""
import traceback

from .distribution import attendee_email_body, send_email, team_email_body
from .exporter import export_file_copies, export_to_slides
from .feedback_update import merge_feedback
from .firestore import (
    db, get_build_events, get_presentation, get_profile, get_talk, get_version,
    save_job, save_presentation, save_profile, save_version,
)
from .followups import create_followups
from .schemas import DeckVersion, Job
from .summary import build_recap, recap_as_text
from .versioning import build_branch, suggest_next_version_edits


def _step(job: Job, name: str) -> bool:
    """True if the step should run (not yet done)."""
    return name not in job.steps_done


def _done(job: Job, name: str) -> None:
    job.steps_done.append(name)
    save_job(job)


def run_job(job: Job) -> None:
    job.status = "running"
    save_job(job)
    try:
        if job.type == "export_deck":
            _run_export(job)
        elif job.type == "post_talk":
            _run_post_talk(job)
        elif job.type == "branch_deck":
            _run_branch(job)
        elif job.type == "feedback_update":
            _run_feedback(job)
        job.status = "done"
        save_job(job)
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.error = f"{exc}\n{traceback.format_exc()[-2000:]}"
        save_job(job)
        raise


def _run_export(job: Job) -> None:
    p = get_presentation(job.presentation_id)
    deck = get_version(job.presentation_id, job.version)
    assert p is not None and deck is not None
    if _step(job, "slides"):
        deck.slides_file_id = export_to_slides(job.uid, p.title, deck)
        save_version(p.id, deck)
        _done(job, "slides")
    if _step(job, "copies") and deck.slides_file_id:
        deck.pdf_url, deck.pptx_url = export_file_copies(
            job.uid, deck.slides_file_id, p.id, deck.version)
        save_version(p.id, deck)
        _done(job, "copies")


def _run_post_talk(job: Job) -> None:
    p = get_presentation(job.presentation_id)
    deck = get_version(job.presentation_id, job.version)
    talk = get_talk(job.presentation_id, job.talk_id)
    assert p is not None and deck is not None and talk is not None
    slides_link = (f"https://docs.google.com/presentation/d/{deck.slides_file_id}"
                   if deck.slides_file_id else "(export pending)")

    # a. ensure export exists (lock already enqueued one; this covers failures)
    if _step(job, "export") and not deck.slides_file_id:
        deck.slides_file_id = export_to_slides(job.uid, p.title, deck)
        deck.pdf_url, deck.pptx_url = export_file_copies(
            job.uid, deck.slides_file_id, p.id, deck.version)
        save_version(p.id, deck)
        slides_link = f"https://docs.google.com/presentation/d/{deck.slides_file_id}"
    if "export" not in job.steps_done:
        _done(job, "export")

    # b. recap (retry once on a transient empty generation)
    recap = build_recap(p, deck, talk)
    if not recap.headline and not recap.commitments:
        recap = build_recap(p, deck, talk)
    recap_text = recap_as_text(recap)
    if _step(job, "recap"):
        db().document(f"presentations/{p.id}/talks/{talk.id}").update(
            {"recap": recap.model_dump()})
        _done(job, "recap")

    # c. distribution (idempotency matters most here)
    if _step(job, "email_attendees"):
        send_email(job.uid, p.brief.attendee_emails,
                   f"Deck + recap: {p.title}",
                   attendee_email_body(p.title, recap_text, slides_link, deck.pdf_url))
        _done(job, "email_attendees")
    if _step(job, "email_team"):
        notes_summary = "\n".join(f"- [{n.kind}] {n.text}" for n in talk.notes)
        send_email(job.uid, [],  # team emails could be resolved from member_uids
                   f"Internal recap: {p.title}",
                   team_email_body(p.title, recap_text, notes_summary))
        _done(job, "email_team")

    # d. follow-ups
    if _step(job, "followups"):
        created = create_followups(job.uid, talk, p.title, slides_link)
        job.payload["followups"] = created   # persisted by _done() -> save_job()
        _done(job, "followups")

    # e. suggested edits for version N+1
    if _step(job, "suggest"):
        edits = suggest_next_version_edits(deck, talk)
        db().document(f"presentations/{p.id}/talks/{talk.id}").update(
            {"suggested_edits": [e.model_dump() for e in edits.edits], "status": "processed"})
        _done(job, "suggest")


def _run_branch(job: Job) -> None:
    p = get_presentation(job.presentation_id)
    src = get_version(job.presentation_id, job.version)
    assert p is not None and src is not None
    if _step(job, "branch"):
        result = build_branch(p, src, job.payload.get("instruction", ""))
        draft = DeckVersion(version=p.current_version + 1, slides=result.slides,
                            parent_version=src.version, branch_label=result.branch_label)
        p.current_version = draft.version
        save_version(p.id, draft)
        save_presentation(p)
        _done(job, "branch")


def _run_feedback(job: Job) -> None:
    p = get_presentation(job.presentation_id)
    assert p is not None
    if _step(job, "merge"):
        talk = None  # latest processed talk could be looked up; explicit id preferred
        build_edits = [e for e in get_build_events(p.id, "main")
                       if e.get("kind") == "edit"]
        profile = merge_feedback(get_profile(job.uid),
                                 job.payload.get("items", []), talk, build_edits)
        save_profile(job.uid, profile)
        _done(job, "merge")
