import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        {eyebrow != null && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.title}>{title}</h1>
        {description != null && <p className={styles.description}>{description}</p>}
      </div>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  actions,
  first = false,
}: {
  title: ReactNode;
  actions?: ReactNode;
  first?: boolean;
}) {
  return (
    <div className={[styles.section, first && styles.sectionFirst].filter(Boolean).join(" ")}>
      <span className={styles.sectionTitle}>{title}</span>
      <span className={styles.sectionRule} aria-hidden />
      {actions != null && <span className={styles.sectionActions}>{actions}</span>}
    </div>
  );
}
