"""The conductor: decides whether the group has actually asked for anything,
takes the notes a good facilitator would take, and says what it thinks should
happen next.

This is the agent that makes a live session usable. In a real conversation most
speech is not an instruction — it is greeting, thinking aloud, critique with no
agreed direction, or people talking to each other. An agent that edits on every
utterance is worse than useless, and one that waits for a wake word is not a
collaborator.

Everything it produces comes from ONE model call per turn: the act/hold/ask
decision, any notes, the suggested next step, and any tool it wants to use.
Splitting these into separate agents would quadruple latency and cost for no
gain in quality, because they all reason over the same context.
"""
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas import SourceFact
from ..tools import CATALOGUE
from .runtime import make_agent, run_agent_json

NoteKind = Literal["decision", "commitment", "open_question", "preference"]


class Note(BaseModel):
    kind: NoteKind
    text: str
    #: Who owns a commitment. Empty for everything else.
    owner: str = ""


class ToolCall(BaseModel):
    """Tool arguments are explicit fields, not a free-form dict.

    A `dict` field compiles to `additionalProperties` in the JSON schema, which
    the Gemini structured-output API rejects outright. Flat optional fields keep
    the schema valid and make the model's options self-documenting.
    """
    name: str = ""
    query: str = ""            # web_search
    file_hint: str = ""        # drive_read
    to: list[str] = Field(default_factory=list)        # gmail_draft
    subject: str = ""
    body: str = ""
    title: str = ""            # calendar_hold, slides_export
    attendees: list[str] = Field(default_factory=list)
    when: str = ""
    page_count: int = 0


class Decision(BaseModel):
    action: Literal["act", "hold", "ask"] = "hold"
    #: Shown verbatim in the session rail, so it must read like a person wrote it.
    reason: str = ""

    # act only
    instruction: str = ""
    target_page_id: str = ""

    # ask only
    question: str = ""
    options: list[str] = Field(default_factory=list)

    #: Anything worth remembering from this turn. Usually empty.
    notes: list[Note] = Field(default_factory=list)
    #: What the group should probably do next. Offered, never imposed.
    next_step: str = ""
    #: A tool to run before composing, when the group needs something fetched.
    tool: ToolCall = Field(default_factory=ToolCall)


INSTRUCTION = f"""You are the conductor of a live working session. A group is
talking while one artifact (a deck, page or report) is built on a shared screen.
You decide what happens to that artifact, keep the notes, and guide the group.

## 1. Choose exactly one action

"hold" — THE DEFAULT AND THE COMMON CASE. Choose it for greetings, small talk,
audio checks, people answering each other, thinking aloud, or a critique that has
no agreed direction yet. In `reason`, say in under ten words what you are waiting
for, e.g. "critique noted, waiting for a direction".

"ask" — the group wants incompatible things, or one detail is missing and
guessing would waste their time. Put ONE short question in `question` and two or
three concrete choices in `options`. Never ask about something already settled,
and never ask more than the single most blocking question.

"act" — the group has converged on a concrete change you can apply now. Put a
precise, self-contained instruction for the builder in `instruction`, naming what
changes and how. Set `target_page_id` to the page it applies to.

Rules that decide the hard cases:
- A DIRECT, CONCRETE INSTRUCTION from ONE person that nobody has objected to IS
  actionable. Act on it. Do not wait for a second person to agree — in a real
  meeting, silence after a clear instruction is consent. "Make the headline X",
  "put the margin on traction", "cut that bullet" are all immediately actionable.
- A criticism with NO direction ("this is too wordy", "the opening is soft") is
  NOT actionable, because you would have to invent the fix. Hold and say what
  you are waiting for.
- Two people wanting different things with nobody conceding is "ask", never "act".
- An instruction aimed at a person ("Tomás, can you check the numbers") is not an
  instruction to you. Hold.
- If someone objected to this exact change earlier and it was never resolved,
  do not act — ask.
- When genuinely unsure, hold. A wrong edit costs the group more than a missed one.

## 2. Take notes

Add to `notes` ONLY when this turn produced something worth keeping:
- "decision" — the group settled something ("we lead with the 4x stat").
- "commitment" — a person said they would do something. Set `owner` to their name.
- "open_question" — something raised that nobody answered.
- "preference" — how this group likes to work ("we always cite figures", "keep
  slides to one idea"). These persist across sessions, so only record durable
  habits, never one-off instructions.
Most turns produce no notes. Do not narrate the conversation back.

## 3. Guide

Set `next_step` when you can see a useful next move the group has not mentioned —
an empty page, a claim with no source, a missing section. One short sentence,
phrased as an offer ("Traction is still empty — want me to draft it from the
Drive figures?"). Leave it empty if the group is mid-flow or already on track.
Do not repeat a next_step they declined.

## 4. Use a tool when the room needs something fetched

Available tools:
{CATALOGUE}

Set `tool` only when the conversation clearly calls for it — someone asks for a
number nobody has, or asks you to email/schedule/export. Otherwise leave it empty.
A tool runs BEFORE the artifact is composed, so its results can be cited.

Respond ONLY with JSON matching the Decision schema.
"""


async def decide(
    uid: str,
    transcript: list[dict],
    pages: list[dict],
    facts: list[SourceFact],
    already_asked: list[str],
    preferences: list[str],
    declined_steps: list[str],
) -> Decision:
    """Classify the current state of the conversation.

    `transcript` is the recent window, oldest first. Only the tail matters for the
    decision, but earlier turns supply the context that makes agreement legible.
    """
    convo = "\n".join(f"{t.get('speaker', '?')}: {t.get('text', '')}" for t in transcript[-14:])
    page_list = "\n".join(
        f"- {p['id']}: {p['label']}"
        f"{'  (still empty)' if 'fills itself in' in (p.get('body') or '') else ''}"
        f"{'  (UNSOURCED: ' + '; '.join(p['unsourced']) + ')' if p.get('unsourced') else ''}"
        for p in pages
    )
    fact_list = "\n".join(f"- {f.fact} = {f.value} ({f.source_ref})" for f in facts) or "(none)"
    asked = "\n".join(f"- {q}" for q in already_asked[-5:]) or "(none)"
    prefs = "\n".join(f"- {p}" for p in preferences[-12:]) or "(none learned yet)"
    declined = "\n".join(f"- {d}" for d in declined_steps[-5:]) or "(none)"

    agent = make_agent("conductor", INSTRUCTION, output_schema=Decision)
    prompt = (
        f"HOW THIS GROUP LIKES TO WORK (learned from past sessions — respect these):\n{prefs}\n\n"
        f"PAGES IN THIS ARTIFACT:\n{page_list}\n\n"
        f"CONNECTED FACTS (the only numbers that count as sourced):\n{fact_list}\n\n"
        f"QUESTIONS YOU ALREADY ASKED (do not repeat):\n{asked}\n\n"
        f"SUGGESTIONS THEY DECLINED (do not repeat):\n{declined}\n\n"
        f"CONVERSATION SO FAR (oldest first, last line is newest):\n{convo}"
    )
    return await run_agent_json(agent, uid, prompt, Decision)
