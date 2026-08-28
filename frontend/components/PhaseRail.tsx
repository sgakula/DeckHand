"use client";

import Link from "next/link";
import { phaseHref, type Phase } from "@/lib/phases";
import { Icon } from "./ui/Icon";
import styles from "./PhaseRail.module.css";

function Marker({ phase }: { phase: Phase }) {
  if (phase.status === "done") {
    return (
      <span className={styles.marker}>
        <Icon name="check" size={15} />
      </span>
    );
  }
  if (phase.status === "locked") {
    return (
      <span className={styles.marker}>
        <Icon name="lock" size={14} className={styles.lockIcon} />
      </span>
    );
  }
  return (
    <span className={styles.marker}>
      <Icon name={phase.icon} size={17} />
    </span>
  );
}

export function PhaseRail({ pid, phases }: { pid: string; phases: Phase[] }) {
  // "versions" is a side view, not a step, so it shouldn't count toward progress.
  const steps = phases.filter((p) => p.id !== "versions");
  const done = steps.filter((p) => p.complete).length;
  const pct = Math.round((done / steps.length) * 100);

  // Direction encodes movement through the flow, so the page slide matches the
  // rail: later phase slides in from the right, earlier from the left.
  const activeIndex = phases.findIndex((p) => p.status === "active");

  return (
    <nav className={styles.rail} aria-label="Presentation phases">
      <div className={styles.progress}>
        <div className={styles.progressRow}>
          <span>Progress</span>
          <span className={styles.progressCount}>
            {done}/{steps.length}
          </span>
        </div>
        <div className={styles.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {phases.map((phase, i) => {
        const direction = i > activeIndex ? "nav-forward" : "nav-back";
        const classes = [
          styles.item,
          phase.status === "active" && styles.active,
          phase.status === "done" && styles.done,
          phase.status === "locked" && styles.locked,
        ]
          .filter(Boolean)
          .join(" ");

        if (phase.status === "locked") {
          return (
            <span
              key={phase.id}
              className={classes}
              aria-disabled="true"
              aria-label={`${phase.label} — ${phase.blockedReason ?? "locked"}`}
              title={`${phase.label} — ${phase.blockedReason ?? "locked"}`}
            >
              <Marker phase={phase} />
              <span className={styles.label}>{phase.label}</span>
            </span>
          );
        }

        return (
          <Link
            key={phase.id}
            href={phaseHref(pid, phase.id)}
            transitionTypes={[direction]}
            className={classes}
            // The label is hidden in the collapsed rail, so name the link here too.
            title={phase.label}
            aria-label={phase.label}
            aria-current={phase.status === "active" ? "page" : undefined}
          >
            <Marker phase={phase} />
            <span className={styles.label}>{phase.label}</span>
            {phase.hint && <span className={styles.hint}>{phase.hint}</span>}
          </Link>
        );
      })}

      <div className={styles.spacer} />
      <div className={styles.footer}>
        <p className={styles.footerNote}>
          The agent edits slides only before the talk. During the talk it is listen-only.
        </p>
      </div>
    </nav>
  );
}
