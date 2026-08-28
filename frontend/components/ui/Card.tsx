import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

type Pad = "none" | "sm" | "md" | "lg";

const padClass: Record<Pad, string | false> = {
  none: false,
  sm: styles.padSm,
  md: styles.pad,
  lg: styles.padLg,
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: Pad;
  raised?: boolean;
  interactive?: boolean;
  selected?: boolean;
}

export function Card({
  pad = "md",
  raised = false,
  interactive = false,
  selected = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    padClass[pad],
    raised && styles.raised,
    interactive && styles.interactive,
    selected && styles.selected,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <div className={styles.title}>{title}</div>
        {subtitle != null && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
