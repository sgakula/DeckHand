# Deckhand — the demo runbook

**Track:** The Collaborative Partner
**Scenario:** a go/no-go launch review · **Runtime:** ~1:55 · **Cast:** you + Amara (eng), Tomás (sales), Jules (marketing)

---

## The one sentence

> Four people with four kinds of expertise talk through a launch decision.
> Nobody types. The launch brief builds itself on the shared screen — pages
> included: the workspace starts as ONE empty page, and every page that exists
> at the end was created by the agent because the conversation opened that
> topic.

That last clause is the anti-template proof. Say it out loud in the video.

## How to run it

```bash
cd backend  && .venv/bin/python -m uvicorn app.main:app --port 8090
cd frontend && npm run dev
open http://localhost:3000/w/new     # press ▶ Run the meeting
```

You participate three times: let it speak when it **raises its hand**, answer
the **pricing question** when the room deadlocks, and open **Notes** at the end.

## The scenario, beat by beat

| # | Who (expertise) | Line (abridged) | The agent — all live |
|---|---|---|---|
| 1 | You (product) | "Go or no-go on Autopilot. Start a positioning page…" | **CREATES the Positioning page**, composes it |
| 2 | Amara (eng) | "Ground it in the beta. Pull the beta metrics sheet, cite cells." | **DRIVE** — parses beta.xlsx (10 real figures) → **creates Evidence page** |
| 3 | Tomás (sales) | "Search what Datadog and PagerDuty charge for automation add-ons." | **LIVE GOOGLE SEARCH** — real competitor pricing, cited `web · pagerduty.com` → **creates Pricing page** |
| 4 | Jules (mktg) | "Hero visual — calm ops floor at night, premium." | **IMAGE** — real generation onto Positioning. (It may also raise its hand about the empty Cover — let it speak, click Do it) |
| 5 | You | "The evidence page still feels thin." | **HOLD** — critique with no direction |
| 6 | Amara | "The story is durability — add the cohort curve, cite it." | **DRIVE** — second real file (cohorts.csv) |
| 7 | Tomás | "Forty-nine per host. Lands under Datadog." | **ACT** — $49 on the pricing page, amber-flagged (nobody sourced it) |
| 8 | Jules | "Absolutely not — premium dies at forty-nine." | **ASK** ★ — sales vs marketing; freezes; three options; you decide |
| 9 | You | "Amara, what keeps you up at night?" | **HOLD** — "waiting for Amara's response" (a question to a person is not a command) |
| 10 | Amara | "Approval mode — mine. Rollback load-test — Tomás's. Risks page, with owners." | **CREATES Risks page**; commitments extracted with owners |
| 11 | Jules | "Draft the beta announcement — lead with the number. Rule: the number is the headline, never an adjective." | **GMAIL** — real .eml whose subject leads with 41% · preference stored for every future session |
| 12 | Tomás | "Hold Thursday two p.m. with finance." | **CALENDAR** — real .ics |
| 13 | You | "Export the brief." | **SLIDES** — real .pptx of all 5 pages, image included |

## What to say over it (the sell)

- After 1–3: *"Three sentences, three experts, three pages — none of which
  existed a minute ago. There is no template here; the agenda becomes the
  artifact."*
- After 3: *"Those competitor prices came from a live Google search during the
  meeting — look at the citations: the web source and our spreadsheet cells,
  side by side."*
- After 7–8: *"Sales and marketing want different prices. It will not pick a
  side, and it will not average them. The room decides; then it moves."*
- After 9: *"I asked Amara a question — it knew that wasn't for it."*
- At the end: *"Thirteen sentences. A five-page brief with every number
  sourced or flagged, two risks with owners, a decision log, an email draft,
  a calendar hold, and a PowerPoint file. And it learned one rule about how
  this team works — permanently."*

## Video shot list (4:00 max — submission requirements)

1. 0:00 — Cloud Run console + the `.run.app` URL on screen ("backend live on
   Google Cloud"), then open the app at that URL. **Required by the rules.**
2. 0:20 — press ▶ Run the meeting; let it play (~1:55), narrate the beats above.
   Unedited — the rules require live execution.
3. ~3:20 — the off-script proof: type or say your own sentence (e.g. "add a
   competition page comparing us to PagerDuty") and watch a page appear that is
   in no script. Optionally: open `backend/demo_drive/beta.xlsx`, change a
   number, ask again — the slide cites the new value.
4. 3:45 — Notes panel + downloaded .pptx open in PowerPoint.

## What is real vs. staged

**Real, every run:** all act/hold/ask decisions (Gemini 3.5 Flash via Google
ADK; the conductor reasons at `thinking_level: low`, the composer renders with
thinking off — measured 2x faster with no loss) · page creation · conflict detection
(schema-first `conflict_with`) · workbook parsing with true cell coordinates ·
live Google Search grounding · image generation · the .pptx/.ics/.eml files ·
unsourced flagging · notes, owners, cross-session preferences · fallback chain.

**Staged:** the four voices are scripted text (mic works live;
`gemini-3.5-transcribe` wired for the audio path). The drive folder is local —
real parser, simulated transport; Gmail/Calendar/Slides write real local files;
pushing them into Google accounts is the OAuth consent step (`app/oauth.py`).

## If it goes wrong on camera

| Symptom | Say | Then |
|---|---|---|
| "lost the thread for a second" | "Model hiccup, not the agent." | Next turn retries on a fallback |
| A hold you didn't expect | "It's not convinced — that's the feature." | Give it a direction |
| It creates a page you didn't predict | "It structures the artifact itself." | That IS the demo |
| Different wording than rehearsal | "Nothing is canned." | Keep narrating the beats |

Every run composes fresh wording — rehearse once before recording so you know
that day's phrasing. **Never** re-record because it held.
