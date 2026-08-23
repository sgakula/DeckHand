"""Gemini Live broker (WebSocket). Two modes, credentials never leave the server.

  /live/builder/{pid}   - Phase 1b voice commands: audio in -> transcribed edit
                          request out (the client then POSTs it to /deck/edit).
  /live/talk/{pid}/{tkid} - Phase 2 listen-only: audio in -> transcript windows ->
                          note-taker agent -> notes streamed back + saved. The ONLY
                          screen action ever emitted is {"type": "navigate"}.

Browser protocol (JSON text frames + binary audio frames):
  client -> server:  binary = 16-bit PCM 16kHz mono audio chunk
                     text   = {"type": "slide", "slide_id": "..."} (talk mode: current slide)
                              {"type": "end"}
  server -> client:  {"type": "transcript", "text": ...}
                     {"type": "edit_request", "text": ...}          (builder mode)
                     {"type": "notes", "notes": [...]}              (talk mode)
                     {"type": "navigate", "direction": "next"}      (talk mode, optional)
"""
import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types as gt

from ..agents.images import client as genai_client
from ..agents.notetaker import take_notes
from ..config import settings
from ..firestore import append_talk_data, get_presentation, get_talk, get_version

router = APIRouter(prefix="/live", tags=["live"])

NOTE_WINDOW_SECONDS = 30


def _live_config(system_instruction: str) -> gt.LiveConnectConfig:
    return gt.LiveConnectConfig(
        response_modalities=[gt.Modality.TEXT],
        system_instruction=system_instruction,
        input_audio_transcription=gt.AudioTranscriptionConfig(),
    )


BUILDER_SYSTEM = (
    "You are a voice-command transcriber for a slide builder. The user speaks edit "
    "commands. Repeat back ONLY the cleaned-up edit request as one imperative "
    "sentence, nothing else."
)

TALK_SYSTEM = (
    "You are a silent listener in a live presentation. Transcription is handled "
    "automatically. Reply ONLY with the single word NEXT when the speaker has clearly "
    "finished the current topic and moved to the next one; otherwise reply nothing."
)


@router.websocket("/builder/{pid}")
async def builder_ws(ws: WebSocket, pid: str):
    await ws.accept()
    s = settings()
    try:
        async with genai_client().aio.live.connect(
            model=s.gemini_live_model, config=_live_config(BUILDER_SYSTEM)
        ) as session:

            async def pump_up():
                while True:
                    msg = await ws.receive()
                    if msg.get("bytes") is not None:
                        await session.send_realtime_input(
                            audio=gt.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000"))
                    elif msg.get("text") is not None:
                        if json.loads(msg["text"]).get("type") == "end":
                            return

            async def pump_down():
                async for resp in session.receive():
                    sc = resp.server_content
                    if sc is None:
                        continue
                    if sc.input_transcription and sc.input_transcription.text:
                        await ws.send_json({"type": "transcript",
                                            "text": sc.input_transcription.text})
                    if sc.model_turn:
                        text = "".join(p.text or "" for p in (sc.model_turn.parts or []))
                        if text.strip():
                            await ws.send_json({"type": "edit_request", "text": text.strip()})

            up = asyncio.create_task(pump_up())
            down = asyncio.create_task(pump_down())
            _, pending = await asyncio.wait({up, down}, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
    except WebSocketDisconnect:
        pass


@router.websocket("/talk/{pid}/{tkid}")
async def talk_ws(ws: WebSocket, pid: str, tkid: str):
    await ws.accept()
    s = settings()
    p = get_presentation(pid)
    talk = get_talk(pid, tkid)
    if p is None or talk is None or talk.status != "live":
        await ws.close(code=4409)
        return
    deck = get_version(pid, talk.version)
    if deck is None or not deck.locked:
        await ws.close(code=4409)
        return

    state = {"slide_id": deck.slides[0].id if deck.slides else "",
             "window": [], "window_start": time.monotonic(), "t0": time.monotonic(),
             "notes": list(talk.notes)}

    async def flush_window():
        text = " ".join(state["window"]).strip()
        state["window"] = []
        offset = state["window_start"] - state["t0"]
        state["window_start"] = time.monotonic()
        if not text:
            return
        notes = await take_notes(p.owner_uid, deck, p.outline, state["notes"], text,
                                 state["slide_id"], offset)
        if notes:
            state["notes"].extend(notes)
            append_talk_data(pid, tkid, text, [n.model_dump() for n in notes])
            await ws.send_json({"type": "notes", "notes": [n.model_dump(mode="json") for n in notes]})
        else:
            append_talk_data(pid, tkid, text, [])

    try:
        async with genai_client().aio.live.connect(
            model=s.gemini_live_model, config=_live_config(TALK_SYSTEM)
        ) as session:

            async def pump_up():
                while True:
                    msg = await ws.receive()
                    if msg.get("bytes") is not None:
                        await session.send_realtime_input(
                            audio=gt.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000"))
                    elif msg.get("text") is not None:
                        data = json.loads(msg["text"])
                        if data.get("type") == "slide":
                            state["slide_id"] = data.get("slide_id", state["slide_id"])
                        elif data.get("type") == "end":
                            await flush_window()
                            return

            async def pump_down():
                async for resp in session.receive():
                    sc = resp.server_content
                    if sc is None:
                        continue
                    if sc.input_transcription and sc.input_transcription.text:
                        state["window"].append(sc.input_transcription.text)
                        await ws.send_json({"type": "transcript",
                                            "text": sc.input_transcription.text})
                        if time.monotonic() - state["window_start"] > NOTE_WINDOW_SECONDS:
                            asyncio.create_task(flush_window())
                    if sc.model_turn:
                        text = "".join(pt.text or "" for pt in (sc.model_turn.parts or []))
                        if "NEXT" in text:   # hands-free navigation; client may ignore
                            await ws.send_json({"type": "navigate", "direction": "next"})

            up = asyncio.create_task(pump_up())
            down = asyncio.create_task(pump_down())
            _, pending = await asyncio.wait({up, down}, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
    except WebSocketDisconnect:
        await flush_window()
