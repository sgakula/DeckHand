import type { CSSProperties, ReactNode } from "react";
import styles from "./Status.module.css";

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 10)) }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingBlock({ label = "Loading…", size = 24 }: { label?: string; size?: number }) {
  return (
    <div className={styles.center}>
      <Spinner size={size} />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({
  width,
  height = 14,
  radius,
  style,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      style={{ display: "block", width: width ?? "100%", height, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actions,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={[styles.empty, compact && styles.emptyCompact].filter(Boolean).join(" ")}>
      {icon != null && <div className={styles.emptyIcon}>{icon}</div>}
      <div className={styles.emptyTitle}>{title}</div>
      {body != null && <div className={styles.emptyBody}>{body}</div>}
      {actions != null && <div className={styles.emptyActions}>{actions}</div>}
    </div>
  );
}

const alertIcons: Record<string, ReactNode> = {
  danger: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.2 14.4 13.4H1.6L8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.85" fill="currentColor" />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5.2 8.2 2 2 3.6-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.4v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.9" fill="currentColor" />
    </svg>
  ),
};

export function Alert({
  tone = "info",
  title,
  children,
  actions,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const toneClass = {
    danger: styles.alertDanger,
    warning: styles.alertWarning,
    success: styles.alertSuccess,
    info: styles.alertInfo,
  }[tone];

  return (
    <div className={[styles.alert, toneClass].join(" ")} role={tone === "danger" ? "alert" : undefined}>
      <span className={styles.alertIcon}>{alertIcons[tone]}</span>
      <div className={styles.alertBody}>
        {title != null && <div className={styles.alertTitle}>{title}</div>}
        {children}
      </div>
      {actions != null && <div className={styles.alertActions}>{actions}</div>}
    </div>
  );
}
