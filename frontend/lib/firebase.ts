"use client";

/**
 * Firebase sign-in (Google provider) for real user accounts.
 *
 * Configured via NEXT_PUBLIC_FIREBASE_* env vars; when they are absent the
 * whole feature quietly disables and invite-link guest identity carries the
 * session instead. On sign-in the ID token is fed to the API client, which
 * always prefers a bearer token over guest headers.
 *
 * Setup (Firebase console, same GCP project):
 *   1. Build -> Authentication -> Sign-in method -> enable Google.
 *   2. Project settings -> Your apps -> Web app -> copy the config values into
 *      frontend/.env.local as NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN /
 *      _PROJECT_ID / _APP_ID.
 */
import { setAuthToken } from "@/lib/api";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.appId);

type AuthUser = { displayName: string | null; email: string | null };
type Listener = (user: AuthUser | null) => void;

let started = false;
const listeners = new Set<Listener>();
let lastUser: AuthUser | null = null;

async function ensureStarted() {
  if (started || !firebaseConfigured) return;
  started = true;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth, onIdTokenChanged } = await import("firebase/auth");
  const app = getApps()[0] ?? initializeApp(config);
  onIdTokenChanged(getAuth(app), async (user) => {
    setAuthToken(user ? await user.getIdToken() : null);
    lastUser = user ? { displayName: user.displayName, email: user.email } : null;
    listeners.forEach((fn) => fn(lastUser));
  });
}

export function watchAuth(fn: Listener): () => void {
  listeners.add(fn);
  fn(lastUser);
  void ensureStarted();
  return () => listeners.delete(fn);
}

export async function signIn(): Promise<void> {
  await ensureStarted();
  const { getAuth, signInWithPopup, GoogleAuthProvider } = await import("firebase/auth");
  await signInWithPopup(getAuth(), new GoogleAuthProvider());
}

export async function signOutUser(): Promise<void> {
  const { getAuth, signOut } = await import("firebase/auth");
  await signOut(getAuth());
}
