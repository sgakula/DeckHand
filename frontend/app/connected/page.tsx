"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./connected.module.css";

/**
 * OAuth landing page. The consent flow redirects here inside a popup; we tell the
 * opener so it can re-check status, then close.
 */
export default function ConnectedPage() {
  useEffect(() => {
    try {
      window.opener?.postMessage("deckhand:google-connected", window.location.origin);
    } catch {
      /* opener is gone or cross-origin — the manual link below still works */
    }
    const timer = setTimeout(() => window.close(), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>
        <Icon name="checkCircle" size={30} />
      </div>
      <h1 className={styles.title}>Google connected</h1>
      <p className={styles.body}>
        Deckhand can now read your Drive files and, after a talk, export to Slides and send the
        recap. You can close this window.
      </p>
      <Link className={styles.link} href="/">
        Back to Deckhand
      </Link>
    </div>
  );
}
