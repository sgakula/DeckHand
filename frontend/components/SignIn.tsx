"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { firebaseConfigured, signIn, signOutUser, watchAuth } from "@/lib/firebase";

/** Google sign-in control. Renders nothing when Firebase isn't configured —
 * invite-link guest identity covers the demo in that case. */
export function SignIn() {
  const [user, setUser] = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchAuth(setUser), []);

  if (!firebaseConfigured) return null;

  if (user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        title={user.email ?? undefined}
        onClick={() => void signOutUser()}
      >
        {user.displayName ?? user.email ?? "Signed in"} · Sign out
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      pending={busy}
      onClick={() => {
        setBusy(true);
        void signIn().finally(() => setBusy(false));
      }}
    >
      Sign in
    </Button>
  );
}
