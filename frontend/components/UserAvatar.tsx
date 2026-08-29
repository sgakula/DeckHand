"use client";

import { useEffect, useState } from "react";

import { guestName } from "@/lib/identity";
import { watchAuth } from "@/lib/firebase";
import styles from "./AppHeader.module.css";

/** The signed-in person's initial — Firebase account first, guest name second.
 * Renders nothing until an identity exists, so it never shows a made-up letter. */
export function UserAvatar() {
  const [label, setLabel] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    const applyGuest = () => {
      const name = guestName();
      if (name) {
        setLabel(name[0].toUpperCase());
        setTitle(name);
      }
    };
    applyGuest();
    const unsub = watchAuth((user) => {
      if (user?.displayName || user?.email) {
        const shown = user.displayName ?? user.email ?? "";
        setLabel(shown[0]?.toUpperCase() ?? "");
        setTitle(shown);
      } else {
        applyGuest();
      }
    });
    return unsub;
  }, []);

  if (!label) return null;
  return (
    <span className={styles.avatar} title={title}>
      {label}
    </span>
  );
}
