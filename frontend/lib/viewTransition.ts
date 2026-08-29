"use client";

import { flushSync } from "react-dom";

type DocumentWithVT = Document & {
  startViewTransition?: (callback: () => void) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
};

/**
 * Runs a React state update inside a View Transition so the browser can morph
 * between the two layouts. flushSync is required: the transition snapshots the
 * DOM when the callback returns, so the update has to be applied by then.
 *
 * Degrades to a plain update where the API is missing or motion is unwanted.
 */
export function withViewTransition(update: () => void) {
  const doc = document as DocumentWithVT;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!doc.startViewTransition || reduced) {
    update();
    return;
  }
  const transition = doc.startViewTransition(() => flushSync(update));
  // A transition interrupted by the next update rejects these promises
  // ("Transition was aborted because of invalid state"). That is normal in a
  // fast-moving session; swallow it so it never surfaces as an unhandledRejection.
  transition.finished.catch(() => undefined);
  transition.ready.catch(() => undefined);
  transition.updateCallbackDone.catch(() => undefined);
}
