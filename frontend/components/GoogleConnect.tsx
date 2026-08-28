"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { Icon } from "./ui/Icon";
import { useToast } from "./ui/Toast";
import styles from "./AppHeader.module.css";

/**
 * Google Workspace consent status. The backend holds the refresh token; the popup
 * lands on /connected, which posts back to this window so we can re-check.
 */
export function GoogleConnect() {
  const [nonce, setNonce] = useState(0);
  const status = useResource((init) => api.googleStatus(init), [nonce]);
  const action = useAction();
  const toast = useToast();

  // The OAuth popup broadcasts when it lands on /connected.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === "deckhand:google-connected") {
        setNonce((n) => n + 1);
        toast.success("Google Workspace connected");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [toast]);

  const connect = async () => {
    const result = await action.run(() => api.googleAuthUrl());
    if (result) window.open(result.auth_url, "deckhand-google-oauth", "width=520,height=680");
    else if (action.error) toast.error(action.error);
  };

  // Say nothing until we know — a "Connect" button that might be wrong is worse
  // than a beat of silence in the header.
  if (status.loading) return null;

  if (status.data?.connected) {
    return (
      <span
        className={`${styles.connect} ${styles.connected}`}
        title="Drive, Slides, Gmail and Calendar are connected"
      >
        <span className={styles.statusDot} aria-hidden />
        Google connected
      </span>
    );
  }

  return (
    <button type="button" className={styles.connect} onClick={connect} disabled={action.pending}>
      <Icon name="google" size={15} />
      {action.pending ? "Opening…" : "Connect Google"}
    </button>
  );
}
