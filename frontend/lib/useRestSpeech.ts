"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Mic capture that works on EVERY Chromium browser, including Brave, whose
 * SpeechRecognition API exists but silently returns nothing. Audio is captured
 * as 16 kHz PCM16 via an AudioWorklet and flushed every few seconds to a
 * callback; the caller ships it to the backend's /transcribe endpoint where
 * Gemini turns it into text.
 */

const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-tap-rest", PcmTap);
`;

function floatTo16(float: Float32Array): Int16Array {
  const out = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function toBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

export function useRestSpeech({
  onAudio,
  windowSeconds = 7,
}: {
  /** Called with base64 PCM every `windowSeconds` while listening (and once on stop). */
  onAudio: (pcmBase64: string) => void | Promise<void>;
  windowSeconds?: number;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const onAudioRef = useRef(onAudio);
  onAudioRef.current = onAudio;

  const supported =
    typeof window !== "undefined" && typeof AudioWorkletNode !== "undefined";

  const flush = useCallback(() => {
    const parts = chunks.current;
    chunks.current = [];
    const total = parts.reduce((n, c) => n + c.length, 0);
    if (total < 8000) return; // under half a second: skip
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of parts) {
      merged.set(c, off);
      off += c.length;
    }
    void onAudioRef.current(toBase64(floatTo16(merged)));
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    flush();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    setListening(false);
  }, [flush]);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (listening) return;
    setError(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = mic;
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      ctx.current = audioCtx;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await audioCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const tap = new AudioWorkletNode(audioCtx, "pcm-tap-rest");
      audioCtx.createMediaStreamSource(mic).connect(tap);
      const mute = audioCtx.createGain();
      mute.gain.value = 0;
      tap.connect(mute).connect(audioCtx.destination);
      tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
        chunks.current.push(e.data);
      };
      timer.current = setInterval(flush, windowSeconds * 1000);
      setListening(true);
    } catch (err) {
      stop();
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission was denied"
          : err instanceof Error
            ? err.message
            : "Could not start the microphone",
      );
    }
  }, [listening, flush, stop, windowSeconds]);

  return { supported, listening, error, start, stop, interim: "" };
}
