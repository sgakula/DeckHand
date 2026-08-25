import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

export function Badge({
  tone = "neutral",
  pill = false,
  dot = false,
  live = false,
  children,
}: {
  tone?: BadgeTone;
  pill?: boolean;
  /** Leading status dot. */
  dot?: boolean;
  /** Pulse the dot, for genuinely live state. */
  live?: boolean;
  children: ReactNode;
}) {
  const classes = [styles.badge, styles[tone], pill && styles.pill, live && styles.live]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes}>
      {(dot || live) && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  );
}
