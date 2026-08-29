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
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types as gt

from ..agents.images import client as genai_client
from ..agents.notetaker import take_notes
from ..config import settings
from ..firestore import append_talk_data, get_presentation, get_talk, get_version

router = APIRouter(prefix="/live", tags=["live"])
log = logging.getLogger(__name__)

NOTE_WINDOW_SECONDS = 30


def _live_config(system_instruction: str) -> gt.LiveConnectConfig:
    return gt.LiveConnectConfig(
        response_modalities=[gt.Modality.TEXT],
        system_instruction=system_instruction,
        input_audio_transcription=gt.AudioTranscriptionConfig(),
    )


from ..transcribe import transcribe_pcm as _transcribe_pcm

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
             "window": [], "audio": bytearray(),
             "window_start": time.monotonic(), "t0": time.monotonic(),
             "notes": list(talk.notes)}

    async def flush_window():
        text = " ".join(state["window"]).strip()
        state["window"] = []
        audio = bytes(state["audio"])
        state["audio"] = bytearray()
        offset = state["window_start"] - state["t0"]
        state["window_start"] = time.monotonic()
        if not text:
            # Live captions came up empty for this window; transcribe the raw
            # audio we buffered so the note-taker never goes blind.
            text = await _transcribe_pcm(audio)
            if text:
                try:
                    await ws.send_json({"type": "transcript", "text": text})
                except Exception:  # noqa: BLE001
                    pass
        if not text:
            return
        # Persist the transcript first: Firestore is the ground truth the
        # post-talk pipeline reads, and it must survive a dropped browser.
        try:
            append_talk_data(pid, tkid, text, [])
        except Exception:  # noqa: BLE001
            log.exception("saving transcript window failed")
        try:
            notes = await take_notes(p.owner_uid, deck, p.outline, state["notes"], text,
                                     state["slide_id"], offset)
        except Exception:  # noqa: BLE001
            log.exception("note-taker failed on window")
            return
        if notes:
            state["notes"].extend(notes)
            try:
                append_talk_data(pid, tkid, None, [n.model_dump() for n in notes])
            except Exception:  # noqa: BLE001
                log.exception("saving notes failed")
            try:
                await ws.send_json({"type": "notes",
                                    "notes": [n.model_dump(mode="json") for n in notes]})
            except Exception:  # noqa: BLE001 - browser gone; notes are already saved
                pass

    try:
        async with genai_client().aio.live.connect(
            model=s.gemini_live_model, config=_live_config(TALK_SYSTEM)
        ) as session:

            async def pump_up():
                while True:
                    msg = await ws.receive()
                    if msg.get("bytes") is not None:
                        state["audio"] += msg["bytes"]
                        # Long window with no live captions: flush anyway so the
                        # fallback transcription keeps notes flowing mid-talk.
                        if (not state["window"]
                                and time.monotonic() - state["window_start"] > NOTE_WINDOW_SECONDS
                                and len(state["audio"]) > 320_000):
                            asyncio.create_task(flush_window())
                        try:
                            await session.send_realtime_input(
                                audio=gt.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000"))
                        except Exception:  # noqa: BLE001 - keep buffering regardless
                            pass
                    elif msg.get("text") is not None:
                        data = json.loads(msg["text"])
                        if data.get("type") == "slide":
                            state["slide_id"] = data.get("slide_id", state["slide_id"])
                        elif data.get("type") == "end":
                            # Drain: tell Gemini the audio is over, give its final
                            # transcription a moment to arrive (pump_down is still
                            # relaying), then flush the last notes and close.
                            try:
                                await session.send_realtime_input(audio_stream_end=True)
                            except Exception:  # noqa: BLE001 - session may be done
                                pass
                            await asyncio.sleep(5)
                            await flush_window()
                            return

            async def pump_down():
                try:
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
                except Exception:  # noqa: BLE001
                    log.exception("talk pump_down died")
                    raise

            # Only the CLIENT ends a talk. The Gemini session finishing its turn
            # (or dying) must not tear the socket down: audio keeps buffering and
            # the fallback transcription keeps the notes flowing.
            down = asyncio.create_task(pump_down())
            try:
                await pump_up()
            finally:
                down.cancel()
            try:
                await ws.close()
            except Exception:  # noqa: BLE001 - already closed by the client
                pass
    except WebSocketDisconnect:
        await flush_window()


SESSION_SYSTEM = (
    "You are a silent transcription listener in a working session. Never reply "
    "with any text."
)


@router.websocket("/session/{wid}")
async def session_ws(ws: WebSocket, wid: str):
    """Workspace mic through Gemini Live: streams captions as people speak and
    emits one `utterance` per natural pause. The client posts each utterance to
    /workspaces/{wid}/utterance itself (keeping its own name and noise rules).

    server -> client: {"type": "transcript", "text"}   caption fragment
                      {"type": "utterance", "text"}    a finished thought
    client -> server: binary PCM16@16kHz | {"type": "end"}
    """
    from ..workspaces import get_workspace

    await ws.accept()
    if get_workspace(wid) is None:
        await ws.close(code=4404)
        return
    s = settings()

    state = {"window": [], "audio": bytearray(), "last_caption": 0.0}
    PAUSE_SECONDS = 1.6          # a breath ends the utterance
    FALLBACK_AUDIO_SECONDS = 8   # no captions at all -> transcribe the PCM

    async def emit(text: str):
        text = text.strip()
        if text:
            await ws.send_json({"type": "utterance", "text": text})

    async def flush(force_fallback: bool = False):
        text = " ".join(state["window"]).strip()
        state["window"] = []
        audio = bytes(state["audio"])
        state["audio"] = bytearray()
        if not text and (force_fallback or audio):
            text = await _transcribe_pcm(audio)
        await emit(text)

    try:
        async with genai_client().aio.live.connect(
            model=s.gemini_live_model, config=_live_config(SESSION_SYSTEM)
        ) as session:

            async def pump_up():
                while True:
                    msg = await ws.receive()
                    if msg.get("bytes") is not None:
                        state["audio"] += msg["bytes"]
                        if (not state["window"]
                                and len(state["audio"]) > FALLBACK_AUDIO_SECONDS * 32000):
                            asyncio.create_task(flush())
                        try:
                            await session.send_realtime_input(
                                audio=gt.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000"))
                        except Exception:  # noqa: BLE001 - fallback keeps working
                            pass
                    elif msg.get("text") is not None:
                        if json.loads(msg["text"]).get("type") == "end":
                            try:
                                await session.send_realtime_input(audio_stream_end=True)
                            except Exception:  # noqa: BLE001
                                pass
                            await asyncio.sleep(3)
                            await flush()
                            return

            async def pump_down():
                try:
                    async for resp in session.receive():
                        sc = resp.server_content
                        if sc is None:
                            continue
                        if sc.input_transcription and sc.input_transcription.text:
                            state["window"].append(sc.input_transcription.text)
                            state["last_caption"] = time.monotonic()
                            state["audio"] = bytearray()   # captions cover this audio
                            await ws.send_json({"type": "transcript",
                                                "text": sc.input_transcription.text})
                except Exception:  # noqa: BLE001
                    log.exception("session pump_down died; PCM fallback continues")

            async def pause_watch():
                # A pause in the captions means the thought is finished.
                while True:
                    await asyncio.sleep(0.4)
                    if state["window"] and time.monotonic() - state["last_caption"] > PAUSE_SECONDS:
                        await flush()

            down = asyncio.create_task(pump_down())
            watch = asyncio.create_task(pause_watch())
            try:
                await pump_up()
            finally:
                down.cancel()
                watch.cancel()
            try:
                await ws.close()
            except Exception:  # noqa: BLE001
                pass
    except WebSocketDisconnect:
        pass
