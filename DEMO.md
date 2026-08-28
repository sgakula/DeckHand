# Deckhand — live demo script

**Track:** The Collaborative Partner
**Runtime:** 3:00 · **Cast:** 3 (Karthik, Member 2, Member 3)

---

## The one sentence

> Three people get on a call and talk. Nobody types. The deck builds itself on the
> shared screen — and the agent knows when *not* to touch it.

---

## Why this wins the track, line by line

| The track asks for | What the judge sees |
|---|---|
| "leads the way" | Agent offers the next move unprompted; declining is remembered |
| "takes notes" | Decisions, commitments and open questions captured live |
| "ask clarifying questions" | Real disagreement → agent stops and asks, edits blocked until answered |
| "guide step-by-step" | It walks an empty deck to a finished one without being told the order |
| "capture feedback" | Thumbs on any action; a thumbs-down changes behaviour |
| "adapts to your way of thinking" | "cite every one" becomes a permanent preference across sessions |

**The differentiator to say out loud:** *most speech is not an instruction.* An
agent that edits on every sentence is unusable. Deckhand decides **act / hold /
ask** on every turn and shows its reasoning.

---

## Setup (before you record)

```bash
# 1. API + worker
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8090
cd worker  && source .venv/bin/activate && uvicorn app.main:app --port 8081

# 2. Frontend
cd frontend && npm run dev        # http://localhost:3000

# 3. Fresh session
open http://localhost:3000/w/new
```

- Browser at **1560×900**, dark theme, session rail visible.
- **Quota check first.** Free tier is ~20 requests/day/model. This script is
  ~11 turns. Rehearse on a different Google project than the one you record on,
  or enable billing. If the rail says *"lost the thread for a second"*, you are
  out of quota — that is not a bug in the product.

---

## THE SCRIPT

Timings are speech only. Leave the agent's pauses in — the thinking is the point.

---

### 0:00 — Cold open (Karthik, to camera)

> **KARTHIK:** "This is a Series B deck. It's empty. We're not going to type
> anything — we're just going to have the meeting."

*Click into the workspace. Four blank slides: Hook, Problem, Traction, The ask.*

---

### 0:12 — It ignores you (the credibility beat)

> **MEMBER 2 (Amara):** "Can everyone hear me okay?"
> **MEMBER 3 (Tomás):** "Yeah, you're coming through."

*Rail: two grey lines — `audio check in progress`.*

> **KARTHIK:** "It heard that and did nothing. That's deliberate — it's deciding
> whether we actually asked for something."

**Judge takeaway:** this is not a transcription toy.

---

### 0:30 — Critique alone is not an instruction

> **AMARA:** "The opening is too soft. It reads like every other infra deck."

*Rail: `critique noted, waiting for a direction`. Slide unchanged.*

> **KARTHIK:** "Still nothing. Someone complained, but nobody said what to do."

---

### 0:45 — Convergence → it acts

> **TOMÁS:** "Lead with the four-times-slower stat. Make that the headline."
> **AMARA:** "Agreed, do that."

*Stage glows. Hook rewrites to **"Every team ships four times slower than they
think."** An amber **unsourced** banner appears under the slide.*

> **KARTHIK:** "Proposal plus agreement — now it moves. And look: it flagged its
> own number. We never connected the data, so it won't pretend that's sourced."

**Judge takeaway:** the guardrail is deterministic, not vibes.

---

### 1:15 — It reaches for a tool

> **TOMÁS:** "Priya will ask about gross margin. Pull it from the revenue sheet
> and put it on traction."

*Drive chip lights in the header. Rail: `Read revenue.xlsx — pulled 3 figures`.*

> **AMARA:** "Yes — retention, margin and logos. And cite every one."

*Traction fills with three figures, each with its cell reference. **No amber
banner** this time.*

> **KARTHIK:** "Same agent, same slide type — sourced this time, because it went
> and got the numbers."

---

### 1:45 — ★ It refuses to guess (the money shot)

