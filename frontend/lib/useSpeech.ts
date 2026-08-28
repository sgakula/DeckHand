"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Capability support never changes within a session, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};

/**
 * Browser speech-to-text for the talk's transcript path.
 *
 * The backend also exposes a Gemini Live WebSocket that takes raw PCM, but the
 * documented fallback — client-side STT posted as transcript windows — gives the
 * same note-taking behaviour without shipping audio, and degrades cleanly on
 * browsers with no SpeechRecognition.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech({
  onFinalText,
  windowSeconds = 25,
}: {
  /** Called with a batch of finalised speech every `windowSeconds`. */
  onFinalText: (text: string) => void;
  windowSeconds?: number;
}) {
  // Server renders "unsupported" and the client corrects it after hydration —
  // useSyncExternalStore is the sanctioned way to read a browser-only value
  // without a hydration mismatch.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const bufferRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wantListeningRef = useRef(false);
  const onFinalRef = useRef(onFinalText);
  useEffect(() => {
    onFinalRef.current = onFinalText;
  });

  const flush = useCallback(() => {
    const text = bufferRef.current.join(" ").trim();
    bufferRef.current = [];
    if (text) onFinalRef.current(text);
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
    flush();
  }, [flush]);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Use the transcript box instead.");
      return;
    }
    setError(null);
    wantListeningRef.current = true;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";

    rec.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          bufferRef.current.push(text.trim());
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      // "no-speech" and "aborted" are routine during a pause; don't alarm the user.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(
          e.error === "not-allowed"
            ? "Microphone permission was denied."
            : `Speech recognition error: ${e.error}`,
        );
      }
    };

    // Chrome ends the session on its own every so often; restart while still wanted.
    rec.onend = () => {
      if (wantListeningRef.current) {
        try {
          rec.start();
        } catch {
          /* already restarting */
        }
      }
    };

    try {
      rec.start();
    } catch {
      setError("Could not start the microphone.");
      return;
    }

    recognitionRef.current = rec;
    setListening(true);
    timerRef.current = setInterval(flush, windowSeconds * 1000);
  }, [flush, windowSeconds]);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  return { supported, listening, interim, error, start, stop, flush };
}
