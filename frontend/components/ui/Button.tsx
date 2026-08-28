"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "tonal" | "danger" | "dangerGhost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pending?: boolean;
  iconOnly?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  iconOnly = false,
  leading,
  trailing,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    styles.btn,
    styles[variant],
    size !== "md" && styles[size],
    iconOnly && styles.iconOnly,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} disabled={disabled || pending} {...rest}>
      {pending ? <span className={styles.spinner} aria-hidden /> : leading}
      {!iconOnly && children != null && <span className={styles.label}>{children}</span>}
      {!pending && trailing}
    </button>
  );
}
