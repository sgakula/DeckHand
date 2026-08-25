import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Generating.module.css";

/**
 * Wraps whatever the agent is currently rewriting. Inactive it costs nothing —
 * no extra element, no animation — so it is safe to leave in place.
 */
export function GenerativeFrame({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[active && styles.frame, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/** "Building slides…" with a sweep across the text, the way agent tools signal work. */
export function ShimmerLabel({
  children,
  icon = true,
}: {
  children: ReactNode;
  icon?: boolean;
}) {
  return (
    <span className={styles.shimmer} role="status">
      {icon && <Icon name="sparkle" size={15} className={styles.sparkle} />}
      {children}
    </span>
  );
}

export interface AgentStep {
  label: string;
  state: "pending" | "active" | "done";
}

/** A short visible trace of what the agent is doing, in order. */
export function AgentSteps({ steps }: { steps: AgentStep[] }) {
  return (
    <div className={styles.steps}>
      {steps.map((step) => (
        <div
          key={step.label}
          className={[
            styles.step,
            step.state === "active" && styles.stepActive,
            step.state === "done" && styles.stepDone,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.stepDot}>
            {step.state === "done" && <Icon name="check" size={10} />}
          </span>
          {step.label}
        </div>
      ))}
    </div>
  );
}
