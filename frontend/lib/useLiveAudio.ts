"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TalkNote } from "@/lib/types";

/**
 * Gemini Live audio path for the talk: mic (and optionally a shared tab's
 * audio, e.g. a Google Meet call) → 16 kHz PCM16 → the backend's
 * /live/talk WebSocket. The backend transcribes, runs the note-taker, and
 * streams back `transcript`, `notes`, and (optional) `navigate` events.
 *
 * This is the preferred capture path; useSpeech (browser STT → transcript
 * POST) remains the fallback for browsers without AudioWorklet support.
 * Protocol reference: backend/app/routers/live.py docstring.
 */

const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-tap", PcmTap);
`;

const SEND_SAMPLES = 3200; // 200ms @ 16kHz per frame — small enough to feel live

function floatTo16(float: Float32Array): Int16Array {
  const out = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export interface LiveAudioHandle {
  /** True when AudioWorklet + WebSocket are available in this browser. */
  supported: boolean;
  /** True while capturing and streaming. */
  active: boolean;
  /** True when the started capture includes a shared tab's audio. */
  tabAudio: boolean;
  error: string | null;
  /** Rolling transcription of the current window (for a live caption). */
  caption: string;
  start: (opts?: { includeTabAudio?: boolean }) => Promise<void>;
  stop: () => void;
  /** Tell the note-taker which slide is on screen. */
  setSlide: (slideId: string) => void;
}

export function useLiveAudio({
  wsUrl,
  onNotes,
  onNavigate,
  onUtterance,
}: {
  /** Socket URL for the running talk/session, or null when there is none yet. */
  wsUrl: string | null;
  onNotes?: (notes: TalkNote[]) => void;
  /** Hands-free "next slide" cue from the backend. Optional by design. */
  onNavigate?: () => void;
  /** Session mode: a finished thought, ready to send as an utterance. */
  onUtterance?: (text: string) => void;
}): LiveAudioHandle {
  const [active, setActive] = useState(false);
  const [tabAudio, setTabAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const pending = useRef<Float32Array[]>([]);
  const pendingLen = useRef(0);
  const captionRef = useRef<string[]>([]);

  const supported =
    typeof window !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof WebSocket !== "undefined";

  const stop = useCallback(() => {
    try {
      ws.current?.readyState === WebSocket.OPEN &&
        ws.current.send(JSON.stringify({ type: "end" }));
    } catch {
      /* closing anyway */
    }
    ws.current?.close();
    ws.current = null;
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    pending.current = [];
    pendingLen.current = 0;
    setActive(false);
    setTabAudio(false);
  }, []);

  useEffect(() => stop, [stop]); // tear down on unmount

  const start = useCallback(
    async (opts?: { includeTabAudio?: boolean }) => {
      if (!wsUrl || active) return;
      setError(null);
      try {
        // 1) capture sources
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streams.current = [mic];
        let tab: MediaStream | null = null;
        if (opts?.includeTabAudio) {
          // Chrome/Edge: user picks the Meet tab with "share tab audio" on.
          const display = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          display.getVideoTracks().forEach((t) => t.stop()); // audio only
          if (display.getAudioTracks().length > 0) {
            tab = display;
            streams.current.push(display);
          }
        }

        // 2) mix to one 16kHz mono PCM stream
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        ctx.current = audioCtx;
        const workletUrl = URL.createObjectURL(
          new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
        );
        await audioCtx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);
        const tapNode = new AudioWorkletNode(audioCtx, "pcm-tap");
        audioCtx.createMediaStreamSource(mic).connect(tapNode);
        if (tab) audioCtx.createMediaStreamSource(tab).connect(tapNode);
        // Keep the graph alive without feeding audio back to the speakers.
        const mute = audioCtx.createGain();
        mute.gain.value = 0;
        tapNode.connect(mute).connect(audioCtx.destination);

        // 3) socket
        const socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";
        ws.current = socket;
        socket.onmessage = (e) => {
          if (typeof e.data !== "string") return;
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "transcript" && msg.text) {
              captionRef.current = [...captionRef.current.slice(-30), msg.text];
              setCaption(captionRef.current.join(""));
            } else if (msg.type === "notes" && Array.isArray(msg.notes)) {
              captionRef.current = [];
              setCaption("");
              onNotes?.(msg.notes as TalkNote[]);
            } else if (msg.type === "navigate") {
              onNavigate?.();
            } else if (msg.type === "utterance" && msg.text) {
              captionRef.current = [];
              setCaption("");
              onUtterance?.(msg.text as string);
            }
          } catch {
            /* non-JSON frame: ignore */
          }
        };
        socket.onerror = () => setError("Live audio connection failed");
        socket.onclose = (e) => {
          if (e.code === 4409) setError("Talk is not live or the deck is not locked");
          if (ws.current === socket) stop();
        };

        tapNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          pending.current.push(e.data);
          pendingLen.current += e.data.length;
          if (pendingLen.current >= SEND_SAMPLES) {
            const merged = new Float32Array(pendingLen.current);
            let off = 0;
            for (const chunk of pending.current) {
              merged.set(chunk, off);
              off += chunk.length;
            }
            pending.current = [];
            pendingLen.current = 0;
            socket.send(floatTo16(merged).buffer);
          }
        };

        setTabAudio(tab != null);
        setActive(true);
      } catch (err) {
        stop();
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone permission was denied"
            : err instanceof Error
              ? err.message
              : "Could not start live audio",
        );
      }
    },
    [wsUrl, active, onNotes, onNavigate, onUtterance, stop],
  );

  const setSlide = useCallback((slideId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "slide", slide_id: slideId }));
    }
  }, []);

  return { supported, active, tabAudio, error, caption, start, stop, setSlide };
}