> **TOMÁS:** "On the ask, I want the full use of funds broken out."
> **AMARA:** "No — keep the ask to one line. Breakdowns kill the close."

*Amber card in the rail: **Needs a decision** — "How should the ask slide read?"
with buttons: `One line` · `Full breakdown` · `One line + appendix`.
Everything is frozen.*

> **KARTHIK:** "Two people want opposite things. It won't pick a side and it
> won't average them — it stops and asks. Nothing gets edited until we answer."

*Click **One line + appendix**. The ask slide composes.*

**Judge takeaway:** this is the track's thesis in five seconds.

---

### 2:15 — It leads

*Blue nudge card appears on its own: "Problem is still empty — want me to draft
it from the churn analysis?" with `Do it` · `Not now`.*

> **KARTHIK:** "Nobody asked for that. It noticed the gap."

*Click **Do it**. Problem slide fills.*

> **KARTHIK:** "And if I'd said 'not now', it won't offer it again. Guide, not nag."

---

### 2:35 — Feedback that sticks

*Scroll the Notes panel: **decision** "lead with the 4× stat" · **commitment**
"Karthik — send Priya the cohort breakdown" · **preference** "Always cite figures".*

> **KARTHIK:** "It took the minutes. And that last one — nobody set a setting.
> Amara said 'cite every one' once, and it turned that into a standing rule."

*Thumbs-down one action. Toast: "Noted — I'll adjust."*

> **KARTHIK:** "That's stored against me, not this deck. Next session it already
> knows."

---

### 2:50 — Close

> **KARTHIK:** "Eleven sentences. Nobody opened a slide editor. Every number
> traces to a cell, every decision is written down, and it learned how we work."

*Header: Drive · Sheets · Gmail · Slides.*

> "Gemini 3.5 for the reasoning, 3.5-transcribe for the room, Google Workspace
> for everything after."

---

## Exact lines (copy-paste for the demo voices)

| # | Speaker | Line | Expected |
|---|---|---|---|
| 1 | Amara | Can everyone hear me okay? | HOLD |
| 2 | Tomás | Yeah, you're coming through. | HOLD |
| 3 | Amara | The opening is too soft. It reads like every other infra deck. | HOLD |
| 4 | Tomás | Lead with the four-times-slower stat. Make that the headline. | HOLD |
| 5 | Amara | Agreed, do that. | **ACT** + unsourced |
| 6 | Tomás | Priya will ask about gross margin. Pull it from the revenue sheet and put it on traction. | TOOL |
| 7 | Amara | Yes — retention, margin and logos. And cite every one. | **ACT** sourced + preference |
| 8 | Tomás | On the ask, I want the full use of funds broken out. | HOLD |
| 9 | Amara | No — keep the ask to one line. Breakdowns kill the close. | **ASK** |
| 10 | *(click)* | One line + appendix | **ACT** |
| 11 | Karthik | I'll send Priya the cohort breakdown by Friday. | commitment note |

> Lines 1–9 and 11 are in `frontend/lib/voices.ts`. Click the speaker's chip in
> the rail to fire their next line, or say them into the mic yourself.

---

## If it goes wrong on camera

| Symptom | Say this | Then |
|---|---|---|
| `lost the thread for a second` | "That's the free-tier quota, not the agent." | Keep going; next turn retries on a fallback model |
| Agent holds when you wanted an act | **Don't fight it** — "It's not convinced yet." Add the agreement line. | Genuinely better than it guessing |
| Agent acts early | "It got there faster than the script." | Move on |
| Compose is slow | Let the shimmer run. It reads as thinking. | — |

**Never** re-record because it held. A hold is the feature.

---

## What is real vs. staged

Say this in the submission — judges reward the honesty and it costs nothing:

- **Real:** every act/hold/ask decision, the composed HTML, source tracking,
  notes extraction, preference learning, model fallback. Live Gemini calls.
- **Staged:** teammate voices are injected text rather than three live mics
  (`gemini-3.5-transcribe` is wired for your own mic). Google tools return
  fixtures — the call signatures and OAuth path are real, the credentials are not.
