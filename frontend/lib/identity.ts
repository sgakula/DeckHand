"use client";

/**
 * Lightweight guest identity for invite-link collaboration.
 *
 * Every browser gets a stable random id (localStorage) plus a display name the
 * person picks the first time they join a session. The API accepts these as
 * X-Guest-Id / X-Guest-Name headers (see backend/app/deps.py). Signing in with
 * Firebase (lib/firebase.ts) supersedes this: a bearer token always wins.
 */

const ID_KEY = "deckhand.guest.id";
const NAME_KEY = "deckhand.guest.name";

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function guestId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function guestName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setGuestName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 40));
  } catch {
    /* private mode: identity lives for the tab only */
  }
}
