"""Step c (Phase 3): email the deck + recap to attendees, and the internal recap to the team."""
import base64
from email.message import EmailMessage

from googleapiclient.discovery import build

from .google_apis import user_credentials


def _gmail(uid: str):
    return build("gmail", "v1", credentials=user_credentials(uid), cache_discovery=False)


def send_email(uid: str, to: list[str], subject: str, body: str) -> str:
    if not to:
        return "skipped: no recipients"
    msg = EmailMessage()
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = _gmail(uid).users().messages().send(
        userId="me", body={"raw": raw}).execute()
    return sent.get("id", "")


def attendee_email_body(title: str, recap_text: str, slides_link: str, pdf_url: str) -> str:
    return (
        f"Hi,\n\nThanks for attending \"{title}\". Here is the deck and a short recap.\n\n"
        f"Slides: {slides_link}\nPDF: {pdf_url}\n\n"
        f"----- RECAP -----\n{recap_text}\n\n"
        f"Sent by Deckhand on behalf of the presenter."
    )


def team_email_body(title: str, recap_text: str, notes_summary: str) -> str:
    return (
        f"Internal recap for \"{title}\" (not sent to attendees).\n\n"
        f"{recap_text}\n\n----- NOTE-TAKER FINDINGS -----\n{notes_summary}\n"
    )
