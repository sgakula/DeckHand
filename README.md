# Deckhand

An agent that prepares, presents, and follows up on your pitch — end to end.
Built for the **All Things Agentic Hackathon** (Track: **The Collaborative Partner**)
on **Gemini 3.5 Flash + Google ADK + Google Cloud**.

You tell it who you're presenting to. It interviews you and your teammates, builds the
deck with you slide by slide from your real Drive/Sheets data, then sits in on the talk
as a **silent note-taker** — and afterwards, in the background, exports to Google Slides,
emails attendees, creates follow-up tasks, suggests edits for the next version, and
learns your presenting preferences.

Full product flow: [`PROJECT_FLOW.txt`](PROJECT_FLOW.txt)

## Architecture

```
Next.js frontend  ──REST/WS──►  deckhand-api (Cloud Run, FastAPI + ADK agents)
                                  │  Intake · Context · Planner · Builder · Note-taker
                                  │  Gemini Live broker (voice cmds + talk listening)
        Firestore realtime ◄──────┤  Firestore (state, versions, notes, preferences)
                                  └──► Pub/Sub topic deckhand-jobs
                                          │ push
                                          ▼
                                deckhand-worker (Cloud Run, FastAPI)
                                  Exporter → Google Slides / PDF / PPTX (GCS)
                                  Summary · Gmail distribution · Calendar/Tasks
                                  Suggested edits · Preference merge
```

- **Models:** Gemini 3.5 Flash (all agents), Gemini Live API (voice + listening),
  Nano Banana image model (slide imagery, stale-response guarded).
- **Design rule:** the agent may edit slides only **before** the talk. During the talk
  it is listen-only (its sole screen action is optional next-slide navigation).
- **Reliability:** Pub/Sub push with idempotent per-step checkpoints (`jobs/{id}.steps_done`)
  so redeliveries never double-send email; OpenTelemetry traces to Cloud Trace.

## Repo layout

```
backend/    API service (FastAPI + google-adk). All Phase 0-2 & 5 endpoints + Live broker.
worker/     Background service. Pub/Sub push handler running the Phase 3/4 pipelines.
testclient/ Single-file dev harness for exercising the API (NOT the product frontend).
            Serve with `python -m http.server 3000` from testclient/ and open it.
frontend/   (owned by the frontend dev — the real Next.js app lives here)
deploy/     setup.sh (one-time project setup), deploy.sh (build+deploy), cloudbuild-worker.yaml
firestore.rules  Client read access for realtime UI; all writes server-side.
```

## Prerequisites

- Google Cloud project with billing (the $150 hackathon credits cover this comfortably)
- `gcloud` CLI authenticated: `gcloud auth login && gcloud auth application-default login`
- Python 3.12+
- A Firebase project on the same GCP project (for Auth) — enable Google sign-in
- An **OAuth 2.0 Client ID (Web application)** in the Cloud console
  (APIs & Services → Credentials) for user-consented Drive/Slides/Gmail/Calendar access

## Run locally

> **Windows:** run the `bash deploy/*.sh` commands from **Git Bash** (ships with Git
> for Windows); `gcloud` works there once the Cloud SDK is installed. PowerShell
> alternative for the sync step: `.\deploy\sync_shared.ps1`. Activate venvs in
> PowerShell with `.venv\Scripts\Activate.ps1`.

```bash
# 1) shared modules for the worker
bash deploy/sync_shared.sh

# 2) API service
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # fill in project id + OAuth client
# For local dev without Vertex: set GOOGLE_GENAI_USE_VERTEXAI=false and GOOGLE_API_KEY=...
# Optional: DEV_FAKE_UID=demo-user to skip Firebase token verification locally.
uvicorn app.main:app --reload --port 8080

# 3) worker (second terminal)
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8081
# Locally there is no Pub/Sub push; POST the envelope yourself to exercise jobs:
#   curl -X POST localhost:8081/pubsub -H 'content-type: application/json' \
#     -d '{"message":{"data":"'$(echo -n '{"job_id":"<id>"}' | base64)'"}}'
```

Smoke test the API: `curl localhost:8080/healthz` → `{"ok": true}`.

## Deploy to Google Cloud

```bash
cp deploy/vars.env.example deploy/vars.env   # fill in
bash deploy/setup.sh                          # one-time: APIs, Firestore, bucket, topic, SAs, secret
bash deploy/deploy.sh                         # builds + deploys both services, wires Pub/Sub push
```

After the first deploy, add the printed `.../auth/google/callback` URL to the OAuth
client's **Authorized redirect URIs**, and deploy `firestore.rules` with the Firebase
CLI (`firebase deploy --only firestore:rules`).

## API walkthrough (happy path)

```
POST /presentations                         create
GET  /auth/google/start                     connect Google (opens consent URL)
POST /presentations/{pid}/sources           connect Drive files -> facts extracted
POST /presentations/{pid}/interview/message repeat until brief.complete
POST /presentations/{pid}/outline/propose   then PUT edits, POST /outline/approve
POST /presentations/{pid}/deck/build/{sectionId}   per section
POST /presentations/{pid}/deck/edit         conversational edits (voice via WS /live/builder/{pid})
GET  /presentations/{pid}/deck/dry-run      timing / unsourced-claim checks
POST /presentations/{pid}/deck/lock         -> immutable version N + export job
POST /presentations/{pid}/talks/start       then stream audio to WS /live/talk/{pid}/{tkid}
POST /presentations/{pid}/talks/{tkid}/stop -> post-talk pipeline (Slides, email, tasks, suggestions)
POST /presentations/{pid}/feedback          -> preference profile update
POST /presentations/{pid}/versions/{v}/branch   agent-generated variant
```

## Proof it runs on Google Cloud (for judging)

Show in the demo video: the two Cloud Run services in the console, the Pub/Sub
subscription delivering after Stop, worker logs, the exported deck appearing in Drive,
the Gmail recap arriving, and Cloud Trace spans for an end-to-end run.

## Cost control

Both services scale to zero (`--min-instances 0`). Gemini 3.5 Flash + Flash-Live keep
token costs low; images are generated only at build time. Delete the push subscription
and services after judging: `gcloud run services delete ...`.

---
*Inspired by voice-driven slide tools like ZeroPrep; Deckhand deliberately inverts the
live part (locked slides, listen-only agent) and owns the full before/after workflow.
Built from scratch on Gemini, ADK, and Google Cloud for this hackathon.*
